import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth } from "@/lib/bot-auth.server";

const EMAIL_DOMAIN = "whatsapp.seviicolecionaveis.com.br";

function randomPassword() {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return `${out}@1`;
}

export const Route = createFileRoute("/api/public/bot/users/senha")({
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
        const phone = String(body?.phone ?? "").replace(/\D/g, "");
        const name = body?.name ? String(body.name).slice(0, 120) : null;
        if (phone.length < 10 || phone.length > 15) {
          return Response.json({ error: "phone inválido" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const password = randomPassword();
        const email = `${phone}@${EMAIL_DOMAIN}`;

        // Já existe cliente com esse telefone?
        const { data: prof } = await (supabaseAdmin as any)
          .from("profiles")
          .select("user_id")
          .or(`phone.eq.${phone},whatsapp.eq.${phone}`)
          .maybeSingle();

        let userId: string | null = prof?.user_id ?? null;
        let created = false;

        if (!userId) {
          const { data: createdUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: name ?? phone, phone, source: "bot_seviicolecionaveis" },
          });
          if (createErr) {
            // Pode já existir com esse e-mail: tenta localizar
            const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
            const found = list?.users?.find((u) => u.email === email);
            if (!found) return Response.json({ error: createErr.message }, { status: 500 });
            userId = found.id;
          } else {
            userId = createdUser.user?.id ?? null;
            created = true;
          }
        }

        if (!userId) return Response.json({ error: "Falha ao criar usuário" }, { status: 500 });

        if (!created) {
          const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
          if (updErr) return Response.json({ error: updErr.message }, { status: 500 });
        }

        await (supabaseAdmin as any)
          .from("profiles")
          .upsert(
            {
              user_id: userId,
              full_name: name ?? phone,
              phone,
              whatsapp: phone,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );

        return Response.json({
          userId,
          created,
          login: email,
          phone,
          password,
          resetUrl: "/reset-password",
        });
      },
    },
  },
});
