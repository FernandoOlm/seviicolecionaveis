import { createFileRoute } from "@tanstack/react-router";
import { consumeCode, createSession, refreshSession } from "@/lib/mcp/oauth.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export const Route = createFileRoute("/api/public/mcp/oauth/token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),

      POST: async ({ request }) => {
        let params: Record<string, string> = {};
        const contentType = request.headers.get("content-type") || "";

        if (contentType.includes("application/x-www-form-urlencoded")) {
          const text = await request.text();
          const searchParams = new URLSearchParams(text);
          for (const [key, val] of searchParams.entries()) {
            params[key] = val;
          }
        } else {
          try {
            params = (await request.json()) as Record<string, string>;
          } catch {
            return new Response(JSON.stringify({ error: "invalid_request", error_description: "Payload inválido" }), {
              status: 400,
              headers: { ...cors, "Content-Type": "application/json" },
            });
          }
        }

        const grantType = params.grant_type;

        if (grantType === "authorization_code") {
          const { code, client_id, redirect_uri, code_verifier, resource } = params;

          if (!code || !client_id || !redirect_uri || !code_verifier) {
            return new Response(
              JSON.stringify({
                error: "invalid_request",
                error_description: "Parâmetros obrigatórios ausentes (code, client_id, redirect_uri, code_verifier).",
              }),
              { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
            );
          }

          try {
            const userId = await consumeCode(code, client_id, redirect_uri, code_verifier, resource);
            const tokenResponse = await createSession(userId, client_id, resource || "");

            return new Response(JSON.stringify(tokenResponse), {
              status: 200,
              headers: {
                ...cors,
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              },
            });
          } catch (err: any) {
            return new Response(
              JSON.stringify({
                error: "invalid_grant",
                error_description: err?.message || "Falha na troca de código de autorização.",
              }),
              { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
            );
          }
        }

        if (grantType === "refresh_token") {
          const { refresh_token, client_id, resource } = params;
          if (!refresh_token || !client_id) {
            return new Response(
              JSON.stringify({
                error: "invalid_request",
                error_description: "refresh_token e client_id são obrigatórios.",
              }),
              { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
            );
          }

          try {
            const tokenResponse = await refreshSession(refresh_token, client_id, resource);
            return new Response(JSON.stringify(tokenResponse), {
              status: 200,
              headers: {
                ...cors,
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              },
            });
          } catch (err: any) {
            return new Response(
              JSON.stringify({
                error: "invalid_grant",
                error_description: err?.message || "Falha ao renovar token.",
              }),
              { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
            );
          }
        }

        return new Response(
          JSON.stringify({
            error: "unsupported_grant_type",
            error_description: "Grant type não suportado. Utilize 'authorization_code' ou 'refresh_token'.",
          }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      },
    },
  },
});
