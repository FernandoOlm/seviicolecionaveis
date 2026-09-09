import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth, assertProcess, BOT_PROCESS_NAME } from "@/lib/bot-auth.server";

const VALID_STATUS = ["STARTING", "AWAITING_SCAN", "CONNECTED", "DISCONNECTED"];

export const Route = createFileRoute("/api/public/bot/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyBotAuth(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any)
          .from("bot_instances")
          .select("*")
          .eq("process_name", BOT_PROCESS_NAME)
          .maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ process_name: BOT_PROCESS_NAME, instance: data ?? null });
      },

      POST: async ({ request }) => {
        const denied = verifyBotAuth(request);
        if (denied) return denied;
        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }
        const bad = assertProcess(body?.process_name);
        if (bad) return bad;
        const status = String(body?.status ?? "STARTING").toUpperCase();
        if (!VALID_STATUS.includes(status)) {
          return Response.json({ error: "status inválido" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const payload: Record<string, unknown> = {
          process_name: BOT_PROCESS_NAME,
          status,
          updated_at: new Date().toISOString(),
        };
        if ("qr_code_base64" in (body ?? {})) payload["qr_code_base64"] = body.qr_code_base64 ?? null;
        if ("bot_number" in (body ?? {})) payload["bot_number"] = body.bot_number ?? null;
        // Ao conectar, limpa QR e comando pendente
        if (status === "CONNECTED") {
          payload["qr_code_base64"] = null;
          payload["command"] = null;
        }
        if (body?.clear_command === true) payload["command"] = null;

        const { data, error } = await (supabaseAdmin as any)
          .from("bot_instances")
          .upsert(payload, { onConflict: "process_name" })
          .select()
          .maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true, instance: data });
      },

      DELETE: async ({ request }) => {
        const denied = verifyBotAuth(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const bad = assertProcess(url.searchParams.get("process_name"));
        if (bad) return bad;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await (supabaseAdmin as any)
          .from("bot_instances")
          .delete()
          .eq("process_name", BOT_PROCESS_NAME);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      },
    },
  },
});
