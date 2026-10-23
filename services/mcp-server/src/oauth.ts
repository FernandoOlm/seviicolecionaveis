import { randomBytes, createHash } from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase.js';
import fs from 'fs';
import path from 'path';

export const PUBLIC_URL = (process.env.SEVII_PUBLIC_URL || 'https://tcgmind.com.br').replace(/\/$/, '');
export const mcpResource = (origin = PUBLIC_URL) => `${origin}/api/mcp`;
export const issuer = (origin = PUBLIC_URL) => `${origin}/api/mcp/oauth`;

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');

const authQuery = z.object({
  client_id: z.string(),
  redirect_uri: z.string().url(),
  response_type: z.literal('code'),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal('S256'),
  state: z.string().min(1).max(2000),
  resource: z.string().optional(),
  scope: z.string().optional(),
});

// Storage persistente local para OAuth
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'oauth_store.json');

interface OAuthStore {
  clients: Record<string, { id: string; redirectUris: string[]; name: string; createdAt: string }>;
  codes: Record<string, { id: string; userId: string; userEmail: string; clientId: string; redirectUri: string; challenge: string; resource: string; expiresAt: number }>;
  tokens: Record<string, { tokenHash: string; userId: string; userEmail: string; clientId: string; expiresAt: number }>;
  refreshes: Record<string, { refreshHash: string; userId: string; userEmail: string; clientId: string; resource: string; expiresAt: number }>;
}

function loadStore(): OAuthStore {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch {
    // fallback
  }
  return { clients: {}, codes: {}, tokens: {}, refreshes: {} };
}

function saveStore(store: OAuthStore) {
  try {
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('[OAuthStore] Erro ao persistir dados:', err);
  }
}

export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    // Codex desktop/CLI local callback
    if (parsed.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(parsed.hostname)
      && parsed.port !== '' && parsed.pathname === '/callback'
      && !parsed.username && !parsed.password && !parsed.search && !parsed.hash) {
      return true;
    }
    // ChatGPT web & mobile connectors
    if (parsed.protocol === 'https:' && (parsed.hostname === 'chatgpt.com' || parsed.hostname === 'chat.openai.com' || parsed.hostname.endsWith('.openai.com'))) {
      if (
        parsed.pathname === '/connector_platform_oauth_redirect' ||
        parsed.pathname === '/connector/oauth/redirect' ||
        parsed.pathname === '/aip/plugin-oauth/callback' ||
        parsed.pathname.includes('/callback') ||
        parsed.pathname.includes('/redirect') ||
        /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(parsed.pathname)
      ) {
        return true;
      }
    }
    // OpenAI Platform & Codex
    if (parsed.protocol === 'https:' && (parsed.hostname === 'platform.openai.com' || parsed.hostname === 'codex.openai.com')) {
      if (
        parsed.pathname === '/oauth/callback' ||
        parsed.pathname === '/connector_platform_oauth_redirect' ||
        /^\/oauth\/[A-Za-z0-9_-]+\/callback$/.test(parsed.pathname)
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

export function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || 'https://zuypkggpecsqormwculg.supabase.co';
  const key = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1eXBrZ2dwZWNzcW9ybXdjdWxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NDY4MDMsImV4cCI6MjA5MzUyMjgwM30.poDv3khFEu-Cg3v1zPwDr4k8CNuahn66hsb_rgq69n4';
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function oauthRoutes(app: FastifyInstance) {
  const attempts = new Map<string, { count: number; reset: number }>();

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/mcp/oauth/')) return;
    if (attempts.size > 10000) {
      for (const [key, value] of attempts) if (value.reset < Date.now()) attempts.delete(key);
    }
    const key = req.ip;
    const current = attempts.get(key);
    const entry = current && current.reset > Date.now() ? current : { count: 0, reset: Date.now() + 60000 };
    entry.count++;
    attempts.set(key, entry);
    if (entry.count > 45) {
      return reply.status(429).header('Retry-After', '60').send({ error: 'too_many_requests' });
    }
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer');
  });

  const getEffectiveOrigin = (req: FastifyRequest) => {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host && typeof host === 'string') {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      if (host.includes('tcgmind.com.br') || host.includes('testefol.com.br')) {
        return `${proto}://${host}`;
      }
    }
    return PUBLIC_URL;
  };

  const metadata = (req: FastifyRequest) => {
    const orig = getEffectiveOrigin(req);
    const iss = issuer(orig);
    return {
      issuer: iss,
      authorization_endpoint: `${iss}/authorize`,
      token_endpoint: `${iss}/token`,
      registration_endpoint: `${iss}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['sevi-colecionaveis'],
      authorization_response_iss_parameter_supported: true,
    };
  };

  app.get('/.well-known/oauth-authorization-server', async (req) => metadata(req));
  app.get('/.well-known/oauth-authorization-server/api/mcp/oauth', async (req) => metadata(req));

  const resourceMetadata = async (req: FastifyRequest) => {
    const orig = getEffectiveOrigin(req);
    return {
      resource: mcpResource(orig),
      authorization_servers: [issuer(orig)],
      bearer_methods_supported: ['header'],
      scopes_supported: ['sevi-colecionaveis'],
      resource_name: 'Sevii Colecionáveis',
    };
  };

  app.get('/.well-known/oauth-protected-resource', resourceMetadata);
  app.get('/.well-known/oauth-protected-resource/api/mcp', resourceMetadata);
  app.get('/.well-known/oauth-protected-resource/mcp', resourceMetadata);

  // Dynamic Client Registration (DCR)
  app.post('/api/mcp/oauth/register', async (req, reply) => {
    const body = z.object({
      redirect_uris: z.array(z.string().url()).min(1).max(5),
      client_name: z.string().max(100).optional(),
      token_endpoint_auth_method: z.literal('none').optional(),
      grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])).optional(),
      response_types: z.array(z.literal('code')).optional(),
    }).passthrough().parse(req.body);

    if (body.redirect_uris.some(uri => !isAllowedRedirectUri(uri))) {
      return reply.status(400).send({ error: 'invalid_redirect_uri' });
    }

    const clientId = random();
    const store = loadStore();
    store.clients[clientId] = {
      id: clientId,
      redirectUris: body.redirect_uris,
      name: body.client_name || 'ChatGPT Sevii Colecionáveis',
      createdAt: new Date().toISOString(),
    };
    saveStore(store);

    return reply.status(201).send({
      client_id: clientId,
      redirect_uris: body.redirect_uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  });

  // GET: Página de Autorização / Login HTML
  app.get('/api/mcp/oauth/authorize', async (req, reply) => {
    const query = authQuery.parse(req.query);
    const store = loadStore();
    const client = store.clients[query.client_id];

    if (!client || !client.redirectUris.includes(query.redirect_uri) || !isAllowedRedirectUri(query.redirect_uri)) {
      return reply.status(400).send({ error: 'invalid_request', message: 'Cliente não registrado ou redirect_uri inválida.' });
    }

    const orig = getEffectiveOrigin(req);
    const expectedRes = mcpResource(orig);
    if (query.resource && query.resource !== expectedRes && !query.resource.includes('/api/mcp')) {
      return reply.status(400).send({ error: 'invalid_request', message: 'Recurso inválido.' });
    }

    const transaction = app.jwt.sign(
      { ...query, purpose: 'mcp-consent', nonce: random(), orig } as any,
      { expiresIn: '15m' }
    );

    reply.setCookie('sevii_mcp_consent', transaction, {
      httpOnly: true,
      secure: orig.startsWith('https:'),
      sameSite: 'lax',
      path: '/api/mcp/oauth',
      maxAge: 900,
    });

    const nonce = random();
    reply.header(
      'Content-Security-Policy',
      `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src https: data:; connect-src 'self' ${orig}; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`
    );

    return reply.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Conectar Sevii Colecionáveis — ChatGPT</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #09090b;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 440px;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      padding: 32px 28px;
      box-shadow: 0 20px 40px -15px rgba(0,0,0,0.6);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }
    .badge {
      display: inline-block;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #e11d48;
      box-shadow: 0 0 12px #e11d48;
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.3px;
    }
    p.desc {
      color: #a1a1aa;
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .perm-box {
      background: #27272a;
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 13px;
      color: #e4e4e7;
      margin-bottom: 20px;
      line-height: 1.4;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #d4d4d8;
      margin-bottom: 6px;
      margin-top: 14px;
    }
    input {
      width: 100%;
      padding: 12px 14px;
      background: #09090b;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      color: #ffffff;
      font-size: 15px;
      outline: none;
      transition: border-color 0.15s;
    }
    input:focus {
      border-color: #e11d48;
    }
    button {
      width: 100%;
      margin-top: 24px;
      padding: 13px;
      background: #e11d48;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, opacity 0.15s;
    }
    button:hover:not(:disabled) {
      background: #be123c;
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    #error {
      color: #f87171;
      font-size: 13px;
      margin-top: 12px;
      min-height: 18px;
      text-align: center;
    }
    small {
      display: block;
      text-align: center;
      color: #71717a;
      font-size: 12px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <span class="badge"></span>
      <h1>Sevii Colecionáveis</h1>
    </div>
    <p class="desc">Autorize o ChatGPT a gerenciar sua loja com permissões completas de administrador.</p>
    
    <div class="perm-box">
      🔒 <strong>Acesso Administrativo:</strong> Catálogo de cartas e selados, fotos, criação e operação de leilões, pedidos e estoque.
    </div>

    <form id="consent">
      <label for="email">E-mail de Administrador</label>
      <input id="email" name="email" type="email" autocomplete="username" placeholder="admin@seviicolecionaveis.com.br" required autofocus>

      <label for="password">Senha</label>
      <input id="password" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required>

      <button id="btn" type="submit">Entrar e autorizar</button>
      <p id="error" role="alert"></p>
    </form>

    <small>Insira suas credenciais exclusivamente nesta tela segura do Sevii Colecionáveis.</small>
  </div>

  <script nonce="${nonce}">
    document.getElementById('consent').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      const btn = document.getElementById('btn');
      const err = document.getElementById('error');
      btn.disabled = true;
      btn.textContent = 'Autenticando...';
      err.textContent = '';

      try {
        const payload = Object.fromEntries(new FormData(f));
        const res = await fetch('/api/mcp/oauth/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Falha ao autenticar.');
        }
        btn.textContent = 'Conectado! Redirecionando...';
        location.assign(data.redirect);
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
        btn.textContent = 'Entrar e autorizar';
      }
    });
  </script>
</body>
</html>`);
  });

  // POST: Submissão do Formulário de Consentimento
  app.post('/api/mcp/oauth/authorize', async (req, reply) => {
    let transaction: z.infer<typeof authQuery> & { purpose: string; orig?: string };
    try {
      const cookieVal = req.cookies.sevii_mcp_consent || '';
      transaction = app.jwt.verify(cookieVal);
      if (transaction.purpose !== 'mcp-consent') throw new Error();
    } catch {
      return reply.status(400).send({ error: 'A autorização expirou. Reinicie a conexão pelo ChatGPT.' });
    }

    const credentials = z.object({
      email: z.string().email(),
      password: z.string().min(1).max(200),
    }).strict().parse(req.body);

    const supabase = getSupabaseClient();

    // 1. Autentica no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: credentials.email.toLowerCase().trim(),
      password: credentials.password,
    });

    if (authError || !authData?.user) {
      return reply.status(401).send({ error: 'E-mail ou senha inválidos no Sevii Colecionáveis.' });
    }

    const userId = authData.user.id;
    const userEmail = authData.user.email || credentials.email;

    // 2. Valida papel de administrador no banco
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    const isSuperAdmin = userEmail.toLowerCase() === 'contato@seviicolecionaveis.com.br';

    if (!isSuperAdmin && (roleError || !roleData)) {
      return reply.status(403).send({ error: 'Acesso restrito: esta conta não possui privilégios de administrador no Sevii Colecionáveis.' });
    }

    // 3. Gera código de uso único (expira em 2 minutos)
    const code = random();
    const orig = transaction.orig || getEffectiveOrigin(req);
    const store = loadStore();

    // Remove códigos expirados
    const now = Date.now();
    for (const [k, v] of Object.entries(store.codes)) {
      if (v.expiresAt < now) delete store.codes[k];
    }

    store.codes[hash(code)] = {
      id: hash(code),
      userId,
      userEmail,
      clientId: transaction.client_id,
      redirectUri: transaction.redirect_uri,
      challenge: transaction.code_challenge,
      resource: mcpResource(orig),
      expiresAt: now + 120000,
    };
    saveStore(store);

    const redirect = new URL(transaction.redirect_uri);
    redirect.searchParams.set('code', code);
    redirect.searchParams.set('state', transaction.state);
    redirect.searchParams.set('iss', issuer(orig));

    reply.clearCookie('sevii_mcp_consent', { path: '/api/mcp/oauth' });
    return { redirect: redirect.toString() };
  });

  // Token Endpoint (PKCE authorization_code & refresh_token)
  app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_req, body, done) => {
        done(null, Object.fromEntries(new URLSearchParams(body as string)));
      }
    );

    scope.post('/api/mcp/oauth/token', async (req, reply) => {
      const orig = getEffectiveOrigin(req);
      const store = loadStore();
      const body = req.body as any;

      // Fluxo 1: Refresh Token
      if (body?.grant_type === 'refresh_token') {
        const data = z.object({
          grant_type: z.literal('refresh_token'),
          refresh_token: z.string().min(1).max(200),
          client_id: z.string(),
          resource: z.string().optional(),
        }).passthrough().parse(body);

        const grant = store.refreshes[hash(data.refresh_token)];
        if (!grant || grant.expiresAt <= Date.now() || grant.clientId !== data.client_id) {
          return reply.status(400).send({ error: 'invalid_grant' });
        }

        delete store.refreshes[hash(data.refresh_token)];

        const token = app.jwt.sign(
          { userId: grant.userId, email: grant.userEmail, role: 'admin', purpose: 'mcp-access', aud: mcpResource(orig) } as any,
          { expiresIn: '1h' }
        );
        const nextRefresh = random();
        store.refreshes[hash(nextRefresh)] = {
          refreshHash: hash(nextRefresh),
          userId: grant.userId,
          userEmail: grant.userEmail,
          clientId: grant.clientId,
          resource: mcpResource(orig),
          expiresAt: Date.now() + 30 * 86400000,
        };
        saveStore(store);

        return {
          access_token: token,
          refresh_token: nextRefresh,
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'sevi-colecionaveis',
        };
      }

      // Fluxo 2: Authorization Code + PKCE S256
      const data = z.object({
        grant_type: z.literal('authorization_code'),
        code: z.string(),
        client_id: z.string(),
        redirect_uri: z.string(),
        code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
        resource: z.string().optional(),
      }).passthrough().parse(body);

      const codeHash = hash(data.code);
      const codeRecord = store.codes[codeHash];

      if (!codeRecord || codeRecord.expiresAt < Date.now()) {
        return reply.status(400).send({ error: 'invalid_grant', message: 'Código de autorização inválido ou expirado.' });
      }

      if (codeRecord.clientId !== data.client_id || codeRecord.redirectUri !== data.redirect_uri) {
        return reply.status(400).send({ error: 'invalid_grant', message: 'Parâmetros de cliente ou redirect inválidos.' });
      }

      // Validação estrita PKCE S256
      const challenge = createHash('sha256').update(data.code_verifier).digest('base64url');
      if (codeRecord.challenge !== challenge) {
        return reply.status(400).send({ error: 'invalid_grant', message: 'PKCE challenge verification failed.' });
      }

      // Consome código (uso único)
      delete store.codes[codeHash];

      const token = app.jwt.sign(
        { userId: codeRecord.userId, email: codeRecord.userEmail, role: 'admin', purpose: 'mcp-access', aud: mcpResource(orig) } as any,
        { expiresIn: '1h' }
      );
      const refreshToken = random();

      store.refreshes[hash(refreshToken)] = {
        refreshHash: hash(refreshToken),
        userId: codeRecord.userId,
        userEmail: codeRecord.userEmail,
        clientId: data.client_id,
        resource: mcpResource(orig),
        expiresAt: Date.now() + 30 * 86400000,
      };
      saveStore(store);

      return {
        access_token: token,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'sevi-colecionaveis',
      };
    });
  });
}
