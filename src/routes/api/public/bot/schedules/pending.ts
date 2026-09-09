import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth } from "@/lib/bot-auth.server";

export const Route = createFileRoute("/api/public/bot/schedules/pending")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyBotAuth(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nowIso = new Date().toISOString();

        const { data: schedules, error } = await (supabaseAdmin as any)
          .from("auction_schedules")
          .select("id, auction_id, action, group_jid, scheduled_time")
          .eq("status", "pending")
          .lte("scheduled_time", nowIso)
          .order("scheduled_time", { ascending: true })
          .limit(20);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const list = schedules ?? [];
        if (list.length === 0) return Response.json({ schedules: [] });

        const auctionIds = [...new Set(list.map((s: any) => s.auction_id))];
        const [{ data: auctions }, { data: items }] = await Promise.all([
          (supabaseAdmin as any)
            .from("auctions")
            .select("id, auction_number, title, description, closing_message, group_jid, status, scheduled_start, scheduled_end")
            .in("id", auctionIds),
          (supabaseAdmin as any)
            .from("auction_items")
            .select("id, auction_id, sequence, name, description, image_url, starting_price, bid_increment, buyout_price, quantity")
            .in("auction_id", auctionIds)
            .order("sequence", { ascending: true }),
        ]);

        const byAuction = new Map<string, any>();
        for (const a of auctions ?? []) {
          byAuction.set(a.id, {
            ...a,
            items: (items ?? []).filter((i: any) => i.auction_id === a.id),
          });
        }

        return Response.json({
          schedules: list.map((s: any) => ({
            id: s.id,
            auction_id: s.auction_id,
            action: s.action,
            group_jid: s.group_jid,
            scheduled_time: s.scheduled_time,
            auction: byAuction.get(s.auction_id) ?? null,
          })),
        });
      },
    },
  },
});
