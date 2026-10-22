import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth } from "@/lib/bot-auth.server";

export const Route = createFileRoute("/api/public/bot/auctions/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const denied = verifyBotAuth(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: auction, error } = await (supabaseAdmin as any)
          .from("auctions")
          .select("*")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!auction) return Response.json({ error: "Leilão não encontrado" }, { status: 404 });

        const [{ data: items }, { data: bids }] = await Promise.all([
          (supabaseAdmin as any)
            .from("auction_items")
            .select("*")
            .eq("auction_id", params.id)
            .order("sequence", { ascending: true }),
          (supabaseAdmin as any)
            .from("auction_bids")
            .select("*")
            .eq("auction_id", params.id)
            .order("created_at", { ascending: true }),
        ]);

        const sortedItems = (items ?? []).sort((x: any, y: any) => {
          const b1 = Number(x.block_number || 1);
          const b2 = Number(y.block_number || 1);
          if (b1 !== b2) return b1 - b2;
          return Number(x.sequence || 0) - Number(y.sequence || 0);
        });

        const blockActions = Array.isArray(auction.block_actions) ? auction.block_actions : [];

        return Response.json({
          auction: {
            ...auction,
            items: sortedItems,
            bids: bids ?? [],
            block_actions: blockActions,
            item_delay_seconds: Number(auction.item_delay_seconds) || 3,
            block_delay_seconds: Number(auction.block_delay_seconds) || 30,
          },
          items: sortedItems,
          block_actions: blockActions,
        });
      },
    },
  },
});
