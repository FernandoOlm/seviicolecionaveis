import { createFileRoute } from "@tanstack/react-router";
import { handleMcpHttpRequest } from "@/lib/mcp/handler.server";

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      GET: async ({ request }) => handleMcpHttpRequest(request),
      POST: async ({ request }) => handleMcpHttpRequest(request),
      OPTIONS: async ({ request }) => handleMcpHttpRequest(request),
      DELETE: async ({ request }) => handleMcpHttpRequest(request),
    },
  },
});
