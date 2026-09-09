import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth, BOT_PROCESS_NAME } from "@/lib/bot-auth.server";

const ACTIONS = ["sending", "done", "error"];

export const Route = createFileRoute("/api/public/bot/commands/$id/mark")({
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
        const id = params.id;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any)
          .from("bot_command_queue")
          .update({ status: action, updated_at: new Date().toISOString() })
          .eq("id", id)
          .or(`target_bot.eq.${BOT_PROCESS_NAME},target_bot.is.null`)
          .select()
          .maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!data) return Response.json({ error: "Comando não encontrado" }, { status: 404 });
        return Response.json({ success: true, command: data });
      },
    },
  },
});
