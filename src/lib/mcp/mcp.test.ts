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
import { isAllowedPublicUrl, detectImageMagicBytes } from "./media.server";

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
    expect(meta.issuer).toBe("https://seviicolecionaveis.com.br/api/public/mcp-oauth");
    expect(meta.authorization_endpoint).toBe("https://seviicolecionaveis.com.br/api/public/mcp-oauth/authorize");
    expect(meta.token_endpoint).toBe("https://seviicolecionaveis.com.br/api/public/mcp-oauth/token");
    expect(meta.registration_endpoint).toBe("https://seviicolecionaveis.com.br/api/public/mcp-oauth/register");
    expect(meta.code_challenge_methods_supported).toContain("S256");
    expect(meta.scopes_supported).toContain("sevi-colecionaveis");
  });

  it("Metadados de Recurso Protegido contêm recurso e escopo", () => {
    const meta = getProtectedResourceMetadata("https://seviicolecionaveis.com.br");
    expect(meta.resource).toBe("https://seviicolecionaveis.com.br/api/public/mcp");
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

describe("Proteção de Mídia e Prevenção contra SSRF", () => {
  it("Permite URLs públicas válidas e bloqueia acessos internos / privados", () => {
    // Permitidos
    expect(isAllowedPublicUrl("https://images.pokemontcg.io/swsh1/1_hires.png").allowed).toBe(true);
    expect(isAllowedPublicUrl("https://seviicolecionaveis.com.br/assets/card.jpg").allowed).toBe(true);
    expect(isAllowedPublicUrl("http://cdn.example.com/item.webp").allowed).toBe(true);

    // Bloqueados (SSRF)
    expect(isAllowedPublicUrl("http://localhost:3000/secret").allowed).toBe(false);
    expect(isAllowedPublicUrl("http://127.0.0.1:8080").allowed).toBe(false);
    expect(isAllowedPublicUrl("http://10.0.0.5/internal").allowed).toBe(false);
    expect(isAllowedPublicUrl("http://172.16.1.100").allowed).toBe(false);
    expect(isAllowedPublicUrl("http://192.168.1.1/admin").allowed).toBe(false);
    expect(isAllowedPublicUrl("http://169.254.169.254/latest/meta-data").allowed).toBe(false); // Cloud metadata
    expect(isAllowedPublicUrl("http://[::1]/internal").allowed).toBe(false);
    expect(isAllowedPublicUrl("ftp://files.example.com/img.jpg").allowed).toBe(false);
    expect(isAllowedPublicUrl("file:///etc/passwd").allowed).toBe(false);
  });

  it("Detecta tipos MIME reais através de Magic Bytes", () => {
    // PNG
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(detectImageMagicBytes(pngBytes)?.mimeType).toBe("image/png");

    // JPEG
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(detectImageMagicBytes(jpegBytes)?.mimeType).toBe("image/jpeg");

    // WEBP
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(detectImageMagicBytes(webpBytes)?.mimeType).toBe("image/webp");

    // Falso / Não suportado
    const txtBytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f]);
    expect(detectImageMagicBytes(txtBytes)).toBeNull();
  });
});

describe("Catálogo Completo de Ferramentas MCP da Sevii", () => {
  it("Possui todas as ferramentas de administração implementadas", () => {
    const names = tools.map((t) => t.name);

    // Módulo Catálogo (Cartas, Lacrados, Acessórios, Coleções)
    expect(names).toContain("listar_cartas");
    expect(names).toContain("obter_carta");
    expect(names).toContain("criar_carta");
    expect(names).toContain("editar_carta");
    expect(names).toContain("remover_carta");
    expect(names).toContain("atualizar_estoque_carta");
    expect(names).toContain("atualizar_preco_carta");
    expect(names).toContain("operacoes_em_lote_cartas");
    expect(names).toContain("listar_produtos_lacrados");
    expect(names).toContain("obter_produto_lacrado");
    expect(names).toContain("criar_produto_lacrado");
    expect(names).toContain("editar_produto_lacrado");
    expect(names).toContain("alterar_status_produto_lacrado");
    expect(names).toContain("listar_acessorios");
    expect(names).toContain("obter_acessorio");
    expect(names).toContain("criar_acessorio");
    expect(names).toContain("editar_acessorio");
    expect(names).toContain("alterar_status_acessorio");
    expect(names).toContain("listar_estoque_baixo");
    expect(names).toContain("listar_colecoes");

    // Módulo Mídia & Fotos
    expect(names).toContain("fazer_upload_imagem");
    expect(names).toContain("gerenciar_imagens_produto");

    // Módulo Leilões
    expect(names).toContain("listar_leiloes");
    expect(names).toContain("obter_leilao");
    expect(names).toContain("criar_leilao");
    expect(names).toContain("editar_leilao");
    expect(names).toContain("gerenciar_lotes_leilao");
    expect(names).toContain("operar_leilao");
    expect(names).toContain("vincular_arremate_pilha");

    // Módulo Pedidos, Pilha, Cupons, Banners, Clientes, Métricas
    expect(names).toContain("meu_perfil");
    expect(names).toContain("resumo_vendas");
    expect(names).toContain("listar_pedidos");
    expect(names).toContain("obter_pedido");
    expect(names).toContain("atualizar_status_pedido");
    expect(names).toContain("adicionar_nota_pedido");
    expect(names).toContain("listar_pilhas_ativas");
    expect(names).toContain("obter_pilha_cliente");
    expect(names).toContain("despachar_pilha");
    expect(names).toContain("listar_cupons");
    expect(names).toContain("obter_cupom");
    expect(names).toContain("criar_cupom");
    expect(names).toContain("atualizar_cupom");
    expect(names).toContain("listar_banners");
    expect(names).toContain("gerenciar_banner");
    expect(names).toContain("listar_clientes");
    expect(names).toContain("obter_cliente");

    expect(tools.length).toBeGreaterThanOrEqual(44);
  });

  it("Todas as ferramentas possuem metadados válidos, handler e esquema de entrada", () => {
    for (const t of tools) {
      expect(t.name).toMatch(/^[a-z0-9_]+$/);
      expect(t.title).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(typeof t.handler).toBe("function");
      expect(t.inputSchema).toBeDefined();
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("Ferramentas destrutivas estão devidamente anotadas", () => {
    const destructiveTools = tools.filter((t) => t.destructive);
    const names = destructiveTools.map((t) => t.name);
    expect(names).toContain("remover_carta");
    expect(names).toContain("alterar_status_produto_lacrado");
    expect(names).toContain("alterar_status_acessorio");
    expect(names).toContain("operar_leilao");
    expect(names).toContain("despachar_pilha");
  });
});
