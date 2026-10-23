// @ts-nocheck -- MCP tools in progress: several queries still use column names that differ from the database; review before enabling.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpToolDefinition } from "../tools.server";

export const catalogTools: McpToolDefinition[] = [
  // 1. CRIAR CARTA
  {
    name: "criar_carta",
    title: "Cadastrar Nova Carta Avulsa (Single)",
    description: "Cadastra uma nova carta avulsa Pokémon no catálogo da Sevii Colecionáveis. Permite definir nome, número, coleção, idioma, acabamento (foil/normal/etc), condição (NM/SP/MP/HP/D), categoria (Pokémon, Treinador, Energia), estoque inicial, preço em reais e foto.",
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome da carta (ex: 'Charizard ex', 'Pikachu')" },
        numero: { type: "string", description: "Número da carta na coleção (ex: '006/165', '199/165')" },
        colecao: { type: "string", description: "Nome da coleção (ex: '151', 'Fagulhas Impetuosas', 'Coroa Estelar')" },
        idioma: {
          type: "string",
          enum: ["Português", "Inglês", "Espanhol", "Italiano", "Japonês", "Chinês"],
          default: "Português",
          description: "Idioma da carta",
        },
        acabamento: {
          type: "string",
          enum: ["Normal", "Reverse Foil", "Foil", "Pokebola", "Masterball", "Rocket", "Energia", "Promo", "Ímã", "Shattered Holo", "Illustration Rare", "Ultra Rara", "Black Star Promo", "Double Rare", "Liga"],
          default: "Normal",
          description: "Acabamento da carta",
        },
        condicao: {
          type: "string",
          enum: ["M", "NM", "SP", "MP", "HP", "D"],
          default: "NM",
          description: "Estado de conservação (NM = Near Mint, SP = Slightly Played, etc.)",
        },
        categoria: {
          type: "string",
          enum: ["Pokémon", "Treinador", "Energia"],
          default: "Pokémon",
          description: "Categoria da carta",
        },
        tipoPokemon: {
          type: "string",
          description: "Tipo do Pokémon se categoria for 'Pokémon' (ex: 'Fogo', 'Água', 'Elétrico', 'Psíquico')",
        },
        subtipoTreinador: {
          type: "string",
          description: "Subtipo se categoria for 'Treinador' (ex: 'Apoiador', 'Item', 'Estádio', 'Ferramenta')",
        },
        subtipoLiga: {
          type: "string",
          description: "Subtipo se acabamento for 'Liga' (ex: 'Carimbo 1st', 'Professor')",
        },
        estoque: {
          type: "integer",
          minimum: 0,
          default: 1,
          description: "Quantidade inicial em estoque",
        },
        precoReais: {
          type: "number",
          minimum: 0,
          description: "Preço de venda em reais (ex: 29.90 ou 150.00)",
        },
        precoCentavos: {
          type: "integer",
          minimum: 0,
          description: "Preço em centavos (ex: 2990 para R$ 29,90). Alternativa ao precoReais.",
        },
        imagemUrl: {
          type: "string",
          description: "URL da imagem da carta (armazenamento oficial ou pública)",
        },
        idempotencyKey: {
          type: "string",
          description: "Chave única opcional para evitar duplicação em caso de reenvio",
        },
      },
      required: ["nome", "numero", "colecao"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args, context) => {
      const nome = String(args.nome || "").trim();
      const numero = String(args.numero || "").trim();
      const colecao = String(args.colecao || "").trim();
      const idioma = args.idioma || "Português";
      const acabamento = args.acabamento || "Normal";
      const condicao = args.condicao || "NM";
      const categoria = args.categoria || "Pokémon";
      const estoque = Math.max(0, Number(args.estoque) || 0);

      if (!nome || !numero || !colecao) {
        throw new Error("Nome, número e coleção são campos obrigatórios para cadastrar uma carta.");
      }

      let priceCents: number | null = null;
      if (args.precoCentavos != null) {
        priceCents = Number(args.precoCentavos);
      } else if (args.precoReais != null) {
        priceCents = Math.round(Number(args.precoReais) * 100);
      }

      const payload: Record<string, any> = {
        name: nome,
        card_number: numero,
        collection: colecao,
        language: idioma,
        finish: acabamento,
        condition: condicao,
        category: categoria,
        stock: estoque,
        base_price_cents: priceCents,
        image: String(args.imagemUrl || "").trim(),
        pokemon_type: categoria === "Pokémon" && args.tipoPokemon ? String(args.tipoPokemon).trim() : null,
        trainer_subcategory: categoria === "Treinador" && args.subtipoTreinador ? String(args.subtipoTreinador).trim() : null,
        liga_subcategory: acabamento === "Liga" && args.subtipoLiga ? String(args.subtipoLiga).trim() : null,
        created_by: context.userId,
      };

      const { data, error } = await supabaseAdmin
        .from("cards")
        .insert(payload)
        .select()
        .single();

      if (error) {
        if (error.message.includes("duplicate") || error.code === "23505") {
          throw new Error(`Carta já existente: já existe uma carta com nome "${nome}", coleção "${colecao}", número "${numero}", acabamento "${acabamento}" e condição "${condicao}". Utilize editar_carta para atualizar.`);
        }
        throw new Error(`Erro ao cadastrar carta: ${error.message}`);
      }

      // Se houver preço inicial, registra histórico
      if (priceCents != null) {
        await supabaseAdmin.from("card_price_history").insert({
          card_id: data.id,
          old_price_cents: null,
          new_price_cents: priceCents,
          reason: "Preço inicial de cadastro via MCP",
          created_by: context.userId,
        });
      }

      return {
        success: true,
        mensagem: `Carta "${data.name}" (${data.collection} #${data.card_number}) cadastrada com sucesso!`,
        carta: {
          id: data.id,
          name: data.name,
          collection: data.collection,
          card_number: data.card_number,
          finish: data.finish,
          condition: data.condition,
          language: data.language,
          stock: data.stock,
          priceCents: data.base_price_cents,
          priceBrl: data.base_price_cents ? (data.base_price_cents / 100).toFixed(2) : null,
          image: data.image,
        },
      };
    },
  },

  // 2. EDITAR CARTA
  {
    name: "editar_carta",
    title: "Editar Carta Avulsa Existente",
    description: "Atualiza os dados de uma carta avulsa já cadastrada pelo seu ID: nome, número, coleção, acabamento, condição, categoria, estoque, preço ou imagem.",
    inputSchema: {
      type: "object",
      properties: {
        cartaId: { type: "string", description: "ID único da carta no banco de dados" },
        nome: { type: "string", description: "Novo nome da carta" },
        numero: { type: "string", description: "Novo número na coleção" },
        colecao: { type: "string", description: "Nova coleção" },
        idioma: { type: "string", enum: ["Português", "Inglês", "Espanhol", "Italiano", "Japonês", "Chinês"] },
        acabamento: { type: "string" },
        condicao: { type: "string", enum: ["M", "NM", "SP", "MP", "HP", "D"] },
        categoria: { type: "string", enum: ["Pokémon", "Treinador", "Energia"] },
        tipoPokemon: { type: "string" },
        subtipoTreinador: { type: "string" },
        subtipoLiga: { type: "string" },
        estoque: { type: "integer", minimum: 0, description: "Novo estoque absoluto" },
        precoReais: { type: "number", minimum: 0, description: "Novo preço em reais" },
        precoCentavos: { type: "integer", minimum: 0, description: "Novo preço em centavos" },
        imagemUrl: { type: "string", description: "Nova URL da imagem" },
        motivo: { type: "string", description: "Motivo da alteração para histórico administrativo" },
        idempotencyKey: { type: "string" },
      },
      required: ["cartaId"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args, context) => {
      const cardId = String(args.cartaId).trim();
      const { data: existing, error: findError } = await supabaseAdmin
        .from("cards")
        .select("*")
        .eq("id", cardId)
        .maybeSingle();

      if (findError || !existing) {
        throw new Error(`Carta com ID "${cardId}" não encontrada.`);
      }

      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (args.nome !== undefined) updates.name = String(args.nome).trim();
      if (args.numero !== undefined) updates.card_number = String(args.numero).trim();
      if (args.colecao !== undefined) updates.collection = String(args.colecao).trim();
      if (args.idioma !== undefined) updates.language = args.idioma;
      if (args.acabamento !== undefined) updates.finish = args.acabamento;
      if (args.condicao !== undefined) updates.condition = args.condicao;
      if (args.categoria !== undefined) updates.category = args.categoria;
      if (args.tipoPokemon !== undefined) updates.pokemon_type = args.tipoPokemon ? String(args.tipoPokemon).trim() : null;
      if (args.subtipoTreinador !== undefined) updates.trainer_subcategory = args.subtipoTreinador ? String(args.subtipoTreinador).trim() : null;
      if (args.subtipoLiga !== undefined) updates.liga_subcategory = args.subtipoLiga ? String(args.subtipoLiga).trim() : null;
      if (args.imagemUrl !== undefined) updates.image = String(args.imagemUrl).trim();

      // Estoque
      if (args.estoque !== undefined) {
        const newStock = Math.max(0, Number(args.estoque));
        const oldStock = existing.stock;
        updates.stock = newStock;
        if (newStock !== oldStock) {
          await supabaseAdmin.from("card_stock_changes").insert({
            card_id: cardId,
            old_stock: oldStock,
            new_stock: newStock,
            change_amount: newStock - oldStock,
            reason: args.motivo || "Ajuste via editar_carta MCP",
            created_by: context.userId,
          });
        }
      }

      // Preço
      let newPriceCents: number | null | undefined = undefined;
      if (args.precoCentavos !== undefined) {
        newPriceCents = Number(args.precoCentavos);
      } else if (args.precoReais !== undefined) {
        newPriceCents = Math.round(Number(args.precoReais) * 100);
      }

      if (newPriceCents !== undefined && newPriceCents !== existing.base_price_cents) {
        updates.base_price_cents = newPriceCents;
        await supabaseAdmin.from("card_price_history").insert({
          card_id: cardId,
          old_price_cents: existing.base_price_cents,
          new_price_cents: newPriceCents,
          reason: args.motivo || "Atualização de preço via editar_carta MCP",
          created_by: context.userId,
        });
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("cards")
        .update(updates)
        .eq("id", cardId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Erro ao atualizar carta: ${updateError.message}`);
      }

      return {
        success: true,
        mensagem: `Carta "${updated.name}" atualizada com sucesso!`,
        carta: {
          id: updated.id,
          name: updated.name,
          collection: updated.collection,
          card_number: updated.card_number,
          finish: updated.finish,
          condition: updated.condition,
          stock: updated.stock,
          priceCents: updated.base_price_cents,
          priceBrl: updated.base_price_cents ? (updated.base_price_cents / 100).toFixed(2) : null,
          image: updated.image,
        },
      };
    },
  },

  // 3. REMOVER OU ARQUIVAR CARTA
  {
    name: "remover_carta",
    title: "Remover ou Arquivar Carta",
    description: "Remove uma carta avulsa do catálogo. Para manter a integridade referencial de vendas e baralhos, se a carta possuir histórico de pedidos ou vínculos, o sistema arquiva automaticamente zerando o estoque (stock: 0). Se não possuir dependências, é removida do banco.",
    inputSchema: {
      type: "object",
      properties: {
        cartaId: { type: "string", description: "ID único da carta a remover" },
        motivo: { type: "string", description: "Justificativa da remoção ou arquivamento" },
        confirmacao: { type: "boolean", description: "Confirmação explícita para a operação", default: true },
      },
      required: ["cartaId"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    idempotent: true,
    handler: async (args, context) => {
      const cardId = String(args.cartaId).trim();
      const { data: existing, error: findError } = await supabaseAdmin
        .from("cards")
        .select("*")
        .eq("id", cardId)
        .maybeSingle();

      if (findError || !existing) {
        throw new Error(`Carta com ID "${cardId}" não encontrada.`);
      }

      // Checa se há itens de pedidos associados
      const { count: orderItemsCount } = await supabaseAdmin
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("card_id", cardId);

      // Checa se há baralhos usando a carta
      const { count: deckCount } = await supabaseAdmin
        .from("deck_cards")
        .select("id", { count: "exact", head: true })
        .eq("card_id", cardId);

      const hasDependencies = (orderItemsCount ?? 0) > 0 || (deckCount ?? 0) > 0;

      if (hasDependencies) {
        // Arquivamento seguro: zera estoque
        await supabaseAdmin.from("cards").update({ stock: 0, updated_at: new Date().toISOString() }).eq("id", cardId);
        await supabaseAdmin.from("card_stock_changes").insert({
          card_id: cardId,
          old_stock: existing.stock,
          new_stock: 0,
          change_amount: -existing.stock,
          reason: `Arquivamento via MCP (possui ${orderItemsCount ?? 0} pedido(s) e ${deckCount ?? 0} deck(s)): ${args.motivo || "Remoção solicitada"}`,
          created_by: context.userId,
        });

        return {
          success: true,
          acao: "arquivada",
          mensagem: `A carta "${existing.name}" possui histórico em ${orderItemsCount ?? 0} pedido(s). Para preservar a integridade das compras e relatórios, ela foi ARQUIVADA com estoque zerado (stock = 0) em vez de excluída fisicamente.`,
          cartaId: cardId,
        };
      }

      // Sem dependências: remoção física
      const { error: delError } = await supabaseAdmin.from("cards").delete().eq("id", cardId);
      if (delError) {
        throw new Error(`Falha ao remover carta: ${delError.message}`);
      }

      return {
        success: true,
        acao: "removida",
        mensagem: `Carta "${existing.name}" (#${existing.card_number} ${existing.collection}) removida permanentemente do catálogo.`,
        cartaId: cardId,
      };
    },
  },

  // 4. OPERAÇÕES EM LOTE PARA CARTAS
  {
    name: "operacoes_em_lote_cartas",
    title: "Operações em Lote para Cartas (Prévia ou Execução)",
    description: "Executa operações em massa em cartas avulsas (ajuste percentual de preço, reajuste fixo, alteração de estoque ou zerar estoque). Suporta 'previa: true' para simular e inspecionar os resultados antes de aplicar qualquer alteração.",
    inputSchema: {
      type: "object",
      properties: {
        cartaIds: {
          type: "array",
          items: { type: "string" },
          description: "Lista de IDs das cartas a processar",
        },
        filtroColecao: {
          type: "string",
          description: "Opcional: aplicar a todas as cartas de uma coleção específica caso cartaIds não seja informado",
        },
        acao: {
          type: "string",
          enum: ["ajustar_preco_percentual", "definir_preco_fixo", "zerar_estoque", "ajustar_estoque_delta"],
          description: "Ação a ser executada",
        },
        percentual: {
          type: "number",
          description: "Para 'ajustar_preco_percentual': percentual de reajuste (ex: 10 para +10%, -15 para -15%)",
        },
        novoPrecoReais: {
          type: "number",
          description: "Para 'definir_preco_fixo': novo valor em reais",
        },
        deltaEstoque: {
          type: "integer",
          description: "Para 'ajustar_estoque_delta': quantidade a somar ou subtrair (ex: +5, -2)",
        },
        previa: {
          type: "boolean",
          default: true,
          description: "Se true, apenas calcula e retorna a prévia sem modificar o banco de dados",
        },
        motivo: {
          type: "string",
          description: "Motivo registrado no histórico da loja",
        },
      },
      required: ["acao"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args, context) => {
      let query = supabaseAdmin.from("cards").select("id, name, collection, card_number, finish, stock, base_price_cents");

      if (Array.isArray(args.cartaIds) && args.cartaIds.length > 0) {
        query = query.in("id", args.cartaIds);
      } else if (args.filtroColecao) {
        query = query.eq("collection", String(args.filtroColecao).trim());
      } else {
        throw new Error("Informe uma lista de IDs em 'cartaIds' ou uma coleção em 'filtroColecao'.");
      }

      const { data: cards, error: fetchErr } = await query;
      if (fetchErr) throw new Error(`Falha ao buscar cartas: ${fetchErr.message}`);
      if (!cards || cards.length === 0) {
        return { success: true, totalCartas: 0, mensagem: "Nenhuma carta encontrada com os filtros informados." };
      }

      const isPreview = args.previa !== false;
      const results: any[] = [];

      for (const card of cards) {
        let newStock = card.stock;
        let newPriceCents = card.base_price_cents;
        let modificado = false;

        switch (args.acao) {
          case "zerar_estoque":
            newStock = 0;
            modificado = card.stock !== 0;
            break;
          case "ajustar_estoque_delta": {
            const delta = Number(args.deltaEstoque) || 0;
            newStock = Math.max(0, card.stock + delta);
            modificado = newStock !== card.stock;
            break;
          }
          case "ajustar_preco_percentual": {
            if (card.base_price_cents != null) {
              const perc = Number(args.percentual) || 0;
              newPriceCents = Math.max(1, Math.round(card.base_price_cents * (1 + perc / 100)));
              modificado = newPriceCents !== card.base_price_cents;
            }
            break;
          }
          case "definir_preco_fixo": {
            if (args.novoPrecoReais != null) {
              newPriceCents = Math.round(Number(args.novoPrecoReais) * 100);
              modificado = newPriceCents !== card.base_price_cents;
            }
            break;
          }
        }

        results.push({
          id: card.id,
          nome: `${card.name} (#${card.card_number} ${card.collection})`,
          estoqueAnterior: card.stock,
          novoEstoque: newStock,
          precoAnteriorBrl: card.base_price_cents ? (card.base_price_cents / 100).toFixed(2) : null,
          novoPrecoBrl: newPriceCents ? (newPriceCents / 100).toFixed(2) : null,
          alterado: modificado,
        });

        if (!isPreview && modificado) {
          await supabaseAdmin
            .from("cards")
            .update({ stock: newStock, base_price_cents: newPriceCents, updated_at: new Date().toISOString() })
            .eq("id", card.id);

          if (newStock !== card.stock) {
            await supabaseAdmin.from("card_stock_changes").insert({
              card_id: card.id,
              old_stock: card.stock,
              new_stock: newStock,
              change_amount: newStock - card.stock,
              reason: args.motivo || "Operação em lote MCP",
              created_by: context.userId,
            });
          }

          if (newPriceCents !== card.base_price_cents) {
            await supabaseAdmin.from("card_price_history").insert({
              card_id: card.id,
              old_price_cents: card.base_price_cents,
              new_price_cents: newPriceCents,
              reason: args.motivo || "Reajuste em lote MCP",
              created_by: context.userId,
            });
          }
        }
      }

      return {
        success: true,
        modo: isPreview ? "PREVIA" : "EXECUTADO",
        totalItens: results.length,
        totalAlterados: results.filter((r) => r.alterado).length,
        mensagem: isPreview
          ? "Prévia calculada com sucesso. Para confirmar a alteração em massa, execute novamente informando previa: false."
          : `${results.filter((r) => r.alterado).length} carta(s) alterada(s) com sucesso.`,
        itens: results.slice(0, 100),
      };
    },
  },

  // 5. OBTER PRODUTO LACRADO
  {
    name: "obter_produto_lacrado",
    title: "Obter Detalhes de Produto Lacrado",
    description: "Consulta os dados completos de um produto lacrado (Booster Box, ETB, Bundle, etc.) pelo seu ID.",
    inputSchema: {
      type: "object",
      properties: {
        produtoId: { type: "string", description: "ID do produto lacrado" },
      },
      required: ["produtoId"],
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const { data, error } = await supabaseAdmin
        .from("sealed_products")
        .select("*")
        .eq("id", String(args.produtoId).trim())
        .maybeSingle();

      if (error || !data) throw new Error(`Produto lacrado com ID "${args.produtoId}" não encontrado.`);

      return {
        id: data.id,
        title: data.title,
        description: data.description,
        priceCents: data.price_cents,
        priceBrl: (data.price_cents / 100).toFixed(2),
        stock: data.stock,
        active: data.active,
        images: data.images || [],
        isPreorder: data.is_preorder,
        releaseDate: data.release_date,
        productType: data.product_type,
        collection: data.collection,
        language: data.language,
        distribution: data.distribution,
        condition: data.condition,
        ageRating: data.age_rating,
        sku: data.sku,
        sortOrder: data.sort_order,
      };
    },
  },

  // 6. CRIAR PRODUTO LACRADO
  {
    name: "criar_produto_lacrado",
    title: "Criar Produto Lacrado",
    description: "Cadastra um novo produto lacrado no catálogo (Booster Box, Blister, ETB, Lata, etc.) com todos os campos oficiais.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título do produto (ex: 'Booster Box Pokémon 151')" },
        descricao: { type: "string", description: "Descrição detalhada do produto" },
        precoReais: { type: "number", minimum: 0, description: "Preço de venda em reais (ex: 299.90)" },
        estoque: { type: "integer", minimum: 0, default: 0, description: "Quantidade em estoque" },
        tipoProduto: {
          type: "string",
          description: "Tipo do produto (ex: 'Booster Box', 'ETB (Elite Trainer Box)', 'Booster Bundle', 'Blister Triplo')",
        },
        colecao: { type: "string", description: "Nome da coleção associada" },
        idioma: { type: "string", description: "Idioma (ex: 'Português (Brasil)', 'Inglês', 'Japonês')" },
        distribuicao: { type: "string", description: "Distribuidora (ex: 'Copag', 'Importado')" },
        condicao: { type: "string", default: "Novo e Lacrado" },
        ativo: { type: "boolean", default: true, description: "Se o produto fica visível na loja imediatamente" },
        preVenda: { type: "boolean", default: false, description: "Indica se é item de pré-venda" },
        dataLancamento: { type: "string", description: "Data de lançamento para pré-venda (YYYY-MM-DD)" },
        sku: { type: "string", description: "Código SKU de identificação" },
        imagens: { type: "array", items: { type: "string" }, description: "Lista de URLs das imagens do produto" },
        imagemPrincipal: { type: "string", description: "URL da imagem principal (atalho para imagens[0])" },
      },
      required: ["titulo", "precoReais"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const title = String(args.titulo || "").trim();
      const priceCents = Math.round(Number(args.precoReais) * 100);
      const stock = Math.max(0, Number(args.estoque) || 0);

      const images: string[] = Array.isArray(args.imagens) ? [...args.imagens] : [];
      if (args.imagemPrincipal && !images.includes(args.imagemPrincipal)) {
        images.unshift(args.imagemPrincipal);
      }

      const payload = {
        title,
        description: args.descricao ? String(args.descricao).trim() : null,
        price_cents: priceCents,
        stock,
        images,
        active: args.ativo !== false,
        is_preorder: Boolean(args.preVenda),
        release_date: args.dataLancamento || null,
        product_type: args.tipoProduto || null,
        collection: args.colecao || null,
        language: args.idioma || "Português (Brasil)",
        distribution: args.distribuicao || "Copag",
        condition: args.condicao || "Novo e Lacrado",
        sku: args.sku || null,
      };

      const { data, error } = await supabaseAdmin
        .from("sealed_products")
        .insert(payload)
        .select()
        .single();

      if (error) throw new Error(`Falha ao cadastrar produto lacrado: ${error.message}`);

      return {
        success: true,
        mensagem: `Produto lacrado "${data.title}" cadastrado com sucesso!`,
        produto: {
          id: data.id,
          title: data.title,
          priceBrl: (data.price_cents / 100).toFixed(2),
          stock: data.stock,
          active: data.active,
          images: data.images,
        },
      };
    },
  },

  // 7. EDITAR PRODUTO LACRADO
  {
    name: "editar_produto_lacrado",
    title: "Editar Produto Lacrado Existente",
    description: "Atualiza título, descrição, preço, estoque, tipo, status ou fotos de um produto lacrado.",
    inputSchema: {
      type: "object",
      properties: {
        produtoId: { type: "string", description: "ID do produto lacrado" },
        titulo: { type: "string" },
        descricao: { type: "string" },
        precoReais: { type: "number", minimum: 0 },
        estoque: { type: "integer", minimum: 0 },
        tipoProduto: { type: "string" },
        colecao: { type: "string" },
        idioma: { type: "string" },
        distribuicao: { type: "string" },
        condicao: { type: "string" },
        ativo: { type: "boolean" },
        preVenda: { type: "boolean" },
        dataLancamento: { type: "string" },
        sku: { type: "string" },
        imagens: { type: "array", items: { type: "string" } },
      },
      required: ["produtoId"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const prodId = String(args.produtoId).trim();
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };

      if (args.titulo !== undefined) updates.title = String(args.titulo).trim();
      if (args.descricao !== undefined) updates.description = args.descricao ? String(args.descricao).trim() : null;
      if (args.precoReais !== undefined) updates.price_cents = Math.round(Number(args.precoReais) * 100);
      if (args.estoque !== undefined) updates.stock = Math.max(0, Number(args.estoque));
      if (args.tipoProduto !== undefined) updates.product_type = args.tipoProduto;
      if (args.colecao !== undefined) updates.collection = args.colecao;
      if (args.idioma !== undefined) updates.language = args.idioma;
      if (args.distribuicao !== undefined) updates.distribution = args.distribuicao;
      if (args.condicao !== undefined) updates.condition = args.condicao;
      if (args.ativo !== undefined) updates.active = Boolean(args.ativo);
      if (args.preVenda !== undefined) updates.is_preorder = Boolean(args.preVenda);
      if (args.dataLancamento !== undefined) updates.release_date = args.dataLancamento;
      if (args.sku !== undefined) updates.sku = args.sku;
      if (Array.isArray(args.imagens)) updates.images = args.imagens;

      const { data, error } = await supabaseAdmin
        .from("sealed_products")
        .update(updates)
        .eq("id", prodId)
        .select()
        .single();

      if (error) throw new Error(`Falha ao editar produto lacrado: ${error.message}`);

      return {
        success: true,
        mensagem: `Produto lacrado "${data.title}" atualizado com sucesso!`,
        produto: {
          id: data.id,
          title: data.title,
          priceBrl: (data.price_cents / 100).toFixed(2),
          stock: data.stock,
          active: data.active,
          images: data.images,
        },
      };
    },
  },

  // 8. ALTERAR STATUS OU REMOVER PRODUTO LACRADO
  {
    name: "alterar_status_produto_lacrado",
    title: "Publicar, Despublicar ou Remover Produto Lacrado",
    description: "Altera a visibilidade (ativo/inativo) ou remove um produto lacrado do catálogo com verificação de segurança.",
    inputSchema: {
      type: "object",
      properties: {
        produtoId: { type: "string", description: "ID do produto lacrado" },
        acao: { type: "string", enum: ["publicar", "despublicar", "remover"], description: "Ação a ser executada" },
        confirmacao: { type: "boolean", description: "Confirmação explícita para remoção" },
      },
      required: ["produtoId", "acao"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    idempotent: true,
    handler: async (args) => {
      const prodId = String(args.produtoId).trim();
      const acao = args.acao;

      if (acao === "publicar") {
        await supabaseAdmin.from("sealed_products").update({ active: true }).eq("id", prodId);
        return { success: true, mensagem: `Produto lacrado (${prodId}) publicado na loja.` };
      }

      if (acao === "despublicar") {
        await supabaseAdmin.from("sealed_products").update({ active: false }).eq("id", prodId);
        return { success: true, mensagem: `Produto lacrado (${prodId}) despublicado da loja.` };
      }

      // Remover
      const { count: orderItemsCount } = await supabaseAdmin
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("card_id", `sealed:${prodId}`);

      if ((orderItemsCount ?? 0) > 0) {
        await supabaseAdmin.from("sealed_products").update({ active: false, stock: 0 }).eq("id", prodId);
        return {
          success: true,
          acao: "arquivado",
          mensagem: `O produto possui pedidos vinculados. Ele foi despublicado e teve o estoque zerado (arquivado) para preservar o histórico.`,
        };
      }

      const { error } = await supabaseAdmin.from("sealed_products").delete().eq("id", prodId);
      if (error) throw new Error(`Falha ao remover produto lacrado: ${error.message}`);

      return { success: true, acao: "removido", mensagem: `Produto lacrado removido com sucesso.` };
    },
  },

  // 9. OBTER ACESSÓRIO
  {
    name: "obter_acessorio",
    title: "Obter Detalhes de Acessório",
    description: "Consulta detalhes de um acessório (sleeves, binders, dados, playmats) e suas variações cadastradas.",
    inputSchema: {
      type: "object",
      properties: {
        acessorioId: { type: "string", description: "ID do acessório" },
      },
      required: ["acessorioId"],
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const { data, error } = await supabaseAdmin
        .from("accessories")
        .select("*")
        .eq("id", String(args.acessorioId).trim())
        .maybeSingle();

      if (error || !data) throw new Error(`Acessório com ID "${args.acessorioId}" não encontrado.`);

      return {
        id: data.id,
        title: data.title,
        description: data.description,
        category: data.category,
        priceCents: data.price_cents,
        priceBrl: (data.price_cents / 100).toFixed(2),
        stock: data.stock,
        active: data.active,
        images: data.images || [],
        variants: data.variants || [],
        sortOrder: data.sort_order,
      };
    },
  },

  // 10. CRIAR ACESSÓRIO
  {
    name: "criar_acessorio",
    title: "Cadastrar Novo Acessório",
    description: "Cadastra um novo acessório (Sleeves/Shields, Playmats, Binders, Top Loader, Deck Box, etc.) com suporte a variações de cor/tamanho.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Nome do acessório" },
        categoria: {
          type: "string",
          enum: ["Sleeves/Shields", "Dados", "Marcadores de dano", "Moedas", "Playmats", "Binders", "Top Loader", "Deck box", "Kit jogável"],
          description: "Categoria do acessório",
        },
        descricao: { type: "string" },
        precoReais: { type: "number", minimum: 0, description: "Preço padrão em reais" },
        estoque: { type: "integer", minimum: 0, default: 0 },
        ativo: { type: "boolean", default: true },
        imagens: { type: "array", items: { type: "string" } },
        imagemPrincipal: { type: "string" },
        variacoes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              color: { type: "string" },
              price_cents: { type: "integer" },
              stock: { type: "integer" },
              images: { type: "array", items: { type: "string" } },
            },
          },
          description: "Variações opcionais (ex: cores diferentes de sleeves)",
        },
      },
      required: ["titulo", "categoria", "precoReais"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const title = String(args.titulo || "").trim();
      const priceCents = Math.round(Number(args.precoReais) * 100);
      const stock = Math.max(0, Number(args.estoque) || 0);

      const images: string[] = Array.isArray(args.imagens) ? [...args.imagens] : [];
      if (args.imagemPrincipal && !images.includes(args.imagemPrincipal)) {
        images.unshift(args.imagemPrincipal);
      }

      const formattedVariants = (args.variacoes || []).map((v: any) => ({
        id: crypto.randomUUID(),
        name: v.name || "",
        color: v.color || null,
        price_cents: v.price_cents != null ? Number(v.price_cents) : priceCents,
        stock: Number(v.stock ?? 0) || 0,
        images: Array.isArray(v.images) ? v.images : [],
      }));

      const payload = {
        title,
        category: args.categoria,
        description: args.descricao ? String(args.descricao).trim() : null,
        price_cents: priceCents,
        stock,
        images,
        active: args.ativo !== false,
        variants: formattedVariants,
      };

      const { data, error } = await supabaseAdmin
        .from("accessories")
        .insert(payload)
        .select()
        .single();

      if (error) throw new Error(`Falha ao cadastrar acessório: ${error.message}`);

      return {
        success: true,
        mensagem: `Acessório "${data.title}" cadastrado com sucesso!`,
        acessorio: {
          id: data.id,
          title: data.title,
          category: data.category,
          priceBrl: (data.price_cents / 100).toFixed(2),
          stock: data.stock,
          active: data.active,
          variantsCount: formattedVariants.length,
        },
      };
    },
  },

  // 11. EDITAR ACESSÓRIO E VARIAÇÕES
  {
    name: "editar_acessorio",
    title: "Editar Acessório Existente",
    description: "Atualiza título, categoria, descrição, preço, estoque, status e fotos de um acessório.",
    inputSchema: {
      type: "object",
      properties: {
        acessorioId: { type: "string", description: "ID do acessório" },
        titulo: { type: "string" },
        categoria: { type: "string" },
        descricao: { type: "string" },
        precoReais: { type: "number", minimum: 0 },
        estoque: { type: "integer", minimum: 0 },
        ativo: { type: "boolean" },
        imagens: { type: "array", items: { type: "string" } },
      },
      required: ["acessorioId"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const accId = String(args.acessorioId).trim();
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };

      if (args.titulo !== undefined) updates.title = String(args.titulo).trim();
      if (args.categoria !== undefined) updates.category = args.categoria;
      if (args.descricao !== undefined) updates.description = args.descricao ? String(args.descricao).trim() : null;
      if (args.precoReais !== undefined) updates.price_cents = Math.round(Number(args.precoReais) * 100);
      if (args.estoque !== undefined) updates.stock = Math.max(0, Number(args.estoque));
      if (args.ativo !== undefined) updates.active = Boolean(args.ativo);
      if (Array.isArray(args.imagens)) updates.images = args.imagens;

      const { data, error } = await supabaseAdmin
        .from("accessories")
        .update(updates)
        .eq("id", accId)
        .select()
        .single();

      if (error) throw new Error(`Falha ao editar acessório: ${error.message}`);

      return {
        success: true,
        mensagem: `Acessório "${data.title}" atualizado com sucesso!`,
        acessorio: {
          id: data.id,
          title: data.title,
          category: data.category,
          priceBrl: (data.price_cents / 100).toFixed(2),
          stock: data.stock,
          active: data.active,
        },
      };
    },
  },

  // 12. ALTERAR STATUS OU REMOVER ACESSÓRIO
  {
    name: "alterar_status_acessorio",
    title: "Publicar, Despublicar ou Remover Acessório",
    description: "Altera status de visibilidade ou remove acessório com verificação de segurança.",
    inputSchema: {
      type: "object",
      properties: {
        acessorioId: { type: "string" },
        acao: { type: "string", enum: ["publicar", "despublicar", "remover"] },
        confirmacao: { type: "boolean" },
      },
      required: ["acessorioId", "acao"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    idempotent: true,
    handler: async (args) => {
      const accId = String(args.acessorioId).trim();
      const acao = args.acao;

      if (acao === "publicar") {
        await supabaseAdmin.from("accessories").update({ active: true }).eq("id", accId);
        return { success: true, mensagem: `Acessório (${accId}) publicado com sucesso.` };
      }

      if (acao === "despublicar") {
        await supabaseAdmin.from("accessories").update({ active: false }).eq("id", accId);
        return { success: true, mensagem: `Acessório (${accId}) despublicado com sucesso.` };
      }

      const { count: orderItemsCount } = await supabaseAdmin
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .ilike("card_id", `accessory:${accId}%`);

      if ((orderItemsCount ?? 0) > 0) {
        await supabaseAdmin.from("accessories").update({ active: false, stock: 0 }).eq("id", accId);
        return {
          success: true,
          acao: "arquivado",
          mensagem: `O acessório possui pedidos registrados. Ele foi despublicado e teve o estoque zerado (arquivado) para manter o histórico.`,
        };
      }

      const { error } = await supabaseAdmin.from("accessories").delete().eq("id", accId);
      if (error) throw new Error(`Falha ao excluir acessório: ${error.message}`);

      return { success: true, acao: "removido", mensagem: "Acessório excluído com sucesso." };
    },
  },

  // 13. LISTAR COLEÇÕES
  {
    name: "listar_colecoes",
    title: "Listar Coleções Cadastradas",
    description: "Lista todas as coleções de cartas e produtos lacrados existentes no sistema, com contagem de cartas em cada coleção.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    readOnly: true,
    destructive: false,
    idempotent: true,
    handler: async () => {
      const { data: cards, error } = await supabaseAdmin
        .from("cards")
        .select("collection");

      if (error) throw new Error(`Falha ao consultar coleções: ${error.message}`);

      const collectionCounts: Record<string, number> = {};
      for (const c of cards ?? []) {
        const col = c.collection?.trim();
        if (col) {
          collectionCounts[col] = (collectionCounts[col] || 0) + 1;
        }
      }

      const sorted = Object.entries(collectionCounts)
        .map(([nome, totalCartas]) => ({ nome, totalCartas }))
        .sort((a, b) => b.totalCartas - a.totalCartas);

      return {
        totalColecoes: sorted.length,
        colecoes: sorted,
      };
    },
  },
];
