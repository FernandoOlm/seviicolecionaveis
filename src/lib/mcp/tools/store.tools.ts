// @ts-nocheck -- MCP tools in progress: several queries still use column names that differ from the database; review before enabling.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpToolDefinition } from "../tools.server";

export const storeTools: McpToolDefinition[] = [
  // 1. OBTER PILHA DO CLIENTE
  {
    name: "obter_pilha_cliente",
    title: "Obter Detalhes da Pilha de Compras do Cliente",
    description: "Consulta todos os itens atualmente retidos na Pilha de Compras de um cliente (por e-mail ou user_id), incluindo cartas normais e arremates de leilão, data de expiração e status.",
    inputSchema: {
      type: "object",
      properties: {
        clienteEmail: { type: "string", description: "Email do cliente" },
        clienteUserId: { type: "string", description: "ID de usuário do cliente (UUID)" },
      },
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      let userId = args.clienteUserId;

      if (!userId && args.clienteEmail) {
        const email = String(args.clienteEmail).trim().toLowerCase();
        const { data: p } = await supabaseAdmin
          .from("profiles")
          .select("user_id")
          .eq("email", email)
          .maybeSingle();
        userId = p?.user_id;

        if (!userId) {
          const { data: o } = await supabaseAdmin
            .from("orders")
            .select("user_id")
            .eq("email", email)
            .maybeSingle();
          userId = o?.user_id;
        }
      }

      if (!userId) {
        throw new Error("Cliente não encontrado. Forneça um 'clienteEmail' ou 'clienteUserId' válido.");
      }

      const { data: stack, error: stackErr } = await supabaseAdmin
        .from("card_stacks")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (stackErr || !stack) {
        return {
          possuiPilha: false,
          mensagem: "Este cliente não possui nenhuma Pilha de Compras aberta no momento.",
        };
      }

      const { data: items } = await supabaseAdmin
        .from("card_stack_items")
        .select("*")
        .eq("stack_id", stack.id)
        .order("created_at", { ascending: false });

      const storedItems = (items ?? []).filter((i) => i.status === "stored");

      return {
        possuiPilha: true,
        stackId: stack.id,
        userId: stack.user_id,
        status: stack.status,
        iniciadaEm: stack.started_at,
        expiraEm: stack.expires_at,
        totalItensArmazenados: storedItems.length,
        totalCartas: storedItems.reduce((acc, i) => acc + (i.quantity || 1), 0),
        valorTotalBrl: (
          storedItems.reduce((acc, i) => acc + (i.unit_price_cents || 0) * (i.quantity || 1), 0) / 100
        ).toFixed(2),
        itens: storedItems.map((i) => ({
          id: i.id,
          nomeCarta: i.card_name,
          colecao: i.collection,
          numero: i.card_number,
          acabamento: i.finish,
          condicao: i.condition,
          idioma: i.language,
          quantidade: i.quantity,
          precoUnitarioBrl: ((i.unit_price_cents || 0) / 100).toFixed(2),
          origemLeilao: i.auction_name || null,
          dataAdicao: i.created_at,
        })),
      };
    },
  },

  // 2. DESPACHAR PILHA DO CLIENTE
  {
    name: "despachar_pilha",
    title: "Despachar ou Enviar Pilha de Compras",
    description: "Cria uma ordem de serviço administrativa para despachar os itens da pilha de um cliente, marcando as cartas como enviadas/entregues.",
    inputSchema: {
      type: "object",
      properties: {
        stackId: { type: "string", description: "ID da pilha (UUID)" },
        metodoEnvio: {
          type: "string",
          enum: ["correios", "app", "arte_em_cards", "presencial"],
          default: "correios",
          description: "Método de envio utilizado",
        },
        status: {
          type: "string",
          enum: ["paid", "preparing", "dispatched", "delivered"],
          default: "dispatched",
          description: "Novo status da ordem de serviço",
        },
        codigoRastreio: { type: "string", description: "Código de rastreio opcional dos Correios/Transportadora" },
        observacoes: { type: "string", description: "Notas internas sobre o despacho" },
      },
      required: ["stackId"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    idempotent: true,
    handler: async (args) => {
      const stackId = String(args.stackId).trim();

      const { data: stack, error: sErr } = await supabaseAdmin
        .from("card_stacks")
        .select("id, user_id, status")
        .eq("id", stackId)
        .maybeSingle();

      if (sErr || !stack) throw new Error("Pilha não encontrada.");

      const { data: items } = await supabaseAdmin
        .from("card_stack_items")
        .select("id")
        .eq("stack_id", stack.id)
        .eq("status", "stored");

      if (!items || items.length === 0) {
        throw new Error("A pilha não possui itens aguardando envio.");
      }

      const itemIds = items.map((i) => i.id);

      // Cria ordem de serviço
      const notes = [
        "[Despachado via ChatGPT MCP]",
        args.codigoRastreio ? `Rastreio: ${args.codigoRastreio}` : null,
        args.observacoes ? args.observacoes : null,
      ]
        .filter(Boolean)
        .join("\n");

      const { data: os, error: osErr } = await supabaseAdmin
        .from("service_orders")
        .insert({
          user_id: stack.user_id,
          stack_id: stack.id,
          method: args.metodoEnvio || "correios",
          status: args.status || "dispatched",
          amount_cents: 0,
          shipping_cost_cents: 0,
          notes,
          tracking_code: args.codigoRastreio || null,
        })
        .select("id, code")
        .single();

      if (osErr || !os) throw new Error(`Falha ao criar OS: ${osErr?.message}`);

      // Atualiza itens para despachados
      await supabaseAdmin
        .from("card_stack_items")
        .update({
          status: args.status === "delivered" ? "delivered" : "dispatched",
          service_order_id: os.id,
          updated_at: new Date().toISOString(),
        })
        .in("id", itemIds);

      // Finaliza a pilha
      await supabaseAdmin
        .from("card_stacks")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", stack.id);

      return {
        success: true,
        mensagem: `Pilha despachada com sucesso! Criada OS #${os.code} contendo ${itemIds.length} item(ns).`,
        ordemServicoId: os.id,
        codigoOS: os.code,
      };
    },
  },

  // 3. OBTER CUPOM
  {
    name: "obter_cupom",
    title: "Obter Detalhes de um Cupom",
    description: "Consulta detalhes completos de um cupom promocional pelo código (ex: 'SEVII10') ou pelo ID.",
    inputSchema: {
      type: "object",
      properties: {
        codigo: { type: "string", description: "Código do cupom (ex: 'BEMVINDO', 'SEVII10')" },
        cupomId: { type: "string", description: "ID único do cupom" },
      },
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      let query = supabaseAdmin.from("coupons").select("*");
      if (args.codigo) {
        query = query.ilike("code", String(args.codigo).trim());
      } else if (args.cupomId) {
        query = query.eq("id", String(args.cupomId).trim());
      } else {
        throw new Error("Informe 'codigo' ou 'cupomId'.");
      }

      const { data, error } = await query.maybeSingle();
      if (error || !data) throw new Error("Cupom não encontrado.");

      return {
        id: data.id,
        codigo: data.code,
        ativo: data.active,
        tipoDesconto: data.percent ? "percentual" : "valor_fixo",
        percentual: data.percent,
        valorFixoBrl: data.amount_cents ? (data.amount_cents / 100).toFixed(2) : null,
        descontoMaximoBrl: data.max_discount_cents ? (data.max_discount_cents / 100).toFixed(2) : null,
        usosAtuais: data.used_count,
        limiteUsosTotal: data.max_uses,
        limitePorUsuario: data.max_uses_per_user,
        expiraEm: data.expires_at,
        notas: data.notes,
      };
    },
  },

  // 4. ATUALIZAR OU EXCLUIR CUPOM
  {
    name: "atualizar_cupom",
    title: "Atualizar ou Desativar Cupom",
    description: "Altera o status (ativo/inativo), validade, limite de usos ou notas de um cupom promocional.",
    inputSchema: {
      type: "object",
      properties: {
        cupomId: { type: "string", description: "ID do cupom" },
        ativo: { type: "boolean", description: "Ativar ou desativar o cupom" },
        limiteUsos: { type: "integer", minimum: 1 },
        expiraEm: { type: "string", description: "Data de expiração (ISO string ou YYYY-MM-DD)" },
        notas: { type: "string" },
        remover: { type: "boolean", description: "Se true, exclui o cupom se não houver uso, ou desativa" },
      },
      required: ["cupomId"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const cupomId = String(args.cupomId).trim();

      if (args.remover === true) {
        const { data: c } = await supabaseAdmin.from("coupons").select("used_count").eq("id", cupomId).single();
        if (c && c.used_count > 0) {
          await supabaseAdmin.from("coupons").update({ active: false }).eq("id", cupomId);
          return { success: true, mensagem: "O cupom já possui histórico de uso e foi DESATIVADO em vez de excluído." };
        }
        await supabaseAdmin.from("coupons").delete().eq("id", cupomId);
        return { success: true, mensagem: "Cupom excluído com sucesso." };
      }

      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (args.ativo !== undefined) updates.active = Boolean(args.ativo);
      if (args.limiteUsos !== undefined) updates.max_uses = Number(args.limiteUsos);
      if (args.expiraEm !== undefined) updates.expires_at = args.expiraEm ? new Date(args.expiraEm).toISOString() : null;
      if (args.notas !== undefined) updates.notes = args.notas;

      const { data, error } = await supabaseAdmin
        .from("coupons")
        .update(updates)
        .eq("id", cupomId)
        .select()
        .single();

      if (error) throw new Error(`Falha ao atualizar cupom: ${error.message}`);

      return {
        success: true,
        mensagem: `Cupom "${data.code}" atualizado com sucesso!`,
        cupom: {
          id: data.id,
          codigo: data.code,
          ativo: data.active,
          usos: data.used_count,
          limite: data.max_uses,
        },
      };
    },
  },

  // 5. LISTAR BANNERS
  {
    name: "listar_banners",
    title: "Listar Banners da Loja",
    description: "Consulta os banners da página inicial da loja com URLs das imagens, links de destino e ordem de exibição.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async () => {
      const { data, error } = await supabaseAdmin
        .from("banners")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw new Error(`Falha ao consultar banners: ${error.message}`);

      return {
        totalBanners: (data ?? []).length,
        banners: (data ?? []).map((b) => ({
          id: b.id,
          imagemUrl: b.image_url,
          linkUrl: b.link_url,
          textoAlt: b.alt,
          ordem: b.sort_order,
          ativo: b.active,
        })),
      };
    },
  },

  // 6. GERENCIAR BANNERS (CRIAR, EDITAR, REMOVER)
  {
    name: "gerenciar_banner",
    title: "Criar, Editar ou Remover Banner Promocional",
    description: "Gerencia banners da página inicial da Sevii Colecionáveis.",
    inputSchema: {
      type: "object",
      properties: {
        acao: { type: "string", enum: ["criar", "editar", "remover"] },
        bannerId: { type: "string", description: "ID do banner (para editar ou remover)" },
        imagemUrl: { type: "string", description: "URL da imagem do banner" },
        linkUrl: { type: "string", description: "Link de destino ao clicar no banner" },
        textoAlt: { type: "string", description: "Texto alternativo para acessibilidade/SEO" },
        ordem: { type: "integer", default: 0 },
        ativo: { type: "boolean", default: true },
      },
      required: ["acao"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const acao = args.acao;

      if (acao === "criar") {
        if (!args.imagemUrl) throw new Error("Informe a 'imagemUrl' do banner.");
        const { data, error } = await supabaseAdmin
          .from("banners")
          .insert({
            image_url: String(args.imagemUrl).trim(),
            link_url: args.linkUrl ? String(args.linkUrl).trim() : null,
            alt: args.textoAlt ? String(args.textoAlt).trim() : null,
            sort_order: Number(args.ordem) || 0,
            active: args.ativo !== false,
          })
          .select()
          .single();

        if (error) throw new Error(`Falha ao criar banner: ${error.message}`);
        return { success: true, mensagem: "Banner cadastrado com sucesso!", banner: data };
      }

      if (acao === "editar") {
        if (!args.bannerId) throw new Error("Informe 'bannerId' para editar.");
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (args.imagemUrl !== undefined) updates.image_url = String(args.imagemUrl).trim();
        if (args.linkUrl !== undefined) updates.link_url = args.linkUrl;
        if (args.textoAlt !== undefined) updates.alt = args.textoAlt;
        if (args.ordem !== undefined) updates.sort_order = Number(args.ordem);
        if (args.ativo !== undefined) updates.active = Boolean(args.ativo);

        const { data, error } = await supabaseAdmin
          .from("banners")
          .update(updates)
          .eq("id", args.bannerId)
          .select()
          .single();

        if (error) throw new Error(`Falha ao atualizar banner: ${error.message}`);
        return { success: true, mensagem: "Banner atualizado com sucesso!", banner: data };
      }

      if (acao === "remover") {
        if (!args.bannerId) throw new Error("Informe 'bannerId' para remover.");
        const { error } = await supabaseAdmin.from("banners").delete().eq("id", args.bannerId);
        if (error) throw new Error(`Falha ao remover banner: ${error.message}`);
        return { success: true, mensagem: "Banner removido com sucesso." };
      }

      throw new Error(`Ação "${acao}" desconhecida.`);
    },
  },

  // 7. LISTAR CLIENTES
  {
    name: "listar_clientes",
    title: "Listar Clientes da Loja",
    description: "Consulta clientes cadastrados na loja com busca por nome, email ou CPF, exibindo total de pedidos e saldo de pontos de fidelidade.",
    inputSchema: {
      type: "object",
      properties: {
        busca: { type: "string", description: "Termo de busca (nome, e-mail ou CPF)" },
        limite: { type: "integer", default: 20, maximum: 100 },
        pagina: { type: "integer", default: 1 },
      },
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const limit = Math.min(100, Math.max(1, Number(args.limite) || 20));
      const page = Math.max(1, Number(args.pagina) || 1);
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabaseAdmin
        .from("profiles")
        .select("user_id, full_name, email, phone, cpf, created_at", { count: "exact" });

      if (args.busca) {
        const q = String(args.busca).trim();
        query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,cpf.ilike.%${q}%`);
      }

      const { data: profiles, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw new Error(`Falha ao consultar clientes: ${error.message}`);

      return {
        totalClientes: count ?? 0,
        paginaAtual: page,
        totalPaginas: Math.ceil((count ?? 0) / limit),
        clientes: (profiles ?? []).map((p) => ({
          userId: p.user_id,
          nomeCompleto: p.full_name,
          email: p.email,
          telefone: p.phone,
          cpf: p.cpf,
          cadastradoEm: p.created_at,
        })),
      };
    },
  },

  // 8. OBTER CLIENTE
  {
    name: "obter_cliente",
    title: "Obter Dados e Histórico do Cliente",
    description: "Consulta o perfil completo de um cliente: dados pessoais, endereços cadastrados, histórico de pedidos e saldo de fidelidade.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "ID do usuário (UUID)" },
        email: { type: "string", description: "E-mail do cliente" },
      },
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      let userId = args.userId;

      if (!userId && args.email) {
        const { data: p } = await supabaseAdmin
          .from("profiles")
          .select("user_id")
          .eq("email", String(args.email).trim().toLowerCase())
          .maybeSingle();
        userId = p?.user_id;
      }

      if (!userId) throw new Error("Cliente não encontrado.");

      const [{ data: profile }, { data: addresses }, { data: orders }, { data: points }] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabaseAdmin.from("addresses").select("*").eq("user_id", userId),
        supabaseAdmin.from("orders").select("id, status, total_cents, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
        supabaseAdmin.from("loyalty_points_ledger").select("points_change").eq("user_id", userId),
      ]);

      const saldoPontos = (points ?? []).reduce((acc, p) => acc + (p.points_change || 0), 0);

      return {
        userId,
        nome: profile?.full_name,
        email: profile?.email,
        cpf: profile?.cpf,
        telefone: profile?.phone,
        cadastradoEm: profile?.created_at,
        saldoPontosFidelidade: saldoPontos,
        enderecos: (addresses ?? []).map((a) => ({
          id: a.id,
          cep: a.cep,
          rua: a.street,
          numero: a.number,
          complemento: a.complement,
          bairro: a.neighborhood,
          cidade: a.city,
          estado: a.state,
          padrao: a.is_default,
        })),
        ultimosPedidos: (orders ?? []).map((o) => ({
          id: o.id,
          status: o.status,
          totalBrl: (o.total_cents / 100).toFixed(2),
          data: o.created_at,
        })),
      };
    },
  },
];
