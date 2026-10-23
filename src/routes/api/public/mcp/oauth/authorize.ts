import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  ADMIN_ONLY_ERROR,
  assertAdminUser,
  findClient,
  getPublicOrigin,
  isAllowedRedirectUri,
  oauthIssuer,
  randomString,
  saveCode,
  sha256,
} from "@/lib/mcp/oauth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function getSupabaseAuthClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://zuypkggpecsqormwculg.supabase.co";
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1eXBrZ2dwZWNzcW9ybXdjdWxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NDY4MDMsImV4cCI6MjA5MzUyMjgwM30.poDv3khFEu-Cg3v1zPwDr4k8CNuahn66hsb_rgq69n4";

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export const Route = createFileRoute("/api/public/mcp/oauth/authorize")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const clientId = url.searchParams.get("client_id");
        const redirectUri = url.searchParams.get("redirect_uri");
        const responseType = url.searchParams.get("response_type");
        const codeChallenge = url.searchParams.get("code_challenge");
        const codeChallengeMethod = url.searchParams.get("code_challenge_method");
        const state = url.searchParams.get("state") || "";
        const scope = url.searchParams.get("scope") || "sevi-colecionaveis";
        const resource = url.searchParams.get("resource") || "";

        if (!clientId || !redirectUri || responseType !== "code" || !codeChallenge || codeChallengeMethod !== "S256") {
          return new Response(
            JSON.stringify({
              error: "invalid_request",
              message: "Parâmetros obrigatórios ausentes ou inválidos (client_id, redirect_uri, response_type=code, code_challenge, code_challenge_method=S256).",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        if (!isAllowedRedirectUri(redirectUri)) {
          return new Response(
            JSON.stringify({ error: "invalid_redirect_uri", message: "Redirect URI não permitida." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const client = await findClient(clientId);
        if (!client) {
          return new Response(
            JSON.stringify({ error: "unauthorized_client", message: "Cliente OAuth não registrado." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        if (!client.redirect_uris.includes(redirectUri)) {
          return new Response(
            JSON.stringify({ error: "invalid_redirect_uri", message: "Redirect URI não corresponde ao cliente cadastrado." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const txPayload = JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          state,
          scope,
          resource,
          ts: Date.now(),
        });
        const txSig = sha256(`${txPayload}:sevi-mcp-secret-2026`);
        const txCookie = encodeURIComponent(`${Buffer.from(txPayload).toString("base64url")}.${txSig}`);

        const nonce = randomString(16);

        const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Conectar Sevii Colecionáveis — ChatGPT</title>
  <style>
    * { box-sizing: border-box; }
    body {
      background: #09090b;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 24px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      max-width: 440px;
      width: 100%;
      padding: 32px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    .badge {
      display: inline-block;
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 4px 10px;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 22px;
      margin: 0 0 8px;
      color: #ffffff;
      font-weight: 700;
    }
    p {
      color: #a1a1aa;
      font-size: 14px;
      line-height: 1.5;
      margin: 0 0 20px;
    }
    .scope-box {
      background: #27272a;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 20px;
      font-size: 13px;
      color: #d4d4d8;
    }
    .scope-box ul {
      margin: 6px 0 0;
      padding-left: 18px;
      color: #a1a1aa;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 6px;
      color: #e4e4e7;
    }
    input {
      width: 100%;
      background: #09090b;
      border: 1px solid #3f3f46;
      border-radius: 8px;
      padding: 12px 14px;
      color: #f4f4f5;
      font-size: 15px;
      margin-bottom: 16px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus {
      border-color: #e11d48;
    }
    button {
      width: 100%;
      background: #e11d48;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 14px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover {
      background: #be123c;
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    #error {
      color: #f87171;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 6px;
      padding: 10px;
      font-size: 13px;
      margin-top: 16px;
      display: none;
    }
    .footer-note {
      text-align: center;
      margin-top: 20px;
      font-size: 12px;
      color: #71717a;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Acesso Administrativo</div>
    <h1>Sevii Colecionáveis</h1>
    <p>Autorize o ChatGPT a consultar pedidos, catálogo de cartas, lacrados e gerenciar o painel administrativo.</p>
    
    <div class="scope-box">
      <strong>Permissões concedidas:</strong>
      <ul>
        <li>Consultar vendas, pedidos e clientes</li>
        <li>Consultar estoque e catálogo de cartas</li>
        <li>Atualizar status e rastreamento de pedidos</li>
        <li>Gerenciar estoque e cupons de desconto</li>
      </ul>
    </div>

    <form id="auth-form">
      <div>
        <label for="email">E-mail de Administrador</label>
        <input id="email" name="email" type="email" autocomplete="username" required placeholder="admin@seviicolecionaveis.com.br">
      </div>
      <div>
        <label for="password">Senha da Conta</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="••••••••">
      </div>
      <button type="submit" id="btn-submit">Entrar e Autorizar Conexão</button>
      <div id="error" role="alert"></div>
    </form>

    <div class="footer-note">
      Insira suas credenciais apenas neste domínio seguro oficial.<br>Acesso restrito exclusivamente a administradores ativos.
    </div>
  </div>

  <script nonce="${nonce}">
    document.getElementById("auth-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errBox = document.getElementById("error");
      const btn = document.getElementById("btn-submit");
      errBox.style.display = "none";
      errBox.textContent = "";
      btn.disabled = true;
      btn.textContent = "Verificando permissões...";

      try {
        const formData = new FormData(e.currentTarget);
        const res = await fetch(window.location.pathname, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(formData)),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || data.error || "Falha na autorização");
        }

        if (data.redirect) {
          window.location.assign(data.redirect);
        } else {
          throw new Error("Resposta de redirecionamento ausente.");
        }
      } catch (err) {
        errBox.textContent = err.message;
        errBox.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Entrar e Autorizar Conexão";
      }
    });
  </script>
</body>
</html>`;

        return new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Set-Cookie": `sevi_mcp_consent=${txCookie}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=600`,
            "Cache-Control": "no-store",
            "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
          },
        });
      },

      POST: async ({ request }) => {
        const cookieHeader = request.headers.get("cookie") || "";
        const match = cookieHeader.match(/sevi_mcp_consent=([^;]+)/);
        if (!match) {
          return new Response(
            JSON.stringify({ error: "invalid_request", message: "Sessão de autorização expirou. Reinicie o login no ChatGPT." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const raw = decodeURIComponent(match[1]);
        const [b64, sig] = raw.split(".");
        if (!b64 || !sig) {
          return new Response(
            JSON.stringify({ error: "invalid_request", message: "Cookie de consentimento corrompido." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const payloadStr = Buffer.from(b64, "base64url").toString("utf-8");
        const expectedSig = sha256(`${payloadStr}:sevi-mcp-secret-2026`);
        if (sig !== expectedSig) {
          return new Response(
            JSON.stringify({ error: "invalid_request", message: "Assinatura de consentimento inválida." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        let tx: { client_id: string; redirect_uri: string; code_challenge: string; state: string; scope: string; resource: string; ts: number };
        try {
          tx = JSON.parse(payloadStr);
        } catch {
          return new Response(JSON.stringify({ error: "invalid_request", message: "Payload de consentimento inválido." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (Date.now() - tx.ts > 600 * 1000) {
          return new Response(
            JSON.stringify({ error: "invalid_request", message: "A sessão de autorização expirou. Tente novamente." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid_request", message: "JSON inválido." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const email = String(body?.email || "").trim().toLowerCase();
        const password = String(body?.password || "");
        if (!email || !password) {
          return new Response(
            JSON.stringify({ error: "invalid_request", message: "E-mail e senha são obrigatórios." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const authClient = getSupabaseAuthClient();
        const { data: authData, error: authErr } = await authClient.auth.signInWithPassword({
          email,
          password,
        });

        if (authErr || !authData.user) {
          return new Response(
            JSON.stringify({ error: "invalid_credentials", message: "E-mail ou senha incorretos." }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        const userId = authData.user.id;

        try {
          await assertAdminUser(userId);
        } catch (adminErr: any) {
          return new Response(
            JSON.stringify({
              error: "access_denied",
              message: ADMIN_ONLY_ERROR,
            }),
            { status: 403, headers: { "Content-Type": "application/json" } },
          );
        }

        const rawCode = randomString(36);
        const codeHash = sha256(rawCode);

        await saveCode({
          id: codeHash,
          user_id: userId,
          client_id: tx.client_id,
          redirect_uri: tx.redirect_uri,
          challenge: tx.code_challenge,
          resource: tx.resource || "",
          scope: tx.scope || "sevi-colecionaveis",
          expires_at: new Date(Date.now() + 120 * 1000).toISOString(),
        });

        try {
          await supabaseAdmin.from("admin_notifications").insert({
            title: `Conexão ChatGPT autorizada por ${email}`,
            action: "mcp_oauth_authorized",
            kind: "security_oauth",
            target_id: userId,
            target_type: "user",
            customer_email: email,
            dedupe_key: `mcp-auth-${userId}-${Date.now()}`,
            details: { clientId: tx.client_id, redirectUri: tx.redirect_uri } as any,
            email_status: {} as any,
          });
        } catch {
          // ignore
        }

        const redirectUrl = new URL(tx.redirect_uri);
        redirectUrl.searchParams.set("code", rawCode);
        if (tx.state) redirectUrl.searchParams.set("state", tx.state);
        const origin = getPublicOrigin(request);
        redirectUrl.searchParams.set("iss", oauthIssuer(origin));

        return new Response(
          JSON.stringify({ redirect: redirectUrl.toString() }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": "sevi_mcp_consent=; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=0",
              "Cache-Control": "no-store",
            },
          },
        );
      },
    },
  },
});
