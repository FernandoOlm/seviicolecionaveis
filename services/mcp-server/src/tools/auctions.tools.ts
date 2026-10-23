import { supabaseAdmin } from "../supabase.js";
import type { McpToolDefinition } from "./types.js";

export const auctionTools: McpToolDefinition[] = [
  // 1. OBTER DETALHES DE LEILÃO
  {
    name: "obter_leilao",
    title: "Obter Detalhes Completos do Leilão",
    description: "Consulta dados completos de um leilão pelo ID ou número: informações cadastrais, status, cadência de envio, ações entre blocos, todos os lotes com preços e arremates, e lances recebidos.",
    inputSchema: {
      type: "object",
      properties: {
        leilaoId: { type: "string", description: "ID único do leilão (UUID)" },
        numeroLeilao: { type: "integer", description: "Alternativa: número sequencial do leilão" },
      },
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      let query = supabaseAdmin.from("auctions").select("*");
      if (args.leilaoId) {
        query = query.eq("id", String(args.leilaoId).trim());
      } else if (args.numeroLeilao) {
        query = query.eq("auction_number", Number(args.numeroLeilao));
      } else {
        throw new Error("Informe 'leilaoId' ou 'numeroLeilao'.");
      }

      const { data: auction, error: aucErr } = await query.maybeSingle();
      if (aucErr || !auction) throw new Error("Leilão não encontrado.");

      const [{ data: items }, { data: bids }] = await Promise.all([
        supabaseAdmin.from("auction_items").select("*").eq("auction_id", auction.id).order("block_number").order("sequence"),
        supabaseAdmin.from("auction_bids").select("*").eq("auction_id", auction.id).order("created_at"),
      ]);

      const formattedItems = (items ?? []).map((it) => ({
        id: it.id,
        bloco: it.block_number,
        sequencia: it.sequence,
        nome: it.name,
        descricao: it.description,
        foto: it.image_url,
        quantidade: it.quantity,
        lanceInicialBrl: it.starting_price,
        incrementoBrl: it.bid_increment,
        arremateImediatoBrl: it.buyout_price,
        valoresExtras: it.extra_prices,
        status: it.status,
        vencedorNome: it.winner_name,
        vencedorTelefone: it.winner_phone,
        lanceFinalBrl: it.final_bid,
      }));

      return {
        id: auction.id,
        numero: auction.auction_number,
        titulo: auction.title,
        descricao: auction.description,
        status: auction.status,
        grupoJid: auction.group_jid,
        inicioAgendado: auction.scheduled_start,
        terminoAgendado: auction.scheduled_end,
        encerradoEm: auction.closed_at,
        mensagemEncerramento: auction.closing_message,
        cadenciaEnvio: {
          tempoEntreLotesSegundos: auction.item_delay_seconds ?? 3,
          pausaEntreBlocosSegundos: auction.block_delay_seconds ?? 30,
        },
        acoesPosBloco: auction.block_actions ?? [],
        totalLotes: formattedItems.length,
        lotes: formattedItems,
        totalLances: (bids ?? []).length,
      };
    },
  },

  // 2. CRIAR LEILÃO
  {
    name: "criar_leilao",
    title: "Criar Leilão (Rascunho ou Agendado)",
    description: "Cria um novo leilão para os grupos de WhatsApp da Sevii com lotes organizados por blocos, cadência de envio configurável e ações pós-bloco.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título do leilão (ex: 'Leilão Sevii #45 — Especial Cartas Raras')" },
        descricao: { type: "string", description: "Descrição ou regras adicionais do leilão" },
        grupoJid: { type: "string", description: "JID do grupo WhatsApp de destino (ex: '12036304...8@g.us')" },
        inicio: { type: "string", description: "Data/hora de início (ISO string ou YYYY-MM-DDTHH:MM)" },
        termino: { type: "string", description: "Data/hora de término (ISO string ou YYYY-MM-DDTHH:MM)" },
        status: { type: "string", enum: ["draft", "scheduled"], default: "draft", description: "Status inicial do leilão" },
        tempoEntreLotesSegundos: { type: "integer", default: 3, minimum: 1, maximum: 60, description: "Tempo entre disparo de cada lote" },
        pausaEntreBlocosSegundos: { type: "integer", default: 30, minimum: 0, maximum: 300, description: "Intervalo de respiro entre blocos" },
        mensagemEncerramento: { type: "string", default: "Os links de pagamento foram enviados no privado!" },
        acoesPosBloco: {
          type: "array",
          items: {
            type: "object",
            properties: {
              after_block: { type: "integer", minimum: 1 },
              type: { type: "string", enum: ["message", "command"] },
              content: { type: "string" },
            },
            required: ["after_block", "content"],
          },
          description: "Mensagens ou comandos WhatsApp a disparar após cada bloco",
        },
        lotes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nome: { type: "string" },
              descricao: { type: "string" },
              fotoUrl: { type: "string" },
              bloco: { type: "integer", minimum: 1, default: 1 },
              lanceInicial: { type: "number", minimum: 1 },
              incremento: { type: "number", minimum: 1 },
              arremateImediato: { type: "number", minimum: 1 },
              quantidade: { type: "integer", minimum: 1, default: 1 },
            },
            required: ["nome", "lanceInicial"],
          },
          description: "Lista de cartas/lotes do leilão",
        },
      },
      required: ["titulo", "grupoJid", "inicio", "termino"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const title = String(args.titulo || "").trim();
      const groupJid = String(args.grupoJid || "").trim();
      const startIso = new Date(args.inicio).toISOString();
      const endIso = new Date(args.termino).toISOString();

      if (new Date(endIso) <= new Date(startIso)) {
        throw new Error("A data/hora de término deve ser posterior à data de início.");
      }

      const blockActions = (args.acoesPosBloco || []).map((a: any, idx: number) => ({
        id: crypto.randomUUID(),
        after_block: Number(a.after_block) || 1,
        type: a.type || (String(a.content).trim().startsWith("!") ? "command" : "message"),
        content: String(a.content).trim(),
        sort_order: idx + 1,
      }));

      const payload = {
        title,
        description: args.descricao ? String(args.descricao).trim() : null,
        group_jid: groupJid,
        scheduled_start: startIso,
        scheduled_end: endIso,
        status: args.status || "draft",
        closing_message: args.mensagemEncerramento ? String(args.mensagemEncerramento).trim() : null,
        item_delay_seconds: Math.max(1, Number(args.tempoEntreLotesSegundos) || 3),
        block_delay_seconds: Math.max(0, Number(args.pausaEntreBlocosSegundos) || 30),
        block_actions: blockActions,
      };

      const { data: created, error: createErr } = await supabaseAdmin
        .from("auctions")
        .insert(payload)
        .select()
        .single();

      if (createErr || !created) throw new Error(`Falha ao criar leilão: ${createErr?.message}`);

      // Inserção dos lotes
      const lotes = args.lotes || [];
      if (lotes.length > 0) {
        const itemRows = lotes.map((l: any, idx: number) => ({
          auction_id: created.id,
          sequence: idx + 1,
          block_number: Math.max(1, Number(l.bloco) || 1),
          name: String(l.nome).trim(),
          description: l.descricao ? String(l.descricao).trim() : null,
          image_url: l.fotoUrl ? String(l.fotoUrl).trim() : null,
          starting_price: Number(l.lanceInicial) || 1,
          bid_increment: Number(l.incremento) || 1,
          buyout_price: l.arremateImediato ? Number(l.arremateImediato) : null,
          quantity: Math.max(1, Number(l.quantidade) || 1),
          extra_prices: [],
          status: "active",
        }));

        const { error: itemsErr } = await supabaseAdmin.from("auction_items").insert(itemRows);
        if (itemsErr) {
          throw new Error(`Leilão criado mas falhou ao cadastrar os lotes: ${itemsErr.message}`);
        }
      }

      return {
        success: true,
        mensagem: `Leilão "${created.title}" criado com sucesso (${created.status})!`,
        leilao: {
          id: created.id,
          numero: created.auction_number,
          titulo: created.title,
          status: created.status,
          inicio: created.scheduled_start,
          termino: created.scheduled_end,
          totalLotes: lotes.length,
        },
      };
    },
  },

  // 3. EDITAR LEILÃO
  {
    name: "editar_leilao",
    title: "Editar Leilão Existente",
    description: "Atualiza título, horários, grupo WhatsApp, cadência de envio e configurações de um leilão não-encerrado.",
    inputSchema: {
      type: "object",
      properties: {
        leilaoId: { type: "string", description: "ID único do leilão a editar" },
        titulo: { type: "string" },
        descricao: { type: "string" },
        grupoJid: { type: "string" },
        inicio: { type: "string" },
        termino: { type: "string" },
        status: { type: "string", enum: ["draft", "scheduled", "cancelled"] },
        tempoEntreLotesSegundos: { type: "integer", minimum: 1, maximum: 60 },
        pausaEntreBlocosSegundos: { type: "integer", minimum: 0, maximum: 300 },
        mensagemEncerramento: { type: "string" },
      },
      required: ["leilaoId"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const aucId = String(args.leilaoId).trim();
      const { data: existing, error: findErr } = await supabaseAdmin
        .from("auctions")
        .select("*")
        .eq("id", aucId)
        .maybeSingle();

      if (findErr || !existing) throw new Error("Leilão não encontrado.");

      if (existing.status === "closed") {
        throw new Error("Não é permitido editar um leilão já encerrado.");
      }

      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (args.titulo !== undefined) updates.title = String(args.titulo).trim();
      if (args.descricao !== undefined) updates.description = args.descricao ? String(args.descricao).trim() : null;
      if (args.grupoJid !== undefined) updates.group_jid = String(args.grupoJid).trim();
      if (args.inicio !== undefined) updates.scheduled_start = new Date(args.inicio).toISOString();
      if (args.termino !== undefined) updates.scheduled_end = new Date(args.termino).toISOString();
      if (args.status !== undefined) updates.status = args.status;
      if (args.tempoEntreLotesSegundos !== undefined) updates.item_delay_seconds = Number(args.tempoEntreLotesSegundos);
      if (args.pausaEntreBlocosSegundos !== undefined) updates.block_delay_seconds = Number(args.pausaEntreBlocosSegundos);
      if (args.mensagemEncerramento !== undefined) updates.closing_message = args.mensagemEncerramento;

      const { data: updated, error: updErr } = await supabaseAdmin
        .from("auctions")
        .update(updates)
        .eq("id", aucId)
        .select()
        .single();

      if (updErr) throw new Error(`Falha ao editar leilão: ${updErr.message}`);

      return {
        success: true,
        mensagem: `Leilão "${updated.title}" atualizado com sucesso!`,
        leilao: {
          id: updated.id,
          titulo: updated.title,
          status: updated.status,
          inicio: updated.scheduled_start,
          termino: updated.scheduled_end,
        },
      };
    },
  },

  // 4. GERENCIAR LOTES DO LEILÃO
  {
    name: "gerenciar_lotes_leilao",
    title: "Gerenciar Lotes de um Leilão (Adicionar, Editar, Remover ou Reordenar)",
    description: "Permite adicionar novas cartas/lotes a um leilão, editar valores de lotes existentes, alterar o bloco do lote ou remover lotes.",
    inputSchema: {
      type: "object",
      properties: {
        leilaoId: { type: "string", description: "ID do leilão" },
        acao: { type: "string", enum: ["adicionar_lote", "editar_lote", "remover_lote", "reordenar_lotes"] },
        loteId: { type: "string", description: "ID do lote (obrigatório para editar_lote e remover_lote)" },
        dadosLote: {
          type: "object",
          properties: {
            nome: { type: "string" },
            descricao: { type: "string" },
            fotoUrl: { type: "string" },
            bloco: { type: "integer", minimum: 1 },
            lanceInicial: { type: "number", minimum: 1 },
            incremento: { type: "number", minimum: 1 },
            arremateImediato: { type: "number" },
            quantidade: { type: "integer", minimum: 1 },
          },
        },
        ordemLotesIds: {
          type: "array",
          items: { type: "string" },
          description: "Para 'reordenar_lotes': lista dos IDs dos lotes na nova sequência",
        },
      },
      required: ["leilaoId", "acao"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const aucId = String(args.leilaoId).trim();
      const acao = args.acao;

      if (acao === "adicionar_lote") {
        const d = args.dadosLote;
        if (!d || !d.nome || !d.lanceInicial) {
          throw new Error("Informe nome e lance inicial para adicionar o lote.");
        }

        const { count } = await supabaseAdmin
          .from("auction_items")
          .select("id", { count: "exact", head: true })
          .eq("auction_id", aucId);

        const newSeq = (count ?? 0) + 1;

        const { data: created, error } = await supabaseAdmin
          .from("auction_items")
          .insert({
            auction_id: aucId,
            sequence: newSeq,
            block_number: Math.max(1, Number(d.bloco) || 1),
            name: String(d.nome).trim(),
            description: d.descricao ? String(d.descricao).trim() : null,
            image_url: d.fotoUrl ? String(d.fotoUrl).trim() : null,
            starting_price: Number(d.lanceInicial),
            bid_increment: Number(d.incremento) || 1,
            buyout_price: d.arremateImediato ? Number(d.arremateImediato) : null,
            quantity: Math.max(1, Number(d.quantidade) || 1),
            extra_prices: [],
            status: "active",
          })
          .select()
          .single();

        if (error) throw new Error(`Falha ao adicionar lote: ${error.message}`);
        return { success: true, mensagem: `Lote "${created.name}" adicionado ao Bloco ${created.block_number}!`, loteId: created.id };
      }

      if (acao === "editar_lote") {
        if (!args.loteId) throw new Error("Informe 'loteId' para editar.");
        const d = args.dadosLote || {};
        const updates: Record<string, any> = {};

        if (d.nome !== undefined) updates.name = String(d.nome).trim();
        if (d.descricao !== undefined) updates.description = d.descricao;
        if (d.fotoUrl !== undefined) updates.image_url = d.fotoUrl;
        if (d.bloco !== undefined) updates.block_number = Math.max(1, Number(d.bloco));
        if (d.lanceInicial !== undefined) updates.starting_price = Number(d.lanceInicial);
        if (d.incremento !== undefined) updates.bid_increment = Number(d.incremento);
        if (d.arremateImediato !== undefined) updates.buyout_price = d.arremateImediato;
        if (d.quantidade !== undefined) updates.quantity = Number(d.quantidade);

        const { error } = await supabaseAdmin.from("auction_items").update(updates).eq("id", args.loteId);
        if (error) throw new Error(`Falha ao editar lote: ${error.message}`);
        return { success: true, mensagem: `Lote atualizado com sucesso.` };
      }

      if (acao === "remover_lote") {
        if (!args.loteId) throw new Error("Informe 'loteId' para remover.");
        const { error } = await supabaseAdmin.from("auction_items").delete().eq("id", args.loteId);
        if (error) throw new Error(`Falha ao remover lote: ${error.message}`);
        return { success: true, mensagem: `Lote removido do leilão.` };
      }

      if (acao === "reordenar_lotes") {
        const order = args.ordemLotesIds;
        if (!Array.isArray(order) || order.length === 0) throw new Error("Informe a lista 'ordemLotesIds'.");

        for (let i = 0; i < order.length; i++) {
          await supabaseAdmin.from("auction_items").update({ sequence: i + 1 }).eq("id", order[i]);
        }
        return { success: true, mensagem: `${order.length} lotes reordenados com sucesso.` };
      }

      throw new Error(`Ação "${acao}" desconhecida.`);
    },
  },

  // 5. OPERAR LEILÃO (INICIAR, ENCERRAR, APROVAR, CANCELAR)
  {
    name: "operar_leilao",
    title: "Operações de Ciclo de Vida do Leilão",
    description: "Executa comandos de operação em tempo real: 'iniciar_agora' (dispara o envio dos lotes no grupo WhatsApp imediatamente via bot), 'encerrar_agora' (encerra as enquetes), 'aprovar_arremates' (aprova os vencedores) ou 'cancelar'.",
    inputSchema: {
      type: "object",
      properties: {
        leilaoId: { type: "string", description: "ID único do leilão" },
        comando: {
          type: "string",
          enum: ["iniciar_agora", "encerrar_agora", "aprovar_arremates", "cancelar_leilao"],
          description: "Comando a ser executado",
        },
        confirmacao: {
          type: "boolean",
          description: "Confirmação obrigatória para encerrar ou cancelar",
        },
        motivo: {
          type: "string",
          description: "Motivo opcional para registro em caso de cancelamento",
        },
      },
      required: ["leilaoId", "comando"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    idempotent: true,
    handler: async (args) => {
      const aucId = String(args.leilaoId).trim();
      const { data: auction, error: findErr } = await supabaseAdmin
        .from("auctions")
        .select("*")
        .eq("id", aucId)
        .maybeSingle();

      if (findErr || !auction) throw new Error("Leilão não encontrado.");

      if (args.comando === "iniciar_agora") {
        if (!auction.group_jid) throw new Error("Leilão sem grupo WhatsApp configurado.");

        // Limpa schedules pendentes antigos de start
        await supabaseAdmin
          .from("auction_schedules")
          .delete()
          .eq("auction_id", auction.id)
          .eq("action", "START")
          .eq("status", "pending");

        // Cria agendamento imediato
        const { error: schedErr } = await supabaseAdmin.from("auction_schedules").insert({
          auction_id: auction.id,
          action: "START",
          scheduled_time: new Date().toISOString(),
          group_jid: auction.group_jid,
          status: "pending",
        });

        if (schedErr) throw new Error(`Falha ao solicitar início do leilão: ${schedErr.message}`);

        await supabaseAdmin
          .from("auctions")
          .update({ status: "scheduled", scheduled_start: new Date().toISOString() })
          .eq("id", auction.id);

        return {
          success: true,
          mensagem: `Disparo do leilão "${auction.title}" solicitado com sucesso! O bot do WhatsApp começará o envio dos lotes no grupo.`,
        };
      }

      if (args.comando === "encerrar_agora") {
        if (args.confirmacao !== true) {
          throw new Error("Para encerrar o leilão agora, forneça confirmacao: true.");
        }

        const { error: schedErr } = await supabaseAdmin.from("auction_schedules").insert({
          auction_id: auction.id,
          action: "CLOSE",
          scheduled_time: new Date().toISOString(),
          group_jid: auction.group_jid,
        });

        if (schedErr) throw new Error(`Falha ao solicitar encerramento: ${schedErr.message}`);

        await supabaseAdmin
          .from("auctions")
          .update({ status: "closed", closed_at: new Date().toISOString() })
          .eq("id", auction.id);

        return {
          success: true,
          mensagem: `Encerramento do leilão "${auction.title}" solicitado ao bot com sucesso.`,
        };
      }

      if (args.comando === "aprovar_arremates") {
        const { data: pendingBids } = await supabaseAdmin
          .from("auction_bids")
          .select("id")
          .eq("auction_id", auction.id)
          .eq("status", "pending");

        const count = pendingBids?.length ?? 0;
        if (count === 0) {
          return { success: true, totalAprovados: 0, mensagem: "Nenhum arremate pendente para aprovação." };
        }

        const { error: updErr } = await supabaseAdmin
          .from("auction_bids")
          .update({ status: "approved" })
          .eq("auction_id", auction.id)
          .eq("status", "pending");

        if (updErr) throw new Error(`Erro ao aprovar arremates: ${updErr.message}`);

        return {
          success: true,
          totalAprovados: count,
          mensagem: `${count} arremate(s) aprovados com sucesso! O bot notificará os vencedores com os links de pagamento.`,
        };
      }

      if (args.comando === "cancelar_leilao") {
        if (args.confirmacao !== true) {
          throw new Error("Para cancelar o leilão, forneça confirmacao: true.");
        }

        await supabaseAdmin
          .from("auction_schedules")
          .delete()
          .eq("auction_id", auction.id)
          .eq("status", "pending");

        await supabaseAdmin
          .from("auctions")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", auction.id);

        return {
          success: true,
          mensagem: `Leilão "${auction.title}" cancelado com sucesso. Agendamentos pendentes foram removidos.`,
        };
      }

      throw new Error(`Comando "${args.comando}" não reconhecido.`);
    },
  },

  // 6. VINCULAR ARREMATES À PILHA DO CLIENTE
  {
    name: "vincular_arremate_pilha",
    title: "Vincular Cartas de Arremate à Pilha de Compras",
    description: "Insere as cartas arrematadas no leilão na Pilha de Compras do cliente no site (card_stacks + card_stack_items), permitindo que ele acumule cartas para envio conjunto.",
    inputSchema: {
      type: "object",
      properties: {
        clienteEmail: { type: "string", description: "Email cadastrado do cliente na Sevii" },
        nomeLeilao: { type: "string", description: "Nome ou número do leilão de origem" },
        dataLeilao: { type: "string", description: "Data do leilão (YYYY-MM-DD)" },
        enviarEmail: { type: "boolean", default: true, description: "Se envia notificação por email ao cliente" },
        cartas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              card_name: { type: "string" },
              card_id: { type: "string" },
              collection: { type: "string" },
              card_number: { type: "string" },
              finish: { type: "string" },
              language: { type: "string" },
              condition: { type: "string" },
              quantity: { type: "integer", minimum: 1, default: 1 },
              unit_price_cents: { type: "integer", minimum: 0 },
              unit_price_reais: { type: "number", minimum: 0 },
            },
            required: ["card_name"],
          },
          description: "Lista de cartas arrematadas a guardar na pilha",
        },
      },
      required: ["clienteEmail", "nomeLeilao", "cartas"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const email = String(args.clienteEmail).trim().toLowerCase();

      // Busca usuário pelo email em profiles ou auth
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("user_id, full_name")
        .eq("email", email)
        .maybeSingle();

      let userId = profile?.user_id;

      if (!userId) {
        // Tenta achar em orders anteriores
        const { data: prevOrder } = await supabaseAdmin
          .from("orders")
          .select("user_id")
          .eq("email", email)
          .maybeSingle();
        userId = prevOrder?.user_id;
      }

      if (!userId) {
        throw new Error(`Não foi encontrado nenhum usuário com o e-mail "${email}". O cliente precisa ter uma conta ou pedido anterior na Sevii.`);
      }

            // Garante pilha ativa
      let { data: stack } = await supabaseAdmin
        .from("card_stacks")
        .select("id, started_at, expires_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!stack) {
        const startedAt = new Date();
        const expiresAt = new Date(startedAt);
        expiresAt.setDate(expiresAt.getDate() + 30);
        const { data: newStack, error: newStackErr } = await supabaseAdmin
          .from("card_stacks")
          .insert({
            user_id: userId,
            started_at: startedAt.toISOString(),
            expires_at: expiresAt.toISOString(),
            status: "active",
          })
          .select("id, started_at, expires_at")
          .single();
        if (newStackErr) throw new Error(`Falha ao criar pilha de cartas: ${newStackErr.message}`);
        stack = newStack;
      }

      const items = args.cartas || [];
      const auctionDate = args.dataLeilao || new Date().toISOString().slice(0, 10);

      const rows = items.map((it: any) => {
        const cents = it.unit_price_cents != null
          ? Number(it.unit_price_cents)
          : Math.round((Number(it.unit_price_reais) || 0) * 100);

        return {
          stack_id: stack.id,
          user_id: userId,
          card_id: it.card_id || `auction:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
          card_name: String(it.card_name).trim(),
          card_image: it.card_image || null,
          collection: it.collection || null,
          card_number: it.card_number || null,
          finish: it.finish || "Normal",
          language: it.language || "PT",
          condition: it.condition || "NM",
          quantity: Math.max(1, Number(it.quantity) || 1),
          unit_price_cents: cents,
          status: "stored" as const,
          auction_name: String(args.nomeLeilao).trim(),
          auction_date: auctionDate,
        };
      });

      const { error: insErr } = await supabaseAdmin.from("card_stack_items").insert(rows);
      if (insErr) throw new Error(`Falha ao inserir itens na pilha: ${insErr.message}`);

      return {
        success: true,
        mensagem: `${rows.length} carta(s) do leilão vinculadas com sucesso à Pilha de Compras do cliente (${email})!`,
        stackId: stack.id,
        expiraEm: stack.expires_at,
        totalCartas: rows.reduce((acc, r) => acc + r.quantity, 0),
      };
    },
  },
];
