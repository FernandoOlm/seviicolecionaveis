import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/.well-known/oauth-protected-resource/mcp")({ server: { handlers: { GET: () => new Response(null, { status: 307, headers: { Location: "/.well-known/oauth-protected-resource", "Cache-Control": "no-store" } }) } } });
