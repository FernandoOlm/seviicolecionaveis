import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth } from "@/lib/bot-auth.server";

export const Route = createFileRoute("/api/public/bot/groups/activate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = verifyBotAuth(request);
        if (denied) return denied;
        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }
        const code = String(body?.code ?? "").trim();
        const groupJid = String(body?.group_jid ?? "").trim();
        const groupName = body?.group_name ? String(body.group_name).slice(0, 200) : null;
        if (!/^\d{10}$/.test(code)) {
          return Response.json({ error: "Código inválido ou expirado" }, { status: 400 });
        }
        if (!groupJid.endsWith("@g.us")) {
          return Response.json({ error: "group_jid inválido" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await (supabaseAdmin as any)
          .from("activation_codes")
          .select("*")
          .eq("code", code)
          .maybeSingle();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!row || row.is_used) {
          return Response.json({ error: "Código inválido ou expirado" }, { status: 404 });
        }
        if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
          return Response.json({ error: "Código inválido ou expirado" }, { status: 400 });
        }

        const now = new Date().toISOString();
        const { error: upErr } = await (supabaseAdmin as any)
          .from("bot_groups")
          .upsert(
            {
              group_jid: groupJid,
              group_name: groupName ?? row.group_name ?? null,
              group_type: row.group_type ?? "principal",
              status: "active",
              activated_at: now,
              updated_at: now,
            },
            { onConflict: "group_jid" },
          );
        if (upErr) return Response.json({ error: upErr.message }, { status: 500 });

        await (supabaseAdmin as any)
          .from("activation_codes")
          .update({ is_used: true, used_by_jid: groupJid })
          .eq("id", row.id);

        return Response.json({ success: true, message: "Grupo ativado com sucesso!" });
      },
    },
  },
});
