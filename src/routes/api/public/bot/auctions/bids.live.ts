import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth } from "@/lib/bot-auth.server";

type IncomingLiveBid = {
  pollMsgId?: string;
  auctionId?: string;
  auction_id?: string;
  itemId?: string;
  item_id?: string;
  itemName?: string;
  item_name?: string;
  groupJid?: string;
  voterJid?: string;
  voterPhone?: string;
  phone?: string;
  optionText?: string;
  bidValue?: number | string;
  amount?: number | string;
  isRetraction?: boolean;
  timestamp?: string;
};

export const Route = createFileRoute("/api/public/bot/auctions/bids/live")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = verifyBotAuth(request);
        if (denied) return denied;

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }

        const bidsRaw: IncomingLiveBid[] = Array.isArray(body?.bids)
          ? body.bids
          : body && (body.auctionId || body.auction_id)
            ? [body]
            : [];

        if (bidsRaw.length === 0) {
          return Response.json({ success: true, processed: 0, message: "Nenhum lance no payload" });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let processed = 0;

        for (const b of bidsRaw) {
          const auctionId = String(b.auctionId || b.auction_id || "").trim();
          const phone = String(b.voterPhone || b.phone || "").replace(/\D/g, "");
          const itemId = b.itemId || b.item_id || null;
          const itemName = String(b.itemName || b.item_name || "Lote").trim();
          const bidValue = Number(b.bidValue ?? b.amount ?? 0);
          const isRetraction = !!b.isRetraction;

          if (!auctionId || !phone) continue;

          if (isRetraction) {
            // Marca lances prévios desse usuário no lote/leilão como cancelados/retirados
            let selectQ = (supabaseAdmin as any)
              .from("auction_bids")
              .select("id, item_id")
              .eq("auction_id", auctionId)
              .eq("phone", phone)
              .neq("status", "retracted");

            if (itemId) {
              selectQ = selectQ.eq("item_id", itemId);
            }
            const { data: toRetract } = await selectQ;
            if (toRetract && toRetract.length > 0) {
              await (supabaseAdmin as any)
                .from("auction_bids")
                .update({ status: "retracted" })
                .in("id", toRetract.map((r: any) => r.id));
            }

            // Recalcula o vencedor dos lotes afetados a partir dos lances restantes
            const affectedItemIds = new Set<string>();
            if (itemId) {
              affectedItemIds.add(String(itemId));
            } else {
              const { data: wonItems } = await (supabaseAdmin as any)
                .from("auction_items")
                .select("id")
                .eq("auction_id", auctionId)
                .eq("winner_phone", phone);
              for (const it of wonItems ?? []) affectedItemIds.add(String(it.id));
            }
            for (const r of toRetract ?? []) {
              if (r.item_id) affectedItemIds.add(String(r.item_id));
            }

            for (const iid of affectedItemIds) {
              const { data: top } = await (supabaseAdmin as any)
                .from("auction_bids")
                .select("phone, bidder_name, amount")
                .eq("auction_id", auctionId)
                .eq("item_id", iid)
                .neq("status", "retracted")
                .order("amount", { ascending: false })
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();

              if (top) {
                await (supabaseAdmin as any)
                  .from("auction_items")
                  .update({
                    final_bid: Number(top.amount),
                    winner_phone: top.phone,
                    winner_name: top.bidder_name || top.phone,
                  })
                  .eq("id", iid);
              } else {
                await (supabaseAdmin as any)
                  .from("auction_items")
                  .update({ final_bid: null, winner_phone: null, winner_name: null })
                  .eq("id", iid);
              }
            }

            processed++;
            continue;
          }

          if (bidValue <= 0 || !Number.isFinite(bidValue)) continue;

          // Se tiver itemId, busca a sequence e nome real do item caso não venha no payload
          let sequence = 1;
          let realItemName = itemName;
          if (itemId) {
            const { data: item } = await (supabaseAdmin as any)
              .from("auction_items")
              .select("sequence, name, final_bid")
              .eq("id", itemId)
              .maybeSingle();

            if (item) {
              sequence = item.sequence || 1;
              if (item.name) realItemName = item.name;

              // Atualiza o final_bid no item se o lance for maior
              const currentFinal = Number(item.final_bid ?? 0);
              if (bidValue > currentFinal) {
                await (supabaseAdmin as any)
                  .from("auction_items")
                  .update({
                    final_bid: bidValue,
                    winner_phone: phone,
                    winner_name: phone,
                  })
                  .eq("id", itemId);
              }
            }
          }

          // Registra o lance em auction_bids
          const { error: insErr } = await (supabaseAdmin as any).from("auction_bids").insert({
            auction_id: auctionId,
            item_id: itemId,
            sequence,
            item_name: realItemName,
            phone,
            bidder_name: phone,
            amount: bidValue,
            status: "pending",
            announced: false,
            created_at: b.timestamp
              ? new Date(b.timestamp).toISOString()
              : new Date().toISOString(),
          });

          if (!insErr) {
            processed++;
          }
        }

        return Response.json({
          success: true,
          processed,
          message: `${processed} lance(s) ao vivo processado(s) com sucesso`,
        });
      },
    },
  },
});
