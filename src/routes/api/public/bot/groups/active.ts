import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth, BOT_PROCESS_NAME } from "@/lib/bot-auth.server";

export const Route = createFileRoute("/api/public/bot/groups/active")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyBotAuth(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any)
          .from("bot_groups")
          .select("group_jid, group_name, group_type")
          .eq("status", "active")
          .order("activated_at", { ascending: true });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const rows = (data ?? []) as any[];
        return Response.json({
          now: new Date().toISOString(),
          process_name: BOT_PROCESS_NAME,
          count: rows.length,
          jids: rows.map((r) => r.group_jid),
          groups: rows.map((r) => ({
            jid: r.group_jid,
            name: r.group_name,
            group_type: r.group_type,
          })),
        });
      },
    },
  },
});
