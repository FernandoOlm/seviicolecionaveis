import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth } from "@/lib/bot-auth.server";

export const Route = createFileRoute("/api/public/bot/bids/approved")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyBotAuth(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const auctionId = url.searchParams.get("auctionId");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let query = (supabaseAdmin as any)
          .from("auction_bids")
          .select("id, auction_id, item_name, phone, bidder_name, amount, order_id")
          .eq("status", "approved")
          .eq("announced", false)
          .order("created_at", { ascending: true })
          .limit(500);
        if (auctionId) query = query.eq("auction_id", auctionId);

        const { data: bids, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const list = bids ?? [];
        if (list.length === 0) return Response.json({ buyers: [] });

        const auctionIds = [...new Set(list.map((b: any) => b.auction_id))];
        const { data: auctions } = await (supabaseAdmin as any)
          .from("auctions")
          .select("id, auction_number, group_jid, closing_message")
          .in("id", auctionIds);
        const auctionById = new Map((auctions ?? []).map((a: any) => [a.id, a]));

        const { data: setting } = await (supabaseAdmin as any)
          .from("app_settings")
          .select("value")
          .eq("key", "auction_payment_link")
          .maybeSingle();
        const paymentLinkBase =
          typeof setting?.value === "string"
            ? setting.value
            : (setting?.value?.url as string | undefined) ?? null;

        const buyers = new Map<string, any>();
        for (const b of list) {
          const key = `${b.auction_id}:${b.phone}`;
          const auction: any = auctionById.get(b.auction_id);
          if (!buyers.has(key)) {
            buyers.set(key, {
              auction_id: b.auction_id,
              auction_number: auction?.auction_number ?? null,
              phone: b.phone,
              bidder_name: b.bidder_name,
              group_jid: auction?.group_jid ?? null,
              closing_message: auction?.closing_message ?? null,
              order_number: null as string | null,
              payment_link: paymentLinkBase,
              total: 0,
              items: [] as any[],
            });
          }
          const buyer = buyers.get(key);
          buyer.items.push({ bid_id: b.id, item_name: b.item_name, amount: Number(b.amount) });
          buyer.total += Number(b.amount);
          if (b.order_id) buyer.order_number = String(b.order_id).slice(0, 8).toUpperCase();
        }

        return Response.json({ buyers: [...buyers.values()] });
      },
    },
  },
});
