import { describe, it, expect } from "vitest";
import { handleMcpHttpRequest } from "./handler.server";
import { ADMIN_ONLY_ERROR, getPublicOrigin } from "./oauth.server";

describe("MCP Streamable HTTP Endpoint & Segurança", () => {
  it("Endpoint /api/mcp rejeita requisição não autenticada com HTTP 401 e cabeçalho WWW-Authenticate", async () => {
    const req = new Request("https://seviicolecionaveis.com.br/api/mcp", {
      method: "GET",
    });

    const res = await handleMcpHttpRequest(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("oauth-protected-resource");

    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(body.message).toBe(ADMIN_ONLY_ERROR);
  });

  it("Endpoint /api/mcp rejeita token inválido com HTTP 401", async () => {
    const req = new Request("https://seviicolecionaveis.com.br/api/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer token_falso_invalido_12345",
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });

    const res = await handleMcpHttpRequest(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("Endpoint /api/mcp responde OPTIONS com cabeçalhos CORS adequados", async () => {
    const req = new Request("https://seviicolecionaveis.com.br/api/mcp", {
      method: "OPTIONS",
      headers: {
        origin: "https://chatgpt.com",
      },
    });

    const res = await handleMcpHttpRequest(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://chatgpt.com");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("getPublicOrigin detecta origens oficiais e domínios da aplicação", () => {
    const reqComBr = new Request("https://seviicolecionaveis.com.br/api/mcp");
    expect(getPublicOrigin(reqComBr)).toBe("https://seviicolecionaveis.com.br");

    const reqLovable = new Request("https://seviicolecionaveis.lovable.app/api/mcp");
    expect(getPublicOrigin(reqLovable)).toBe("https://seviicolecionaveis.lovable.app");
  });
});
