import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth } from "@/lib/bot-auth.server";
import { ensureWhatsAppUser } from "@/lib/bot-users.server";

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

        const user = await ensureWhatsAppUser(phone, name, { resetPassword: true });
        if ("error" in user) return Response.json({ error: user.error }, { status: 500 });

        return Response.json({
          userId: user.userId,
          created: user.created,
          login: user.email,
          phone,
          password: user.password,
          resetUrl: "/reset-password",
        });
      },
    },
  },
});
