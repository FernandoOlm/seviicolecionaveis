import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth, BOT_PROCESS_NAME } from "@/lib/bot-auth.server";

export const Route = createFileRoute("/api/public/bot/commands/pending")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyBotAuth(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const proc = url.searchParams.get("process_name") ?? BOT_PROCESS_NAME;
        if (proc !== BOT_PROCESS_NAME) {
          return Response.json({ error: "process_name inválido" }, { status: 400 });
        }
        const limitRaw = Number(url.searchParams.get("limit") ?? 20);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any)
          .from("bot_command_queue")
          .select("id, command, target_group, target_bot, args, created_at")
          .eq("status", "pending")
          .or(`target_bot.eq.${BOT_PROCESS_NAME},target_bot.is.null`)
          .order("created_at", { ascending: true })
          .limit(limit);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ commands: data ?? [] });
      },
    },
  },
});
