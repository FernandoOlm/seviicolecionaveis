import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth } from "@/lib/bot-auth.server";

const ACTIONS = ["pending", "sending", "done", "error"];

export const Route = createFileRoute("/api/public/bot/schedules/$id/mark")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const denied = verifyBotAuth(request);
        if (denied) return denied;

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          /* body opcional */
        }
        const action = String(body?.action ?? "done");
        if (!ACTIONS.includes(action)) {
          return Response.json({ error: "action inválida" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const patch: Record<string, unknown> = {
          status: action,
          error_message: action === "error" ? String(body?.error ?? body?.error_message ?? "") || null : null,
        };
        const { data, error } = await (supabaseAdmin as any)
          .from("auction_schedules")
          .update(patch)
          .eq("id", params.id)
          .select("id, auction_id, action, status")
          .maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!data) return Response.json({ error: "Agendamento não encontrado" }, { status: 404 });

        // Reflete o ciclo de vida do leilão
        if (action === "done") {
          if (data.action === "START") {
            await (supabaseAdmin as any).from("auctions").update({ status: "live" }).eq("id", data.auction_id);
          } else if (data.action === "CLOSE") {
            await (supabaseAdmin as any)
              .from("auctions")
              .update({ status: "finished", closed_at: new Date().toISOString() })
              .eq("id", data.auction_id);
          }
        }

        return Response.json({ success: true, schedule: data });
      },
    },
  },
});
