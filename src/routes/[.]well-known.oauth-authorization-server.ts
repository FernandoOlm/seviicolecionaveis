import { createFileRoute } from "@tanstack/react-router";

// The authorization server is the managed issuer; redirect legacy root discovery there.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";
const issuerMetadata = `https://${projectRef}.supabase.co/.well-known/oauth-authorization-server/auth/v1`;

export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  server: {
    handlers: {
      GET: () => new Response(null, { status: 307, headers: { Location: issuerMetadata, "Cache-Control": "no-store" } }),
    },
  },
});
