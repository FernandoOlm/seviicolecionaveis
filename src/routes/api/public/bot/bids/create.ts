import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth } from "@/lib/bot-auth.server";

type IncomingBid = {
  phone?: string;
  bidder_name?: string;
  item_name?: string;
  item_id?: string;
  amount?: number | string;
  sequence?: number | string;
};

export const Route = createFileRoute("/api/public/bot/bids/create")({
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

        const auctionId = String(body?.auctionId ?? body?.auction_id ?? "");
        const bidsRaw: IncomingBid[] = Array.isArray(body?.bids) ? body.bids : [];
        if (!auctionId) return Response.json({ error: "auctionId obrigatório" }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: auction } = await (supabaseAdmin as any)
          .from("auctions")
          .select("id")
          .eq("id", auctionId)
          .maybeSingle();
        if (!auction) return Response.json({ error: "Leilão não encontrado" }, { status: 404 });

        const { data: items } = await (supabaseAdmin as any)
          .from("auction_items")
          .select("id, sequence, name")
          .eq("auction_id", auctionId);

        const rows = bidsRaw
          .map((b) => {
            const phone = String(b.phone ?? "").replace(/\D/g, "");
            const amount = Number(b.amount);
            const sequence = Number(b.sequence ?? 1) || 1;
            const itemName = String(b.item_name ?? "").trim();
            if (!phone || !Number.isFinite(amount) || amount <= 0) return null;
            const match =
              (items ?? []).find((i: any) => (b.item_id ? i.id === b.item_id : false)) ??
              (items ?? []).find((i: any) => i.sequence === sequence) ??
              (items ?? []).find((i: any) => i.name?.toLowerCase() === itemName.toLowerCase());
            return {
              auction_id: auctionId,
              item_id: match?.id ?? null,
              sequence: match?.sequence ?? sequence,
              item_name: itemName || match?.name || `Lote ${sequence}`,
              phone,
              bidder_name: b.bidder_name ? String(b.bidder_name) : null,
              amount,
              status: "pending",
            };
          })
          .filter(Boolean) as any[];

        if (rows.length > 0) {
          const { error } = await (supabaseAdmin as any).from("auction_bids").insert(rows);
          if (error) return Response.json({ error: error.message }, { status: 500 });

          // Marca vencedores nos lotes (maior lance por lote)
          const best = new Map<string, any>();
          for (const r of rows) {
            if (!r.item_id) continue;
            const cur = best.get(r.item_id);
            if (!cur || r.amount > cur.amount) best.set(r.item_id, r);
          }
          for (const [itemId, r] of best) {
            await (supabaseAdmin as any)
              .from("auction_items")
              .update({
                winner_phone: r.phone,
                winner_name: r.bidder_name,
                final_bid: r.amount,
                status: "sold",
              })
              .eq("id", itemId);
          }
        }

        await (supabaseAdmin as any)
          .from("auctions")
          .update({ status: "finished", closed_at: new Date().toISOString() })
          .eq("id", auctionId);

        return Response.json({ success: true, inserted: rows.length });
      },
    },
  },
});
