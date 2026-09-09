import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth } from "@/lib/bot-auth.server";

export const Route = createFileRoute("/api/public/bot/bids/mark")({
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
        const phones: string[] = Array.isArray(body?.phones)
          ? body.phones.map((p: unknown) => String(p).replace(/\D/g, "")).filter(Boolean)
          : [];
        const bidIds: string[] = Array.isArray(body?.bidIds) ? body.bidIds.map(String) : [];
        if (!auctionId && bidIds.length === 0) {
          return Response.json({ error: "auctionId ou bidIds obrigatório" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let query = (supabaseAdmin as any).from("auction_bids").update({ announced: true });
        if (bidIds.length > 0) query = query.in("id", bidIds);
        else {
          query = query.eq("auction_id", auctionId);
          if (phones.length > 0) query = query.in("phone", phones);
        }
        const { data, error } = await query.select("id");
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, updated: (data ?? []).length });
      },
    },
  },
});
