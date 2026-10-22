import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { scheduleConfirmationData, type ScheduledOrder } from "./schedule-confirmation";
import { modalityOfOrder, type FulfillmentAction } from "./fulfillment-alerts";

/**
 * Confirmações de agendamento de pedidos (checkout pago, pedido manual, reagendamento, admin).
 * Delegam ao ponto central de alertas de modalidade (alerta no admin + e-mails cliente/loja).
 */
export async function sendScheduleConfirmations(
  order: ScheduledOrder,
  _keySuffix = "",
  opts?: { skipClient?: boolean; action?: FulfillmentAction; source?: "customer" | "admin" | "auto"; before?: string | null; relatedOrders?: string[] },
) {
  const data = scheduleConfirmationData(order);
  if (!data) return;
  const o: any = order;
  const db = supabaseAdmin as any;
  const [{ data: items }, ev] = await Promise.all([
    db.from("order_items").select("card_name, quantity").eq("order_id", order.id),
    o.event_id ? db.from("events").select("name").eq("id", o.event_id).maybeSingle().then((r: any) => r.data) : Promise.resolve(null),
  ]);
  const { notifyFulfillmentChange } = await import("./fulfillment-alerts.server");
  await notifyFulfillmentChange({
    targetType: "order", targetId: order.id, code: `#${order.id.slice(0, 8).toUpperCase()}`,
    action: opts?.action ?? "defined", source: opts?.source ?? "customer",
    modality: modalityOfOrder({ shipping_method: o.shipping_method ?? "arrange", schedule_kind: order.schedule_kind }),
    customerName: order.recipient_name, customerEmail: order.email, customerPhone: o.phone ?? null,
    scheduledAt: order.scheduled_at, when: data.when, eventId: o.event_id ?? null, eventName: ev?.name ?? null,
    location: data.address || null,
    fee: data.delivery ? `R$ 15,00 ${data.deliveryFeePending ? "(a pagar via Pix)" : "(paga)"}` : null,
    before: opts?.before ?? null,
    items: (items ?? []).map((i: any) => `${i.quantity}× ${i.card_name}`),
    relatedOrders: opts?.relatedOrders,
    calendarUrl: data.calendarUrl, notifyClient: !opts?.skipClient,
  });
}
