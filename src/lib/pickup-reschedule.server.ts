import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTransactionalEmailSafe } from "@/lib/email/send.server";
import { formatSchedule, shouldReopenPickup, validateSchedule } from "@/lib/scheduling";
import { sendScheduleConfirmations } from "@/lib/schedule-confirmation.server";

type HistoryEntry = { scheduled_at: string; kind: string; outcome: string; recorded_at: string };

/** Reabre retiradas não concluídas até 14h do dia seguinte. Não mexe em pilhas (prazo de 30 dias intacto). */
export async function reopenExpiredPickups(now = new Date()) {
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("orders")
    .select("id, email, recipient_name, status, scheduled_at, schedule_kind, reschedule_required, schedule_history")
    .eq("schedule_kind", "pickup")
    .eq("reschedule_required", false)
    .not("scheduled_at", "is", null)
    .lt("scheduled_at", now.toISOString())
    .limit(200);
  if (error) throw error;
  let reopened = 0;
  for (const o of data ?? []) {
    if (!shouldReopenPickup(o, now)) continue;
    const history: HistoryEntry[] = Array.isArray(o.schedule_history) ? o.schedule_history : [];
    history.push({ scheduled_at: o.scheduled_at, kind: "pickup", outcome: "Não compareceu / não concluído", recorded_at: now.toISOString() });
    const { data: upd } = await db
      .from("orders")
      .update({ reschedule_required: true, schedule_reopened_at: now.toISOString(), schedule_history: history })
      .eq("id", o.id)
      .eq("reschedule_required", false)
      .select("id");
    if (!upd?.length) continue;
    reopened++;
    if (o.email) {
      await sendTransactionalEmailSafe({
        templateName: "pickup-reopened",
        recipientEmail: o.email,
        idempotencyKey: `pickup-reopened-${o.id}-${o.scheduled_at}`,
        templateData: { recipientName: o.recipient_name ?? undefined, orderId: o.id, previous: formatSchedule("pickup", o.scheduled_at) },
      }).catch((e: unknown) => console.error("[pickup-reopen] email", e));
    }
  }
  return { reopened };
}

/** Cliente escolhe novo horário de retirada (Regra 1 revalidada no servidor). */
export async function reschedulePickup(userId: string, orderId: string, at: string) {
  const db = supabaseAdmin as any;
  const { data: o } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!o || o.user_id !== userId) throw new Error("Pedido não encontrado.");
  if (o.schedule_kind !== "pickup" || !o.reschedule_required) throw new Error("Este pedido não precisa de reagendamento.");
  const err = validateSchedule("pickup", at);
  if (err) throw new Error(err);
  const notes = typeof o.notes === "string"
    ? o.notes.replace(/(Retirada em mãos: .*) — [^\n]*?\./, `$1 — ${formatSchedule("pickup", at)}.`)
    : o.notes;
  const { data: upd, error } = await db
    .from("orders")
    .update({ scheduled_at: at, reschedule_required: false, notes })
    .eq("id", orderId)
    .eq("reschedule_required", true)
    .select("*")
    .maybeSingle();
  if (error || !upd) throw new Error("Não foi possível reagendar. Tente novamente.");
  await sendScheduleConfirmations(upd, `-${at}`).catch((e) => console.error("[reschedule] email", e));
  return { scheduled_at: at };
}
