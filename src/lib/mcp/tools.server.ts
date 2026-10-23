// @ts-nocheck -- MCP tools in progress: several queries still use column names that differ from the database; review before enabling.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PAID_ORDER_STATUSES } from "@/lib/order-status";
import { catalogTools } from "./tools/catalog.tools";
import { mediaTools } from "./tools/media.tools";
import { auctionTools } from "./tools/auctions.tools";
import { storeTools } from "./tools/store.tools";

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  destructive: boolean;
  idempotent: boolean;
  handler: (args: Record<string, any>, context: { userId: string; email: string | null }) => Promise<any>;
}

const baseTools: McpToolDefinition[] = [
  // 1. MEU PERFIL ADMIN
  {
    name: "meu_perfil",
    title: "Meu Perfil de Administrador",
    description: "Consulta os dados e permissões do administrador atualmente conectado ao ChatGPT.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (_args, context) => {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, cpf, phone, created_at")
        .eq("user_id", context.userId)
        .maybeSingle();

      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("role, created_at")
        .eq("user_id", context.userId);

      return {
        userId: context.userId,
        email: context.email,
        profile: profile ?? null,
        roles: roles?.map((r) => r.role) ?? [],
        isAdmin: true,
        store: "Sevii Colecionáveis",
        domain: "https://seviicolecionaveis.com.br",
      };
    },
  },

  // 2. RESUMO DE VENDAS
  {
    name: "resumo_vendas",
    title: "Resumo de Vendas e Faturamento",
    description: "Consulta indicadores consolidados da loja: total de pedidos, faturamento bruto (R$), quantidade de pedidos pagos, pendentes, enviados e cancelados. Suporta filtro de período em dias (ex: 7, 15, 30 dias).",
    inputSchema: {
      type: "object",
      properties: {
        dias: {
          type: "number",
          description: "Período em dias para o resumo (ex: 7, 30). Se omitido, considera os últimos 30 dias.",
          default: 30,
        },
      },
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const days = Number(args.dias) || 30;
      const sinceDate = new Date(Date.now() - days * 86400 * 1000).toISOString();

      const { data: orders, error } = await supabaseAdmin
        .from("orders")
        .select("id, status, total_cents, created_at, payment_paid_at")
        .gte("created_at", sinceDate);

      if (error) throw new Error(`Falha ao consultar pedidos: ${error.message}`);

      let faturamentoCentavos = 0;
      let totalPedidos = 0;
      let pagos = 0;
      let pendentes = 0;
      let enviados = 0;
      let entregues = 0;
      let cancelados = 0;

      for (const o of orders ?? []) {
        totalPedidos++;
        if (PAID_ORDER_STATUSES.includes(o.status as any)) {
          pagos++;
          faturamentoCentavos += o.total_cents || 0;
        }
        if (o.status === "pending") pendentes++;
        if (o.status === "shipped") enviados++;
        if (o.status === "delivered") entregues++;
        if (o.status === "cancelled") cancelados++;
      }

      return {
        periodoDias: days,
        desde: sinceDate,
        totalPedidos,
        faturamentoTotalReais: (faturamentoCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        faturamentoTotalCentavos: faturamentoCentavos,
        statusContagem: {
          pagos,
          pendentes,
          enviados,
          entregues,
          cancelados,
        },
      };
    },
  },

  // 3. LISTAR PEDIDOS
  {
    name: "listar_pedidos",
    title: "Listar Pedidos",
    description: "Lista pedidos da loja com paginação e filtros opcionais por status (pending, paid, preparing, shipped, delivered, cancelled) e busca por cliente ou código.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filtrar por status do pedido (pending, paid, preparing, shipped, delivered, cancelled).",
        },
        busca: {
          type: "string",
          description: "Buscar por nome do cliente, e-mail ou número do pedido.",
        },
        pagina: {
          type: "number",
          description: "Número da página (padrão: 1).",
          default: 1,
        },
        limite: {
          type: "number",
          description: "Quantidade de itens por página (máx: 50, padrão: 20).",
          default: 20,
        },
      },
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const page = Math.max(1, Number(args.pagina) || 1);
      const limit = Math.min(50, Math.max(1, Number(args.limite) || 20));
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabaseAdmin
        .from("orders")
        .select("id, status, total_cents, recipient_name, email, shipping_method, tracking_code, created_at, payment_paid_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (args.status) {
        query = query.eq("status", String(args.status).toLowerCase());
      }
      if (args.busca) {
        const search = String(args.busca).trim();
        query = query.or(`recipient_name.ilike.%${search}%,email.ilike.%${search}%,id.ilike.%${search}%`);
      }

      const { data, count, error } = await query;
      if (error) throw new Error(`Falha ao listar pedidos: ${error.message}`);

      return {
        pagina: page,
        limite: limit,
        total: count || 0,
        pedidos: (data || []).map((p) => ({
          id: p.id,
          status: p.status,
          cliente: p.recipient_name,
          email: p.email,
          totalReais: ((p.total_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          formaEnvio: p.shipping_method,
          codigoRastreio: p.tracking_code,
          criadoEm: p.created_at,
          pagoEm: p.payment_paid_at,
        })),
      };
    },
  },

  // 4. OBTER PEDIDO
  {
    name: "obter_pedido",
    title: "Obter Detalhes do Pedido",
    description: "Consulta todos os detalhes de um pedido específico: itens comprados (cartas e lacrados), endereço de entrega, rastreamento, valores e notas administrativas.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "ID (UUID) do pedido a ser consultado.",
        },
      },
      required: ["orderId"],
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const orderId = String(args.orderId).trim();
      const { data: order, error } = await supabaseAdmin
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();

      if (error) throw new Error(`Erro ao buscar pedido: ${error.message}`);
      if (!order) throw new Error(`Pedido ${orderId} não encontrado.`);

      const { data: items } = await supabaseAdmin
        .from("order_items")
        .select("*")
        .eq("order_id", orderId);

      const { data: adminNotes } = await supabaseAdmin
        .from("order_admin_notes")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      return {
        pedido: {
          id: order.id,
          status: order.status,
          cliente: order.recipient_name,
          email: order.email,
          cpf: order.cpf,
          telefone: order.phone,
          endereco: {
            cep: order.cep,
            rua: order.street,
            numero: order.number,
            complemento: order.complement,
            bairro: order.neighborhood,
            cidade: order.city,
            estado: order.state,
          },
          valores: {
            subtotalReais: ((order.subtotal_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
            freteReais: ((order.shipping_cost_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
            descontoReais: ((order.discount_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
            totalReais: ((order.total_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          },
          envio: {
            metodo: order.shipping_method,
            rastreio: order.tracking_code,
            transportadora: order.carrier,
            urlRastreio: order.tracking_url,
          },
          itens: (items || []).map((it) => ({
            id: it.id,
            nome: it.card_name,
            numero: it.card_number,
            colecao: it.collection,
            acabamento: it.finish,
            quantidade: it.quantity,
            cancelados: it.cancelled_quantity || 0,
            precoUnitarioReais: ((it.unit_price_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          })),
          notasAdministrativas: (adminNotes || []).map((n) => ({
            id: n.order_id,
            conteudo: n.internal_notes,
            criadoEm: n.created_at,
          })),
        },
      };
    },
  },

  // 5. ATUALIZAR STATUS DO PEDIDO
  {
    name: "atualizar_status_pedido",
    title: "Atualizar Status e Rastreio do Pedido",
    description: "Atualiza o status de um pedido (pending, paid, preparing, shipped, delivered, cancelled), e opcionalmente adiciona ou altera o código de rastreio e transportadora. Executa regras de negócio existentes como decremento de estoque e disparo de e-mails transacionais ao cliente.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "ID do pedido.",
        },
        status: {
          type: "string",
          description: "Novo status (pending, paid, preparing, shipped, delivered, cancelled).",
          enum: ["pending", "paid", "preparing", "shipped", "delivered", "cancelled"],
        },
        codigoRastreio: {
          type: "string",
          description: "Código de rastreamento da transportadora (opcional).",
        },
        transportadora: {
          type: "string",
          description: "Nome da transportadora (correios, latam, etc., opcional).",
        },
        urlRastreio: {
          type: "string",
          description: "URL direta de rastreamento (opcional).",
        },
        idempotencyKey: {
          type: "string",
          description: "Chave única de idempotência para evitar repetição da alteração.",
        },
      },
      required: ["orderId", "status"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args, context) => {
      const orderId = String(args.orderId).trim();
      const newStatus = String(args.status).trim();

      const { data: order, error: fetchErr } = await supabaseAdmin
        .from("orders")
        .select("id, status, recipient_name, email, tracking_code, carrier, tracking_url")
        .eq("id", orderId)
        .maybeSingle();

      if (fetchErr || !order) throw new Error(`Pedido ${orderId} não encontrado.`);

      const PRE_PAID = ["pending", "cancellation_requested", "cancelled"];
      const POST_PAID = PAID_ORDER_STATUSES;

      // Se transita de pré-pagamento para pós-pagamento, aciona baixa de estoque oficial
      if (PRE_PAID.includes(order.status) && POST_PAID.includes(newStatus as any)) {
        const { markOrderPaid } = await import("@/lib/orders.server");
        await markOrderPaid(order.id);
      }

      const patch: Record<string, any> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      if (args.codigoRastreio !== undefined) patch.tracking_code = args.codigoRastreio ? String(args.codigoRastreio).trim() : null;
      if (args.transportadora !== undefined) patch.carrier = args.transportadora ? String(args.transportadora).trim() : null;
      if (args.urlRastreio !== undefined) patch.tracking_url = args.urlRastreio ? String(args.urlRastreio).trim() : null;

      const { error: updErr } = await supabaseAdmin.from("orders").update(patch as any).eq("id", orderId);
      if (updErr) throw new Error(`Falha ao atualizar pedido: ${updErr.message}`);

      // Registrar auditoria administrativa
      await supabaseAdmin.from("admin_notifications").insert({
        title: `Pedido #${orderId.slice(0, 8)} atualizado via ChatGPT`,
        action: "status_changed",
        kind: "order_update",
        target_id: orderId,
        target_type: "order",
        customer_name: order.recipient_name,
        customer_email: order.email,
        dedupe_key: args.idempotencyKey || `chatgpt-status-${orderId}-${newStatus}-${Date.now()}`,
        details: {
          previousStatus: order.status,
          newStatus,
          adminEmail: context.email,
          updatedFields: patch,
        } as any,
        email_status: {} as any,
      });

      return {
        sucesso: true,
        orderId,
        statusAnterior: order.status,
        novoStatus: newStatus,
        rastreio: patch.tracking_code ?? order.tracking_code,
        mensagem: `Pedido ${orderId.slice(0, 8)} atualizado para status '${newStatus}' com sucesso.`,
      };
    },
  },

  // 6. ADICIONAR NOTA AO PEDIDO
  {
    name: "adicionar_nota_pedido",
    title: "Adicionar Nota Interna ao Pedido",
    description: "Insere uma anotação interna visível apenas para a administração no pedido.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "ID do pedido.",
        },
        conteudo: {
          type: "string",
          description: "Texto da nota interna.",
        },
      },
      required: ["orderId", "conteudo"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (args, context) => {
      const orderId = String(args.orderId).trim();
      const content = String(args.conteudo).trim();
      if (!content) throw new Error("O conteúdo da nota não pode ser vazio.");

      const { data: existing } = await supabaseAdmin
        .from("order_admin_notes")
        .select("internal_notes")
        .eq("order_id", orderId)
        .maybeSingle();
      const line = `[ChatGPT - ${context.email || "Admin"}]: ${content}`;
      const { error } = await supabaseAdmin.from("order_admin_notes").upsert({
        order_id: orderId,
        internal_notes: existing?.internal_notes ? `${existing.internal_notes}\n${line}` : line,
        updated_at: new Date().toISOString(),
      });

      if (error) throw new Error(`Falha ao adicionar nota: ${error.message}`);

      return {
        sucesso: true,
        orderId,
        nota: content,
        mensagem: "Nota administrativa registrada com sucesso.",
      };
    },
  },

  // 7. LISTAR CARTAS POKÉMON
  {
    name: "listar_cartas",
    title: "Listar Catálogo de Cartas Avulsas",
    description: "Consulta cartas Pokémon avulsas no catálogo com filtros por nome, coleção, raridade e disponibilidade em estoque.",
    inputSchema: {
      type: "object",
      properties: {
        busca: {
          type: "string",
          description: "Nome da carta (ex: 'Charizard', 'Pikachu').",
        },
        colecao: {
          type: "string",
          description: "Nome ou sigla da coleção (ex: '151', 'Obsidian Flames').",
        },
        raridade: {
          type: "string",
          description: "Raridade (ex: 'Secret Rare', 'Illustration Rare').",
        },
        apenasComEstoque: {
          type: "boolean",
          description: "Se verdadeiro, traz apenas cartas com estoque > 0.",
          default: false,
        },
        pagina: {
          type: "number",
          description: "Número da página (padrão: 1).",
          default: 1,
        },
        limite: {
          type: "number",
          description: "Quantidade por página (máx: 50, padrão: 20).",
          default: 20,
        },
      },
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const page = Math.max(1, Number(args.pagina) || 1);
      const limit = Math.min(50, Math.max(1, Number(args.limite) || 20));
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabaseAdmin
        .from("cards")
        .select("id, name, card_number, collection, finish, condition, base_price_cents, stock, image, language", { count: "exact" })
        .order("name", { ascending: true })
        .range(from, to);

      if (args.busca) {
        query = query.ilike("name", `%${String(args.busca).trim()}%`);
      }
      if (args.colecao) {
        query = query.ilike("set", `%${String(args.colecao).trim()}%`);
      }
      if (args.raridade) {
        query = query.ilike("rarity", `%${String(args.raridade).trim()}%`);
      }
      if (args.apenasComEstoque) {
        query = query.gt("stock", 0);
      }

      const { data, count, error } = await query;
      if (error) throw new Error(`Falha ao consultar cartas: ${error.message}`);

      return {
        pagina: page,
        limite: limit,
        total: count || 0,
        cartas: (data || []).map((c) => ({
          id: c.id,
          nome: c.name,
          numero: c.card_number,
          colecao: c.collection,
          raridade: c.finish,
          condicao: c.condition,
          idioma: c.language,
          estoque: c.stock,
          precoReais: ((c.base_price_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          precoCentavos: c.base_price_cents,
          imagem: c.image,
        })),
      };
    },
  },

  // 8. OBTER CARTA
  {
    name: "obter_carta",
    title: "Obter Detalhes da Carta",
    description: "Consulta os dados completos de uma carta Pokémon individual pelo ID.",
    inputSchema: {
      type: "object",
      properties: {
        cardId: {
          type: "string",
          description: "ID da carta.",
        },
      },
      required: ["cardId"],
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const cardId = String(args.cardId).trim();
      const { data: card, error } = await supabaseAdmin
        .from("cards")
        .select("*")
        .eq("id", cardId)
        .maybeSingle();

      if (error) throw new Error(`Erro ao buscar carta: ${error.message}`);
      if (!card) throw new Error(`Carta ${cardId} não encontrada.`);

      return {
        carta: {
          id: card.id,
          nome: card.name,
          numero: card.card_number,
          colecao: card.collection,
          raridade: card.finish,
          condicao: card.condition,
          idioma: card.language,
          estoque: card.stock,
          precoReais: ((card.base_price_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          precoCentavos: card.base_price_cents,
          imagem: card.image,
          supertype: card.supertype,
          types: card.types,
          hp: card.hp,
          artist: card.artist,
        },
      };
    },
  },

  // 9. ATUALIZAR ESTOQUE DA CARTA
  {
    name: "atualizar_estoque_carta",
    title: "Atualizar Estoque de Carta",
    description: "Altera a quantidade em estoque de uma carta avulsa, registrando histórico e motivo da alteração.",
    inputSchema: {
      type: "object",
      properties: {
        cardId: {
          type: "string",
          description: "ID da carta.",
        },
        novoEstoque: {
          type: "number",
          description: "Nova quantidade em estoque (>= 0).",
        },
        motivo: {
          type: "string",
          description: "Justificativa da alteração de estoque (ex: reposição, ajuste de inventário).",
        },
        idempotencyKey: {
          type: "string",
          description: "Chave única de idempotência.",
        },
      },
      required: ["cardId", "novoEstoque"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args, context) => {
      const cardId = String(args.cardId).trim();
      const newStock = Math.max(0, Math.floor(Number(args.novoEstoque)));
      const reason = String(args.motivo || "Ajuste via ChatGPT").trim();

      const { data: card, error: fetchErr } = await supabaseAdmin
        .from("cards")
        .select("id, name, stock")
        .eq("id", cardId)
        .maybeSingle();

      if (fetchErr || !card) throw new Error(`Carta ${cardId} não encontrada.`);

      const oldStock = card.stock ?? 0;
      const delta = newStock - oldStock;

      const { error: updErr } = await supabaseAdmin
        .from("cards")
        .update({ stock: newStock })
        .eq("id", cardId);

      if (updErr) throw new Error(`Falha ao atualizar estoque: ${updErr.message}`);

      // Registrar histórico de movimentação
      try {
        await supabaseAdmin.from("card_stock_changes").insert({
          card_id: cardId,
          delta,
          reason: `${reason} (por ${context.email || "Admin"})`,
        });
      } catch {
        // ignore history error
      }

      return {
        sucesso: true,
        cardId,
        carta: card.name,
        estoqueAnterior: oldStock,
        novoEstoque: newStock,
        diferenca: delta,
        motivo: reason,
      };
    },
  },

  // 10. ATUALIZAR PREÇO DA CARTA
  {
    name: "atualizar_preco_carta",
    title: "Atualizar Preço de Carta",
    description: "Altera o valor em centavos ou reais de uma carta avulsa, registrando histórico de preços.",
    inputSchema: {
      type: "object",
      properties: {
        cardId: {
          type: "string",
          description: "ID da carta.",
        },
        precoCentavos: {
          type: "number",
          description: "Novo preço em centavos (ex: 1500 para R$ 15,00).",
        },
        precoReais: {
          type: "number",
          description: "Alternativa: novo preço em reais (ex: 15.00).",
        },
        idempotencyKey: {
          type: "string",
          description: "Chave única de idempotência.",
        },
      },
      required: ["cardId"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const cardId = String(args.cardId).trim();
      let cents: number;
      if (args.precoCentavos !== undefined) {
        cents = Math.round(Number(args.precoCentavos));
      } else if (args.precoReais !== undefined) {
        cents = Math.round(Number(args.precoReais) * 100);
      } else {
        throw new Error("Informe 'precoCentavos' ou 'precoReais'.");
      }

      if (cents <= 0) throw new Error("O preço deve ser maior que zero.");

      const { data: card, error: fetchErr } = await supabaseAdmin
        .from("cards")
        .select("id, name, base_price_cents")
        .eq("id", cardId)
        .maybeSingle();

      if (fetchErr || !card) throw new Error(`Carta ${cardId} não encontrada.`);

      const oldPrice = card.base_price_cents ?? 0;

      const { error: updErr } = await supabaseAdmin
        .from("cards")
        .update({ base_price_cents: cents })
        .eq("id", cardId);

      if (updErr) throw new Error(`Falha ao atualizar preço: ${updErr.message}`);

      // Registrar histórico de preço
      try {
        await supabaseAdmin.from("card_price_history").insert({
          card_id: cardId,
          price_cents: cents,
          source: "chatgpt_mcp_admin",
        });
      } catch {
        // ignore
      }

      return {
        sucesso: true,
        cardId,
        carta: card.name,
        precoAnteriorReais: (oldPrice / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        novoPrecoReais: (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        novoPrecoCentavos: cents,
      };
    },
  },

  // 11. LISTAR PRODUTOS LACRADOS
  {
    name: "listar_produtos_lacrados",
    title: "Listar Produtos Lacrados",
    description: "Consulta itens da categoria de lacrados (booster boxes, bundles, decks e latas).",
    inputSchema: {
      type: "object",
      properties: {
        busca: {
          type: "string",
          description: "Termo de busca no título.",
        },
        pagina: {
          type: "number",
          default: 1,
        },
        limite: {
          type: "number",
          default: 20,
        },
      },
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const page = Math.max(1, Number(args.pagina) || 1);
      const limit = Math.min(50, Math.max(1, Number(args.limite) || 20));
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabaseAdmin
        .from("sealed_products")
        .select("id, title, price_cents, stock, active, images", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (args.busca) {
        query = query.ilike("title", `%${String(args.busca).trim()}%`);
      }

      const { data, count, error } = await query;
      if (error) throw new Error(`Falha ao consultar lacrados: ${error.message}`);

      return {
        pagina: page,
        limite: limit,
        total: count || 0,
        produtos: (data || []).map((p) => ({
          id: p.id,
          titulo: p.title,
          precoReais: ((p.price_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          estoque: p.stock,
          ativo: p.active,
        })),
      };
    },
  },

  // 12. LISTAR ACESSÓRIOS
  {
    name: "listar_acessorios",
    title: "Listar Acessórios TCG",
    description: "Consulta produtos da seção de acessórios (sleeves, pastas, caixas de deck).",
    inputSchema: {
      type: "object",
      properties: {
        busca: {
          type: "string",
          description: "Termo de busca.",
        },
        categoria: {
          type: "string",
          description: "Categoria do acessório.",
        },
      },
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      let query = supabaseAdmin
        .from("accessories")
        .select("id, title, category, price_cents, stock, active")
        .order("sort_order", { ascending: true });

      if (args.busca) query = query.ilike("title", `%${String(args.busca).trim()}%`);
      if (args.categoria) query = query.ilike("category", `%${String(args.categoria).trim()}%`);

      const { data, error } = await query;
      if (error) throw new Error(`Falha ao consultar acessórios: ${error.message}`);

      return {
        total: (data || []).length,
        acessorios: (data || []).map((a) => ({
          id: a.id,
          titulo: a.title,
          categoria: a.category,
          estoque: a.stock,
          precoReais: ((a.price_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          ativo: a.active,
        })),
      };
    },
  },

  // 13. RELATÓRIO DE ESTOQUE BAIXO
  {
    name: "listar_estoque_baixo",
    title: "Relatório de Estoque Baixo ou Zerado",
    description: "Lista cartas e produtos com estoque igual ou menor ao limite especificado (alerta para reposição).",
    inputSchema: {
      type: "object",
      properties: {
        limiteMaximo: {
          type: "number",
          description: "Estoque máximo para inclusão no alerta (padrão: 2 unidades).",
          default: 2,
        },
      },
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const maxStock = Number(args.limiteMaximo) ?? 2;

      const { data: cards } = await supabaseAdmin
        .from("cards")
        .select("id, name, card_number, collection, stock, base_price_cents")
        .lte("stock", maxStock)
        .order("stock", { ascending: true })
        .limit(40);

      const { data: sealed } = await supabaseAdmin
        .from("sealed_products")
        .select("id, title, stock, price_cents")
        .lte("stock", maxStock)
        .order("stock", { ascending: true })
        .limit(20);

      return {
        limiteEstoque: maxStock,
        cartasBaixoEstoque: (cards || []).map((c) => ({
          id: c.id,
          nome: `${c.name} (${c.set} #${c.number})`,
          estoque: c.stock,
          precoReais: ((c.base_price_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        })),
        lacradosBaixoEstoque: (sealed || []).map((s) => ({
          id: s.id,
          titulo: s.title,
          estoque: s.stock,
          precoReais: ((s.price_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        })),
      };
    },
  },

  // 14. LISTAR CUPONS
  {
    name: "listar_cupons",
    title: "Listar Cupons de Desconto",
    description: "Consulta cupons cadastrados, tipos de desconto, usos realizados, limite e validade.",
    inputSchema: {
      type: "object",
      properties: {
        apenasAtivos: {
          type: "boolean",
          description: "Filtrar apenas cupons ativos.",
          default: true,
        },
      },
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      let query = supabaseAdmin
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false });

      if (args.apenasAtivos) {
        query = query.eq("active", true);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Falha ao consultar cupons: ${error.message}`);

      return {
        total: (data || []).length,
        cupons: (data || []).map((c) => ({
          id: c.id,
          codigo: c.code,
          ativo: c.active,
          usos: c.used_count || 0,
          maximoUsos: c.max_uses,
          validade: c.expires_at,
          descontoFixoCentavos: c.amount_cents,
          descontoPercentual: c.percent_off,
          minimoPedidoCentavos: c.min_subtotal_cents,
          notas: c.notes,
        })),
      };
    },
  },

  // 15. CRIAR CUPOM DE DESCONTO
  {
    name: "criar_cupom",
    title: "Criar Cupom de Desconto",
    description: "Cadastra um novo cupom de desconto com valor fixo ou percentual, validade e limite de usos.",
    inputSchema: {
      type: "object",
      properties: {
        codigo: {
          type: "string",
          description: "Código do cupom (ex: 'BEMVINDO10', 'SEVIIFREE').",
        },
        descontoPercentual: {
          type: "number",
          description: "Desconto em porcentagem (ex: 10 para 10%).",
        },
        descontoValorReais: {
          type: "number",
          description: "Desconto em valor fixo em reais (ex: 20.00 para R$ 20,00).",
        },
        minimoPedidoReais: {
          type: "number",
          description: "Valor mínimo do pedido em reais para poder usar o cupom.",
        },
        maximoUsos: {
          type: "number",
          description: "Quantidade máxima de vezes que o cupom pode ser resgatado.",
        },
        diasValidade: {
          type: "number",
          description: "Validade em dias a partir de hoje (padrão: 30 dias).",
          default: 30,
        },
        notas: {
          type: "string",
          description: "Descrição ou anotação interna sobre a campanha do cupom.",
        },
        idempotencyKey: {
          type: "string",
          description: "Chave única de idempotência.",
        },
      },
      required: ["codigo"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args, context) => {
      const code = String(args.codigo).trim().toUpperCase();
      if (!code) throw new Error("Código do cupom inválido.");

      const days = Number(args.diasValidade) || 30;
      const expiresAt = new Date(Date.now() + days * 86400 * 1000).toISOString();

      let amountCents: number | null = null;
      if (args.descontoValorReais !== undefined) {
        amountCents = Math.round(Number(args.descontoValorReais) * 100);
      }

      let minSubtotalCents: number | null = null;
      if (args.minimoPedidoReais !== undefined) {
        minSubtotalCents = Math.round(Number(args.minimoPedidoReais) * 100);
      }

      const payload = {
        code,
        active: true,
        percent_off: args.descontoPercentual ? Number(args.descontoPercentual) : null,
        amount_cents: amountCents,
        min_subtotal_cents: minSubtotalCents,
        max_uses: args.maximoUsos ? Number(args.maximoUsos) : null,
        expires_at: expiresAt,
        notes: `Criado via ChatGPT por ${context.email || "Admin"}: ${args.notas || ""}`,
      };

      const { data, error } = await supabaseAdmin
        .from("coupons")
        .insert(payload)
        .select()
        .single();

      if (error) throw new Error(`Falha ao criar cupom: ${error.message}`);

      return {
        sucesso: true,
        cupom: {
          id: data.id,
          codigo: data.code,
          ativo: data.active,
          descontoPercentual: data.percent_off,
          descontoFixoReais: data.amount_cents ? data.amount_cents / 100 : null,
          validade: data.expires_at,
          maximoUsos: data.max_uses,
        },
        mensagem: `Cupom ${code} criado com sucesso.`,
      };
    },
  },

  // 16. LISTAR PILHAS DE CARTAS
  {
    name: "listar_pilhas_ativas",
    title: "Listar Pilhas de Cartas Ativas",
    description: "Consulta clientes que utilizam o serviço 'Pilha de Cartas' da Sevii, com quantidade de itens guardados e prazo.",
    inputSchema: {
      type: "object",
      properties: {
        limite: {
          type: "number",
          default: 20,
        },
      },
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const limit = Math.min(50, Math.max(1, Number(args.limite) || 20));

      const { data: stacks, error } = await supabaseAdmin
        .from("card_stacks")
        .select("id, user_id, status, created_at, expires_at, notes")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Falha ao consultar pilhas: ${error.message}`);

      const results = [];
      for (const s of stacks || []) {
        const { count } = await supabaseAdmin
          .from("card_stack_items")
          .select("id", { count: "exact", head: true })
          .eq("stack_id", s.id);

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name, phone")
          .eq("user_id", s.user_id)
          .maybeSingle();

        results.push({
          pilhaId: s.id,
          cliente: profile?.full_name || "Cliente",
          telefone: profile?.phone,
          status: s.status,
          totalItensAcumulados: count || 0,
          criadaEm: s.created_at,
          expiraEm: s.expires_at,
        });
      }

      return {
        totalPilhasAbertas: results.length,
        pilhas: results,
      };
    },
  },

  // 17. LISTAR LEILÕES
  {
    name: "listar_leiloes",
    title: "Listar Leilões WhatsApp e Web",
    description: "Consulta os leilões cadastrados no painel, datas de início/fim e status (draft, active, finished).",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Status do leilão (active, finished, draft).",
        },
      },
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      let query = supabaseAdmin
        .from("auctions")
        .select("id, title, status, scheduled_start, scheduled_end, created_at")
        .order("created_at", { ascending: false })
        .limit(20);

      if (args.status) {
        query = query.eq("status", String(args.status).toLowerCase());
      }

      const { data, error } = await query;
      if (error) throw new Error(`Falha ao listar leilões: ${error.message}`);

      return {
        total: (data || []).length,
        leiloes: (data || []).map((l: any) => ({
          id: l.id,
          titulo: l.title,
          status: l.status,
          inicio: l.scheduled_start,
          fim: l.scheduled_end,
        })),
      };
    },
  },
];

export const tools: McpToolDefinition[] = [
  ...baseTools,
  ...catalogTools,
  ...mediaTools,
  ...auctionTools,
  ...storeTools,
];
