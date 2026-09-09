import { createFileRoute } from "@tanstack/react-router";
import { handleBotGroupsUpsert } from "@/lib/bot-groups-upsert.server";
import { verifyBotAuth, BOT_PROCESS_NAME } from "@/lib/bot-auth.server";

export const Route = createFileRoute("/api/public/bot/groups/")({
  server: {
    handlers: {
      POST: async ({ request }) => handleBotGroupsUpsert(request),
      GET: async ({ request }) => {
        const denied = verifyBotAuth(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any)
          .from("bot_groups")
          .select("group_jid, group_name, group_type, status")
          .order("updated_at", { ascending: false });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ process_name: BOT_PROCESS_NAME, groups: data ?? [] });
      },
    },
  },
});
