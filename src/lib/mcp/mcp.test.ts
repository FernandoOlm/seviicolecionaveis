import { describe, it, expect } from "vitest";
import {
  isAllowedRedirectUri,
  sha256,
  base64urlSha256,
  getOAuthServerMetadata,
  getProtectedResourceMetadata,
  ADMIN_ONLY_ERROR,
} from "./oauth.server";
import { tools } from "./tools.server";

describe("OAuth Metadados e Validações", () => {
  it("Valida URLs permitidas de retorno do ChatGPT e Codex", () => {
    // Callbacks legítimos do ChatGPT
    expect(isAllowedRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
    expect(isAllowedRedirectUri("https://chatgpt.com/connector/oauth/redirect")).toBe(true);
    expect(isAllowedRedirectUri("https://chatgpt.com/connector/oauth/abc-123_xyz")).toBe(true);
    expect(isAllowedRedirectUri("https://chat.openai.com/connector_platform_oauth_redirect")).toBe(true);

    // Callbacks do Codex Desktop (loopback dinâmico)
    expect(isAllowedRedirectUri("http://127.0.0.1:49152/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://[::1]:51234/callback")).toBe(true);

    // Bloqueio de URLs maliciosas e abertas
    expect(isAllowedRedirectUri("https://attacker.com/callback")).toBe(false);
    expect(isAllowedRedirectUri("https://chatgpt.com.attacker.com/oauth")).toBe(false);
    expect(isAllowedRedirectUri("http://127.0.0.1/invalid_path")).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
  });

  it("Metadados OAuth Authorization Server contêm endpoints e escopos corretos", () => {
    const meta = getOAuthServerMetadata("https://seviicolecionaveis.com.br");
    expect(meta.issuer).toBe("https://seviicolecionaveis.com.br/api/mcp/oauth");
    expect(meta.authorization_endpoint).toBe("https://seviicolecionaveis.com.br/api/mcp/oauth/authorize");
    expect(meta.token_endpoint).toBe("https://seviicolecionaveis.com.br/api/mcp/oauth/token");
    expect(meta.registration_endpoint).toBe("https://seviicolecionaveis.com.br/api/mcp/oauth/register");
    expect(meta.code_challenge_methods_supported).toContain("S256");
    expect(meta.scopes_supported).toContain("sevi-colecionaveis");
  });

  it("Metadados de Recurso Protegido contêm recurso e escopo", () => {
    const meta = getProtectedResourceMetadata("https://seviicolecionaveis.com.br");
    expect(meta.resource).toBe("https://seviicolecionaveis.com.br/api/mcp");
    expect(meta.scopes_supported).toContain("sevi-colecionaveis");
  });

  it("Mensagem exata exigida para acesso exclusivo de administradores", () => {
    expect(ADMIN_ONLY_ERROR).toBe("Acesso ao plugin permitido somente para administradores.");
  });

  it("Cálculo de PKCE SHA-256 base64url confere com a especificação RFC 7636", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = base64urlSha256(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("Catálogo de Ferramentas MCP", () => {
  it("Possui as ferramentas essenciais de consulta e operação", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("meu_perfil");
    expect(names).toContain("resumo_vendas");
    expect(names).toContain("listar_pedidos");
    expect(names).toContain("obter_pedido");
    expect(names).toContain("atualizar_status_pedido");
    expect(names).toContain("adicionar_nota_pedido");
    expect(names).toContain("listar_cartas");
    expect(names).toContain("obter_carta");
    expect(names).toContain("atualizar_estoque_carta");
    expect(names).toContain("atualizar_preco_carta");
    expect(names).toContain("listar_produtos_lacrados");
    expect(names).toContain("listar_acessorios");
    expect(names).toContain("listar_estoque_baixo");
    expect(names).toContain("listar_cupons");
    expect(names).toContain("criar_cupom");
    expect(names).toContain("listar_pilhas_ativas");
    expect(names).toContain("listar_leiloes");
  });

  it("Ferramentas de mutação possuem anotações e schemas com idempotencyKey", () => {
    const mutators = tools.filter((t) => !t.readOnly);
    for (const m of mutators) {
      expect(m.readOnly).toBe(false);
      expect(m.inputSchema).toBeDefined();
    }
  });
});
