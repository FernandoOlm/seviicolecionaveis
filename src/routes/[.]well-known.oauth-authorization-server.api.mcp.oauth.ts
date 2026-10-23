import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/.well-known/oauth-authorization-server/api/mcp/oauth")({ server: { handlers: { GET: () => new Response(null, { status: 410 }) } } });
