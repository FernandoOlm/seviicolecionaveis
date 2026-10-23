import { createFileRoute } from "@tanstack/react-router";
const retired = () => new Response(JSON.stringify({ error: "integration_replaced", message: "Reconecte usando https://seviicolecionaveis.com.br/mcp e OAuth." }), { status: 410, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
export const Route = createFileRoute("/api/public/mcp-oauth/token")({ server: { handlers: { GET: retired, POST: retired, OPTIONS: retired } } });
