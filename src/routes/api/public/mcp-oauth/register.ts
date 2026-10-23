import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isAllowedRedirectUri, randomString, saveClient } from "@/lib/mcp/oauth.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export const Route = createFileRoute("/api/public/mcp-oauth/register")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),

      POST: async ({ request }) => {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid_request", message: "JSON inválido" }), {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        const schema = z.object({
          redirect_uris: z.array(z.string().url()).min(1).max(10),
          client_name: z.string().max(100).optional(),
          token_endpoint_auth_method: z.literal("none").optional(),
          grant_types: z.array(z.enum(["authorization_code", "refresh_token"])).optional(),
          response_types: z.array(z.literal("code")).optional(),
        }).passthrough();

        const parseResult = schema.safeParse(body);
        if (!parseResult.success) {
          return new Response(JSON.stringify({ error: "invalid_client_metadata", details: parseResult.error.format() }), {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        const { redirect_uris, client_name } = parseResult.data;
        for (const uri of redirect_uris) {
          if (!isAllowedRedirectUri(uri)) {
            return new Response(
              JSON.stringify({
                error: "invalid_redirect_uri",
                message: `URI de redirecionamento não permitida: ${uri}`,
              }),
              {
                status: 400,
                headers: { ...cors, "Content-Type": "application/json" },
              },
            );
          }
        }

        const clientId = `sevi_client_${randomString(24)}`;
        const name = client_name || "ChatGPT Sevi Colecionáveis";

        await saveClient({
          id: clientId,
          name,
          redirect_uris,
        });

        return new Response(
          JSON.stringify({
            client_id: clientId,
            client_name: name,
            redirect_uris,
            token_endpoint_auth_method: "none",
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
          }),
          {
            status: 201,
            headers: {
              ...cors,
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          },
        );
      },
    },
  },
});
