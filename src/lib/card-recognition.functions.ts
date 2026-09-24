import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  images: z.array(z.string().min(20).max(8_000_000)).min(1).max(6),
});

export interface DetectedCard {
  key: string;
  name: string;
  number: string;
  collection: string;
  language: string;
  finish: string;
  quantity: number;
  confidence: number;
  notes: string;
  imageIndex: number;
  candidates: CardCandidate[];
}

export interface CardCandidate {
  id: string;
  name: string;
  card_number: string;
  collection: string;
  language: string;
  finish: string;
  condition: string;
  stock: number;
  image: string | null;
  score: number;
}

const norm = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const onlyNumber = (s: string) => (s || "").split("/")[0]?.replace(/\D/g, "").replace(/^0+/, "") ?? "";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "number", "collection", "language", "finish", "quantity", "confidence", "notes"],
        properties: {
          name: { type: "string" },
          number: { type: "string" },
          collection: { type: "string" },
          language: { type: "string" },
          finish: { type: "string" },
          quantity: { type: "integer" },
          confidence: { type: "number" },
          notes: { type: "string" },
        },
      },
    },
  },
} as const;

const PROMPT = `Você é um especialista em cartas Pokémon TCG. Analise a foto e liste TODAS as cartas visíveis.
Para cada carta distinta informe:
- name: nome impresso da carta exatamente como aparece (ex: "Charizard ex")
- number: número impresso no canto inferior, no formato "025/191" (se não der para ler, "")
- collection: sigla ou nome da coleção, se visível (ex: "SVI", "Obsidiana em Chamas"); senão ""
- language: Português, Inglês, Japonês, Espanhol, Italiano ou Chinês
- finish: Normal, Foil, Reverse Foil, Promo, Illustration Rare, Double Rare, Ultra Rara ou o acabamento que melhor descreve
- quantity: quantas cópias idênticas dessa carta aparecem na foto
- confidence: 0 a 1 indicando sua certeza na leitura
- notes: observações curtas (ex: "número ilegível", "carta parcialmente coberta")
Responda apenas com o JSON pedido. Não invente cartas que não estão na foto.`;

export const recognizeCardsFromPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Serviço de reconhecimento indisponível (chave ausente).");

    // 1) Reconhecimento por imagem
    const detections: Omit<DetectedCard, "candidates" | "key">[] = [];
    for (let i = 0; i < data.images.length; i++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "google/gemini-3.8-flash",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: PROMPT },
                { type: "image_url", image_url: { url: data.images[i] } },
              ],
            },
          ],
          response_format: { type: "json_schema", json_schema: { name: "cards", strict: true, schema: SCHEMA } },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        if (res.status === 429) throw new Error("Muitas análises seguidas. Aguarde alguns segundos e tente de novo.");
        if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos para continuar usando o reconhecimento.");
        throw new Error(`Falha ao analisar a foto (${res.status}). ${body.slice(0, 200)}`);
      }

      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content ?? "{}";
      let parsed: { cards?: any[] } = {};
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = {};
      }
      for (const c of parsed.cards ?? []) {
        detections.push({
          name: String(c.name ?? "").trim(),
          number: String(c.number ?? "").trim(),
          collection: String(c.collection ?? "").trim(),
          language: String(c.language ?? "Português").trim(),
          finish: String(c.finish ?? "Normal").trim(),
          quantity: Math.max(1, Number(c.quantity) || 1),
          confidence: Math.min(1, Math.max(0, Number(c.confidence) || 0)),
          notes: String(c.notes ?? "").trim(),
          imageIndex: i,
        });
      }
    }

    if (!detections.length) return { detections: [] as DetectedCard[] };

    // 2) Catálogo atual para casar as leituras
    const rows: any[] = [];
    const CHUNK = 1000;
    for (let from = 0; from < 20000; from += CHUNK) {
      const { data: page, error } = await context.supabase
        .from("cards")
        .select("id, name, card_number, collection, language, finish, condition, stock, image")
        .range(from, from + CHUNK - 1);
      if (error) throw new Error(error.message);
      rows.push(...(page ?? []));
      if (!page || page.length < CHUNK) break;
    }

    const scored: DetectedCard[] = detections.map((d, idx) => {
      const dName = norm(d.name);
      const dNum = onlyNumber(d.number);
      const dCol = norm(d.collection);
      const dLang = norm(d.language);
      const dFinish = norm(d.finish);

      const candidates = rows
        .map((r) => {
          const rName = norm(r.name);
          const rNum = onlyNumber(r.card_number);
          const rCol = norm(r.collection);
          let score = 0;
          if (dName && rName === dName) score += 50;
          else if (dName && (rName.includes(dName) || dName.includes(rName))) score += 30;
          if (dNum && rNum && dNum === rNum) score += 30;
          if (dCol && (rCol.includes(dCol) || dCol.includes(rCol))) score += 15;
          if (dLang && norm(r.language) === dLang) score += 5;
          if (dFinish && norm(r.finish) === dFinish) score += 8;
          return { ...r, score };
        })
        .filter((r) => r.score >= 30)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8) as CardCandidate[];

      return { ...d, key: `${idx}-${dName || "carta"}`, candidates };
    });

    return { detections: scored };
  });
