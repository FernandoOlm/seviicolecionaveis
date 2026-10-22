import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendTransactionalEmailSafe } from "@/lib/email/send.server";
import { eventTimeRangeLabel, formatYmd, type PickupEvent } from "./events";

/** Avisa por e-mail os clientes com pedidos vinculados a um evento alterado/desativado/cancelado. */
export const notifyEventOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ eventId: z.string().uuid(), kind: z.enum(["changed", "deactivated", "cancelled"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data: ev } = await context.supabase.from("events").select("*").eq("id", data.eventId).maybeSingle();
    if (!ev) return { sent: 0 };
    const event: PickupEvent = {
      id: ev.id,
      name: ev.name,
      description: ev.description ?? null,
      start_date: ev.start_date,
      end_date: ev.end_date,
      start_time: String(ev.start_time).slice(0, 5),
      end_time: String(ev.end_time).slice(0, 5),
      per_day_times: (ev.per_day_times as PickupEvent["per_day_times"]) ?? null,
      active: ev.active,
    };
    const { data: orders } = await context.supabase
      .from("orders")
      .select("id, email, recipient_name")
      .eq("event_id", data.eventId)
      .not("status", "in", '("delivered","cancelled")');
    const when = `${formatYmd(event.start_date)}${event.end_date !== event.start_date ? ` a ${formatYmd(event.end_date)}` : ""}, ${eventTimeRangeLabel(event)}`;
    let sent = 0;
    for (const o of orders ?? []) {
      if (!o.email) continue;
      const r = await sendTransactionalEmailSafe({
        templateName: "event-changed",
        recipientEmail: o.email,
        idempotencyKey: `event-${data.kind}-${data.eventId}-${o.id}`,
        templateData: {
          recipientName: o.recipient_name ?? undefined,
          orderId: o.id,
          eventName: event.name,
          eventWhen: when,
          kind: data.kind,
        },
      }).catch((e: unknown) => {
        console.error("[event-notify] email", e);
        return null;
      });
      if (r && (r as any).sent !== false) sent++;
    }
    return { sent };
  });
