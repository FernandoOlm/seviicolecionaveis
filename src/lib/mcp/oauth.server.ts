import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ADMIN_ONLY_ERROR = "Acesso ao plugin permitido somente para administradores.";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function base64urlSha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function randomString(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function getPublicOrigin(request?: Request): string {
  const configured = process.env.PANEL_URL || process.env.VITE_APP_URL || "https://seviicolecionaveis.com.br";
  if (!request) return configured;
  try {
    const url = new URL(request.url);
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
    const proto = request.headers.get("x-forwarded-proto") || (url.protocol.startsWith("http") ? url.protocol.replace(":", "") : "https");
    if (host.includes("seviicolecionaveis.lovable.app")) {
      return `https://${host}`;
    }
    if (host.includes("seviicolecionaveis.com.br")) {
      return `https://${host}`;
    }
    if (host.includes("localhost") || host.includes("127.0.0.1")) {
      return `${proto}://${host}`;
    }
  } catch {
    // fallback
  }
  return configured;
}

export function mcpResource(origin: string): string {
  return `${origin}/api/public/mcp`;
}

export function oauthIssuer(origin: string): string {
  return `${origin}/api/public/mcp-oauth`;
}

export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    // Codex desktop/CLI loopback redirect
    if (
      parsed.protocol === "http:" &&
      ["127.0.0.1", "[::1]"].includes(parsed.hostname) &&
      parsed.port !== "" &&
      parsed.pathname === "/callback" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    ) {
      return true;
    }

    // ChatGPT web & mobile connectors
    if (parsed.protocol === "https:" && (parsed.hostname === "chatgpt.com" || parsed.hostname === "chat.openai.com")) {
      if (
        parsed.pathname === "/connector_platform_oauth_redirect" ||
        parsed.pathname === "/connector/oauth/redirect" ||
        parsed.pathname === "/aip/plugin-oauth/callback" ||
        /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(parsed.pathname)
      ) {
        return true;
      }
    }

    // OpenAI Platform & Codex
    if (parsed.protocol === "https:" && (parsed.hostname === "platform.openai.com" || parsed.hostname === "codex.openai.com")) {
      if (
        parsed.pathname === "/oauth/callback" ||
        parsed.pathname === "/connector_platform_oauth_redirect" ||
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

export function getOAuthServerMetadata(origin: string) {
  const issuer = oauthIssuer(origin);
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["sevi-colecionaveis"],
    authorization_response_iss_parameter_supported: true,
  };
}

export function getProtectedResourceMetadata(origin: string) {
  return {
    resource: mcpResource(origin),
    authorization_servers: [oauthIssuer(origin)],
    bearer_methods_supported: ["header"],
    scopes_supported: ["sevi-colecionaveis"],
    resource_name: "Sevi Colecionáveis",
  };
}

/**
 * Validação rigorosa de administrador ativo no Supabase.
 * Lança erro explícito se não for administrador ou estiver inativo.
 */
export async function assertAdminUser(userId: string): Promise<{ id: string; email: string | null }> {
  // 1. Verificar usuário na autenticação Supabase
  const { data: userResp, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userErr || !userResp?.user) {
    throw new Error(ADMIN_ONLY_ERROR);
  }
  const user = userResp.user;
  if ((user as any).banned_until && new Date((user as any).banned_until) > new Date()) {
    throw new Error(ADMIN_ONLY_ERROR);
  }

  // 2. Verificar se possui role de 'admin' em public.user_roles
  const { data: roleRow, error: roleErr } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (roleErr || !roleRow) {
    throw new Error(ADMIN_ONLY_ERROR);
  }

  return { id: user.id, email: user.email ?? null };
}

// -------------------------------------------------------------
// Armazenamento com resiliência: mcp_oauth_* com fallback app_settings
// -------------------------------------------------------------

export interface McpClient {
  id: string;
  name: string;
  redirect_uris: string[];
}

export async function saveClient(client: McpClient): Promise<void> {
  try {
    const { error } = await (supabaseAdmin as any)
      .from("mcp_oauth_clients")
      .upsert({
        id: client.id,
        name: client.name,
        redirect_uris: client.redirect_uris,
        created_at: new Date().toISOString(),
      });
    if (!error) return;
  } catch {
    // fallback para app_settings
  }

  await supabaseAdmin
    .from("app_settings")
    .upsert({
      key: `mcp_client:${client.id}`,
      value: client as any,
      updated_at: new Date().toISOString(),
    });
}

export async function findClient(clientId: string): Promise<McpClient | null> {
  try {
    const { data, error } = await (supabaseAdmin as any)
      .from("mcp_oauth_clients")
      .select("id, name, redirect_uris")
      .eq("id", clientId)
      .maybeSingle();
    if (!error && data) {
      return {
        id: data.id,
        name: data.name,
        redirect_uris: Array.isArray(data.redirect_uris) ? data.redirect_uris : JSON.parse(data.redirect_uris),
      };
    }
  } catch {
    // fallback
  }

  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", `mcp_client:${clientId}`)
    .maybeSingle();

  if (data?.value && typeof data.value === "object") {
    return data.value as unknown as McpClient;
  }
  return null;
}

export interface McpCode {
  id: string; // sha256 do código
  user_id: string;
  client_id: string;
  redirect_uri: string;
  challenge: string;
  resource: string;
  scope: string;
  expires_at: string;
}

export async function saveCode(code: McpCode): Promise<void> {
  try {
    const { error } = await (supabaseAdmin as any)
      .from("mcp_oauth_codes")
      .upsert(code);
    if (!error) return;
  } catch {
    // fallback
  }

  await supabaseAdmin
    .from("app_settings")
    .upsert({
      key: `mcp_code:${code.id}`,
      value: code as any,
      updated_at: new Date().toISOString(),
    });
}

export async function consumeCode(
  rawCode: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
  resource?: string,
): Promise<string> {
  const codeHash = sha256(rawCode);
  let record: McpCode | null = null;

  try {
    const { data, error } = await (supabaseAdmin as any)
      .from("mcp_oauth_codes")
      .select("*")
      .eq("id", codeHash)
      .maybeSingle();
    if (!error && data) {
      record = data;
      await (supabaseAdmin as any).from("mcp_oauth_codes").delete().eq("id", codeHash);
    }
  } catch {
    // fallback
  }

  if (!record) {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", `mcp_code:${codeHash}`)
      .maybeSingle();
    if (data?.value) {
      record = data.value as unknown as McpCode;
      await supabaseAdmin.from("app_settings").delete().eq("key", `mcp_code:${codeHash}`);
    }
  }

  if (!record) {
    throw new Error("Código de autorização inválido ou expirado.");
  }

  if (new Date(record.expires_at) < new Date()) {
    throw new Error("Código de autorização expirado.");
  }

  if (record.client_id !== clientId) {
    throw new Error("Cliente não corresponde ao código.");
  }

  if (record.redirect_uri !== redirectUri) {
    throw new Error("URI de redirecionamento inválida.");
  }

  if (resource && record.resource && resource !== record.resource) {
    throw new Error("Recurso não corresponde.");
  }

  // Verificação estrita de PKCE S256
  const calculatedChallenge = base64urlSha256(codeVerifier);
  if (calculatedChallenge !== record.challenge) {
    throw new Error("Desafio PKCE inválido.");
  }

  // Validação em tempo real: usuário ainda é administrador ativo?
  await assertAdminUser(record.user_id);

  return record.user_id;
}

export interface McpSession {
  id: string;
  user_id: string;
  client_id: string;
  resource: string;
  token_hash: string;
  refresh_token_hash: string;
  expires_at: string;
  refresh_expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export async function createSession(userId: string, clientId: string, resource: string) {
  await assertAdminUser(userId);

  const accessToken = `sevi_mcp_at_${randomString(36)}`;
  const refreshToken = `sevi_mcp_rt_${randomString(36)}`;
  const sessionId = randomString(16);

  const session: McpSession = {
    id: sessionId,
    user_id: userId,
    client_id: clientId,
    resource,
    token_hash: sha256(accessToken),
    refresh_token_hash: sha256(refreshToken),
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hora
    refresh_expires_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(), // 30 dias
    revoked_at: null,
    created_at: new Date().toISOString(),
  };

  try {
    const { error } = await (supabaseAdmin as any).from("mcp_oauth_sessions").insert(session);
    if (!error) {
      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: "sevi-colecionaveis",
      };
    }
  } catch {
    // fallback
  }

  await supabaseAdmin.from("app_settings").upsert({
    key: `mcp_sess_token:${session.token_hash}`,
    value: session as any,
    updated_at: new Date().toISOString(),
  });
  await supabaseAdmin.from("app_settings").upsert({
    key: `mcp_sess_refresh:${session.refresh_token_hash}`,
    value: session as any,
    updated_at: new Date().toISOString(),
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: "sevi-colecionaveis",
  };
}

export async function refreshSession(rawRefreshToken: string, clientId: string, resource?: string) {
  const refreshHash = sha256(rawRefreshToken);
  let session: McpSession | null = null;

  try {
    const { data, error } = await (supabaseAdmin as any)
      .from("mcp_oauth_sessions")
      .select("*")
      .eq("refresh_token_hash", refreshHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (!error && data) session = data;
  } catch {
    // fallback
  }

  if (!session) {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", `mcp_sess_refresh:${refreshHash}`)
      .maybeSingle();
    if (data?.value) {
      const s = data.value as unknown as McpSession;
      if (!s.revoked_at) session = s;
    }
  }

  if (!session) {
    throw new Error("Refresh token inválido ou revogado.");
  }

  if (session.client_id !== clientId) {
    throw new Error("Cliente não corresponde.");
  }

  if (resource && session.resource && resource !== session.resource) {
    throw new Error("Recurso não corresponde.");
  }

  if (new Date(session.refresh_expires_at) < new Date()) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  // Validação em tempo real: se o administrador perdeu a permissão, BLOQUEIA a renovação
  await assertAdminUser(session.user_id);

  // Revoga a sessão antiga (rotação de refresh token)
  try {
    await (supabaseAdmin as any)
      .from("mcp_oauth_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", session.id);
  } catch {
    // fallback
  }
  await supabaseAdmin.from("app_settings").delete().eq("key", `mcp_sess_refresh:${refreshHash}`);
  await supabaseAdmin.from("app_settings").delete().eq("key", `mcp_sess_token:${session.token_hash}`);

  // Cria a nova sessão
  return createSession(session.user_id, session.client_id, session.resource);
}

/**
 * Validação do Bearer Token no endpoint MCP.
 * Verifica o hash da sessão E valida em tempo real se o usuário continua sendo admin ativo.
 */
export async function authenticateMcpRequest(request: Request): Promise<{ userId: string; email: string | null }> {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Token de autenticação ausente ou inválido.");
  }

  const rawToken = authHeader.slice(7).trim();
  if (!rawToken) {
    throw new Error("Token de autenticação vazio.");
  }

  const tokenHash = sha256(rawToken);
  let session: McpSession | null = null;

  try {
    const { data, error } = await (supabaseAdmin as any)
      .from("mcp_oauth_sessions")
      .select("*")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (!error && data) session = data;
  } catch {
    // fallback
  }

  if (!session) {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", `mcp_sess_token:${tokenHash}`)
      .maybeSingle();
    if (data?.value) {
      const s = data.value as unknown as McpSession;
      if (!s.revoked_at) session = s;
    }
  }

  if (!session) {
    throw new Error("Sessão expirada ou inválida. Conecte-se novamente.");
  }

  if (new Date(session.expires_at) < new Date()) {
    throw new Error("Token de acesso expirado. Renove via refresh_token.");
  }

  // Atualiza last_used_at
  try {
    await (supabaseAdmin as any)
      .from("mcp_oauth_sessions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", session.id);
  } catch {
    // ignore
  }

  // Validação em tempo real no banco: se não for mais admin, o acesso cessa IMEDIATAMENTE!
  const admin = await assertAdminUser(session.user_id);
  return { userId: admin.id, email: admin.email };
}
