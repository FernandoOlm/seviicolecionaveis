import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyCronAuth } from "@/lib/cron-auth.server";
import { sendTransactionalEmailSafe } from "@/lib/email/send.server";

// Daily cron: sends stack expiration reminders (7d, 48h, 24h) and expires
// stacks whose deadline has passed.
export const Route = createFileRoute("/api/public/hooks/stack-reminders")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

type Stack = {
  id: string;
  user_id: string;
  expires_at: string;
  reminder_7d_sent_at: string | null;
  reminder_48h_sent_at: string | null;
  reminder_24h_sent_at: string | null;
};

async function handler({ request }: { request: Request }) {
  const unauthorized = verifyCronAuth(request);
  if (unauthorized) return unauthorized;

  const now = Date.now();
  const supabase = supabaseAdmin as any;

  // 0) Aviso de fim de prazo (30 dias): e-mail com link para escolher envio/retirada
  let expiryNotices = 0;
  const { data: dueRows } = await supabase
    .from("card_stacks")
    .select("id, user_id")
    .eq("status", "active")
    .is("expiry_notice_sent_at", null)
    .lt("expires_at", new Date(now).toISOString())
    .limit(500);
  for (const s of (dueRows ?? []) as { id: string; user_id: string }[]) {
    try {
      const { count } = await supabase
        .from("card_stack_items")
        .select("id", { count: "exact", head: true })
        .eq("stack_id", s.id)
        .eq("status", "stored");
      if ((count ?? 0) > 0) {
        const { data: userRes } = await supabase.auth.admin.getUserById(s.user_id);
        const email = userRes?.user?.email;
        if (email) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", s.user_id)
            .maybeSingle();
          await sendTransactionalEmailSafe({
            templateName: "stack-expired",
            recipientEmail: email,
            idempotencyKey: `stack-${s.id}-expired`,
            templateData: {
              recipientName: profile?.full_name?.split(" ")[0],
              stackId: s.id,
              itemCount: count ?? 0,
            },
          });
          expiryNotices++;
        }
      }
      await supabase
        .from("card_stacks")
        .update({ expiry_notice_sent_at: new Date().toISOString() })
        .eq("id", s.id);
    } catch (e: any) {
      console.error("[stack-reminders] expiry notice", s.id, e?.message ?? e);
    }
  }

  // 1) Expire pilhas vencidas
  const { data: expiredRows, error: expErr } = await supabase
    .from("card_stacks")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("status", "active")
    .lt("expires_at", new Date(now).toISOString())
    .select("id");
  if (expErr) console.error("[stack-reminders] expire err", expErr);
  const expired = expiredRows?.length ?? 0;

  // 2) Carrega pilhas ativas que ainda têm reminders pendentes
  const { data: stacks, error } = await supabase
    .from("card_stacks")
    .select(
      "id, user_id, expires_at, reminder_7d_sent_at, reminder_48h_sent_at, reminder_24h_sent_at",
    )
    .eq("status", "active")
    .gt("expires_at", new Date(now).toISOString())
    .limit(500);
  if (error) {
    console.error("[stack-reminders] query failed", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  let sent7 = 0;
  let sent48 = 0;
  let sent24 = 0;
  const errors: string[] = [];

  for (const s of (stacks ?? []) as Stack[]) {
    try {
      const msLeft = new Date(s.expires_at).getTime() - now;
      const hoursLeft = Math.floor(msLeft / 3_600_000);
      const daysLeft = Math.floor(hoursLeft / 24);

      let marker: "7d" | "48h" | "24h" | null = null;
      let templateData: Record<string, any> = {};

      if (hoursLeft <= 24 && !s.reminder_24h_sent_at) {
        marker = "24h";
        templateData = { hoursLeft, expiresAt: s.expires_at };
      } else if (hoursLeft <= 48 && !s.reminder_48h_sent_at) {
        marker = "48h";
        templateData = { hoursLeft, expiresAt: s.expires_at };
      } else if (daysLeft <= 7 && !s.reminder_7d_sent_at) {
        marker = "7d";
        templateData = { daysLeft, expiresAt: s.expires_at };
      }
      if (!marker) continue;

      // E-mail e nome
      const { data: userRes } = await supabase.auth.admin.getUserById(s.user_id);
      const email = userRes?.user?.email;
      if (!email) {
        errors.push(`${s.id}: no email`);
        continue;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", s.user_id)
        .maybeSingle();

      const { count } = await supabase
        .from("card_stack_items")
        .select("id", { count: "exact", head: true })
        .eq("stack_id", s.id)
        .eq("status", "stored");

      await sendTransactionalEmailSafe({
        templateName: "stack-reminder",
        recipientEmail: email,
        idempotencyKey: `stack-${s.id}-${marker}`,
        templateData: {
          ...templateData,
          recipientName: profile?.full_name?.split(" ")[0],
          itemCount: count ?? 0,
        },
      });

      const patch: Record<string, string> = { updated_at: new Date().toISOString() };
      if (marker === "7d") {
        patch.reminder_7d_sent_at = new Date().toISOString();
        sent7++;
      } else if (marker === "48h") {
        patch.reminder_48h_sent_at = new Date().toISOString();
        sent48++;
      } else if (marker === "24h") {
        patch.reminder_24h_sent_at = new Date().toISOString();
        sent24++;
      }
      await supabase.from("card_stacks").update(patch).eq("id", s.id);
    } catch (e: any) {
      console.error("[stack-reminders] stack", s.id, e?.message ?? e);
      errors.push(`${s.id}: ${e?.message ?? "unknown"}`);
    }
  }

  return Response.json({
    ok: true,
    expiryNotices,
    expired,
    checked: stacks?.length ?? 0,
    sent7,
    sent48,
    sent24,
    errors,
  });
}
