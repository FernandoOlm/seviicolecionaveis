import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth } from "@/lib/bot-auth.server";

export const Route = createFileRoute("/api/public/bot/schedules/pending")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyBotAuth(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        const windowParam = Number(url.searchParams.get("windowMinutes"));
        const windowMinutes =
          Number.isFinite(windowParam) && windowParam > 0 ? Math.min(60, windowParam) : 0;
        const cutoffIso = new Date(Date.now() + windowMinutes * 60 * 1000).toISOString();

        const { data: schedules, error } = await (supabaseAdmin as any)
          .from("auction_schedules")
          .select("id, auction_id, action, group_jid, scheduled_time, status")
          .in("status", ["pending", "scheduled"])
          .lte("scheduled_time", cutoffIso)
          .order("scheduled_time", { ascending: true })
          .limit(20);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const list = schedules ?? [];
        if (list.length === 0) return Response.json({ schedules: [] });

        const auctionIds = [...new Set(list.map((s: any) => s.auction_id))];
        const [{ data: auctions }, { data: items }] = await Promise.all([
          (supabaseAdmin as any)
            .from("auctions")
            .select(
              "id, auction_number, title, description, closing_message, group_jid, status, scheduled_start, scheduled_end, item_delay_seconds, block_delay_seconds, block_actions",
            )
            .in("id", auctionIds),
          (supabaseAdmin as any)
            .from("auction_items")
            .select(
              "id, auction_id, sequence, block_number, name, description, image_url, starting_price, bid_increment, buyout_price, quantity, extra_prices",
            )
            .in("auction_id", auctionIds)
            .order("sequence", { ascending: true }),
        ]);

        const byAuction = new Map<string, any>();
        for (const a of auctions ?? []) {
          const auctionItems = (items ?? [])
            .filter((i: any) => i.auction_id === a.id)
            .map((i: any) => {
              const extra = typeof i.extra_prices === "object" && i.extra_prices !== null
                ? (Array.isArray(i.extra_prices) ? (i.extra_prices.find((x: any) => x?._meta) || {}) : i.extra_prices)
                : {};
              return {
                ...i,
                condition: extra.condition || null,
                language: extra.language || null,
                finish: extra.finish || null,
                liga_price: extra.liga_price || null,
              };
            })
            .sort((x: any, y: any) => {
              const b1 = Number(x.block_number || 1);
              const b2 = Number(y.block_number || 1);
              if (b1 !== b2) return b1 - b2;
              return Number(x.sequence || 0) - Number(y.sequence || 0);
            });

          byAuction.set(a.id, {
            ...a,
            items: auctionItems,
            block_actions: Array.isArray(a.block_actions) ? a.block_actions : [],
            item_delay_seconds: Number(a.item_delay_seconds) || 3,
            block_delay_seconds: Number(a.block_delay_seconds) || 30,
          });
        }

        return Response.json({
          schedules: list.map((s: any) => ({
            id: s.id,
            auction_id: s.auction_id,
            action: s.action,
            group_jid: s.group_jid,
            scheduled_time: s.scheduled_time,
            due_at: s.scheduled_time,
            send_at: s.scheduled_time,
            status: s.status || "pending",
            auction: byAuction.get(s.auction_id) ?? null,
          })),
        });
      },
    },
  },
});
