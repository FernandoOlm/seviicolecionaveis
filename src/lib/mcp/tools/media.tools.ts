import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uploadBase64Image, uploadImageFromRemoteUrl } from "../media.server";
import type { McpToolDefinition } from "../tools.server";

export const mediaTools: McpToolDefinition[] = [
  // 1. FAZER UPLOAD DE IMAGEM
  {
    name: "fazer_upload_imagem",
    title: "Fazer Upload de Imagem para o Armazenamento Oficial",
    description: "Salva uma imagem permanentemente no bucket oficial da Sevii ('card-images'). Aceita imagem enviada diretamente pelo chat em base64 (ou data URL 'data:image/...;base64,...') OU via URL pública remota (com proteção contra SSRF e validação de formato real/magic bytes). Retorna a URL pública permanente para uso no catálogo.",
    inputSchema: {
      type: "object",
      properties: {
        base64Data: {
          type: "string",
          description: "Conteúdo da imagem codificado em base64 (ex: enviado pelo usuário ou ferramenta)",
        },
        sourceUrl: {
          type: "string",
          description: "URL pública da imagem para importação e armazenamento permanente na Sevii",
        },
        prefixoNome: {
          type: "string",
          description: "Prefixo descritivo opcional para o arquivo (ex: 'charizard_ex', 'booster_box_151')",
        },
      },
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: false,
    handler: async (args) => {
      if (!args.base64Data && !args.sourceUrl) {
        throw new Error("Informe a imagem em 'base64Data' ou uma URL pública em 'sourceUrl'.");
      }

      let res;
      if (args.base64Data) {
        res = await uploadBase64Image(String(args.base64Data), args.prefixoNome);
      } else {
        res = await uploadImageFromRemoteUrl(String(args.sourceUrl), args.prefixoNome);
      }

      return {
        success: true,
        mensagem: "Imagem enviada e armazenada com sucesso no bucket oficial!",
        publicUrl: res.publicUrl,
        storagePath: res.storagePath,
        tamanhoBytes: res.fileSizeBytes,
        tipoMime: res.mimeType,
      };
    },
  },

  // 2. GERENCIAR IMAGENS DE PRODUTO
  {
    name: "gerenciar_imagens_produto",
    title: "Gerenciar Imagens e Fotos do Produto",
    description: "Associa uma foto enviada a um produto do catálogo (carta avulsa, produto lacrado, acessório ou lote de leilão). Permite definir imagem principal, adicionar à galeria, reordenar a galeria ou remover fotos.",
    inputSchema: {
      type: "object",
      properties: {
        tipoProduto: {
          type: "string",
          enum: ["carta", "lacrado", "acessorio", "lote_leilao"],
          description: "Tipo de produto",
        },
        produtoId: {
          type: "string",
          description: "ID do produto (carta, lacrado, acessório ou lote)",
        },
        acao: {
          type: "string",
          enum: ["definir_principal", "adicionar_galeria", "reordenar_galeria", "remover_imagem"],
          description: "Ação desejada na galeria do produto",
        },
        imagemUrl: {
          type: "string",
          description: "URL da imagem a definir, adicionar ou remover",
        },
        ordemImagens: {
          type: "array",
          items: { type: "string" },
          description: "Para 'reordenar_galeria': nova lista de URLs ordenadas",
        },
      },
      required: ["tipoProduto", "produtoId", "acao"],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    idempotent: true,
    handler: async (args) => {
      const { tipoProduto, produtoId, acao, imagemUrl } = args;

      switch (tipoProduto) {
        case "carta": {
          const { data: card, error: findErr } = await supabaseAdmin
            .from("cards")
            .select("id, name, image")
            .eq("id", produtoId)
            .maybeSingle();

          if (findErr || !card) throw new Error(`Carta "${produtoId}" não encontrada.`);

          if (acao === "definir_principal" || acao === "adicionar_galeria") {
            if (!imagemUrl) throw new Error("Informe a 'imagemUrl' para atualizar a carta.");
            await supabaseAdmin.from("cards").update({ image: imagemUrl.trim() }).eq("id", produtoId);
            return { success: true, mensagem: `Foto principal da carta "${card.name}" atualizada!`, novaImagem: imagemUrl.trim() };
          }

          if (acao === "remover_imagem") {
            await supabaseAdmin.from("cards").update({ image: "" }).eq("id", produtoId);
            return { success: true, mensagem: `Foto da carta "${card.name}" removida.` };
          }
          break;
        }

        case "lacrado": {
          const { data: prod, error: findErr } = await supabaseAdmin
            .from("sealed_products")
            .select("id, title, images")
            .eq("id", produtoId)
            .maybeSingle();

          if (findErr || !prod) throw new Error(`Produto lacrado "${produtoId}" não encontrado.`);

          let images = Array.isArray(prod.images) ? [...prod.images] : [];

          if (acao === "definir_principal") {
            if (!imagemUrl) throw new Error("Informe a 'imagemUrl'.");
            images = [imagemUrl.trim(), ...images.filter((img) => img !== imagemUrl.trim())];
          } else if (acao === "adicionar_galeria") {
            if (!imagemUrl) throw new Error("Informe a 'imagemUrl'.");
            if (!images.includes(imagemUrl.trim())) images.push(imagemUrl.trim());
          } else if (acao === "reordenar_galeria") {
            if (!Array.isArray(args.ordemImagens)) throw new Error("Informe a lista 'ordemImagens'.");
            images = args.ordemImagens;
          } else if (acao === "remover_imagem") {
            if (!imagemUrl) throw new Error("Informe a 'imagemUrl' a remover.");
            images = images.filter((img) => img !== imagemUrl.trim());
          }

          await supabaseAdmin.from("sealed_products").update({ images }).eq("id", produtoId);
          return {
            success: true,
            mensagem: `Galeria do produto lacrado "${prod.title}" atualizada com sucesso!`,
            totalImagens: images.length,
            imagemPrincipal: images[0] || null,
            galeria: images,
          };
        }

        case "acessorio": {
          const { data: acc, error: findErr } = await supabaseAdmin
            .from("accessories")
            .select("id, title, images")
            .eq("id", produtoId)
            .maybeSingle();

          if (findErr || !acc) throw new Error(`Acessório "${produtoId}" não encontrado.`);

          let images = Array.isArray(acc.images) ? [...acc.images] : [];

          if (acao === "definir_principal") {
            if (!imagemUrl) throw new Error("Informe a 'imagemUrl'.");
            images = [imagemUrl.trim(), ...images.filter((img) => img !== imagemUrl.trim())];
          } else if (acao === "adicionar_galeria") {
            if (!imagemUrl) throw new Error("Informe a 'imagemUrl'.");
            if (!images.includes(imagemUrl.trim())) images.push(imagemUrl.trim());
          } else if (acao === "reordenar_galeria") {
            if (!Array.isArray(args.ordemImagens)) throw new Error("Informe a lista 'ordemImagens'.");
            images = args.ordemImagens;
          } else if (acao === "remover_imagem") {
            if (!imagemUrl) throw new Error("Informe a 'imagemUrl' a remover.");
            images = images.filter((img) => img !== imagemUrl.trim());
          }

          await supabaseAdmin.from("accessories").update({ images }).eq("id", produtoId);
          return {
            success: true,
            mensagem: `Galeria do acessório "${acc.title}" atualizada com sucesso!`,
            totalImagens: images.length,
            imagemPrincipal: images[0] || null,
            galeria: images,
          };
        }

        case "lote_leilao": {
          const { data: item, error: findErr } = await supabaseAdmin
            .from("auction_items")
            .select("id, name, image_url")
            .eq("id", produtoId)
            .maybeSingle();

          if (findErr || !item) throw new Error(`Lote de leilão "${produtoId}" não encontrado.`);

          if (acao === "definir_principal" || acao === "adicionar_galeria") {
            if (!imagemUrl) throw new Error("Informe a 'imagemUrl'.");
            await supabaseAdmin.from("auction_items").update({ image_url: imagemUrl.trim() }).eq("id", produtoId);
            return { success: true, mensagem: `Foto do lote "${item.name}" atualizada!`, novaImagem: imagemUrl.trim() };
          }

          if (acao === "remover_imagem") {
            await supabaseAdmin.from("auction_items").update({ image_url: null }).eq("id", produtoId);
            return { success: true, mensagem: `Foto do lote "${item.name}" removida.` };
          }
          break;
        }
      }

      throw new Error(`Operação inválida para o tipo de produto "${tipoProduto}".`);
    },
  },
];
