import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTransactionalEmailSafe } from "@/lib/email/send.server";
import { scheduleConfirmationData, SCHEDULE_EMAIL_SETTING, type ScheduledOrder } from "./schedule-confirmation";

export async function sendScheduleConfirmations(order: ScheduledOrder) {
  const data = scheduleConfirmationData(order);
  if (!data) return;
  if (order.email) await sendTransactionalEmailSafe({
    templateName: "schedule-confirmed", recipientEmail: order.email,
    idempotencyKey: `schedule-confirmed-client-${order.id}`, templateData: { ...data, calendarUrl: undefined },
  });
  const { data: setting, error } = await supabaseAdmin.from("app_settings").select("value").eq("key", SCHEDULE_EMAIL_SETTING).maybeSingle();
  if (error) { console.error("[schedule-confirmation] settings unavailable", error.code); return; }
  const value = setting?.value;
  const email = value && typeof value === "object" && !Array.isArray(value) && typeof value.email === "string" ? value.email.trim() : "";
  if (!email) { console.warn("[schedule-confirmation] store email not configured"); return; }
  await sendTransactionalEmailSafe({
    templateName: "schedule-confirmed", recipientEmail: email,
    idempotencyKey: `schedule-confirmed-store-${order.id}`,
    templateData: { ...data, storeCopy: true },
  });
}