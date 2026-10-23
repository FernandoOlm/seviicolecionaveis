export interface AuthorizationDetails {
  client?: { name?: string; client_name?: string };
  redirect_uri?: string;
  scope?: string;
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
}
export interface OAuthResult { data: AuthorizationDetails | null; error: { message: string } | null }
export interface OAuthApi {
  getAuthorizationDetails(id: string): Promise<OAuthResult>;
  approveAuthorization(id: string): Promise<OAuthResult>;
  denyAuthorization(id: string): Promise<OAuthResult>;
}
export function authorizationTarget(details: AuthorizationDetails | null): string | undefined {
  const value = details?.redirect_url ?? details?.redirect_to;
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) ? url.href : undefined;
  } catch { return undefined; }
}