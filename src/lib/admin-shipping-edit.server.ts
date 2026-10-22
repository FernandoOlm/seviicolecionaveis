import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTransactionalEmailSafe } from "@/lib/email/send.server";
import { scheduleConfirmationData, SCHEDULE_EMAIL_SETTING } from "@/lib/schedule-confirmation";
import { formatSchedule } from "@/lib/scheduling";
import { isPaidOrderStatus } from "@/lib/order-status";
import type { PickupEvent } from "@/lib/events";
import {
  ADMIN_SHIPPING_MODE_LABELS, OUT_OF_WINDOW_WARNING, adminShippingWarnings, canAdminEditShipping,
  currentShippingMode, rebuildShippingNotes, validateAdminShippingInput, type AdminShippingInput,
} from "@/lib/admin-shipping-edit";

const FALLBACK_STORE_EMAIL = "seviicolecionaveis@gmail.com";

function toEvent(e: any): PickupEvent {
  return {
    id: e.id, name: e.name, description: e.description ?? null, start_date: e.start_date, end_date: e.end_date,
    start_time: String(e.start_time).slice(0, 5), end_time: String(e.end_time).slice(0, 5),
    per_day_times: e.per_day_times ?? null, active: e.active,
  };
}

function describe(o: any): string {
  const mode = currentShippingMode(o);
  const label = mode ? ADMIN_SHIPPING_MODE_LABELS[mode].replace("Manter na ", "") : o.shipping_method ?? "—";
  return o.scheduled_at ? `${label} — ${formatSchedule(o.schedule_kind, o.scheduled_at)}` : label;
}

async function storeEmail(): Promise<string> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", SCHEDULE_EMAIL_SETTING).maybeSingle();
  const v = data?.value as any;
  return (v && typeof v === "object" && typeof v.email === "string" && v.email.trim()) || FALLBACK_STORE_EMAIL;
}

async function applyToOrder(o: any, input: AdminShippingInput, ev: PickupEvent | null, admin: { id: string; email: string | null }, warnings: string[], now: Date) {
  const db = supabaseAdmin as any;
  const before = describe(o);
  const scheduled = input.mode === "pickup" || input.mode === "event" || input.mode === "delivery";
  const patch: Record<string, unknown> = {
    shipping_method: input.mode === "stack" ? "card_stack" : input.mode === "tracked" ? "fixed" : "arrange",
    schedule_kind: scheduled ? input.mode : null,
    scheduled_at: scheduled ? input.at : null,
    event_id: input.mode === "event" ? input.eventId : null,
    hand_delivery_fee_status: input.mode === "delivery" ? input.feeStatus : null,
    ...(input.mode === "delivery" && input.feeStatus === "confirmed" && o.hand_delivery_fee_status !== "confirmed" ? {
      hand_delivery_fee_confirmed_at: now.toISOString(), hand_delivery_fee_confirmed_by: admin.id,
      hand_delivery_fee_history: [...(Array.isArray(o.hand_delivery_fee_history) ? o.hand_delivery_fee_history : []), { at: now.toISOString(), admin_id: admin.id, admin_email: admin.email, previous: o.hand_delivery_fee_status ?? null, next: "confirmed", note: "Marcado como pago na edição de envio" }],
    } : {}),
    reschedule_required: false,
    notes: rebuildShippingNotes(o.notes, input, ev?.name),
    shipping_edited_by_admin_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  if (input.mode === "delivery" || input.mode === "tracked") Object.assign(patch, input.address ?? {});
  if (input.mode === "tracked") patch.shipping_cost_cents = Math.round(input.shippingCents ?? 0);

  const schedHistory = Array.isArray(o.schedule_history) ? [...o.schedule_history] : [];
  if (o.scheduled_at) schedHistory.push({
    scheduled_at: o.scheduled_at, kind: o.schedule_kind, outcome: "Substituído pelo admin", recorded_at: now.toISOString(),
  });
  patch.schedule_history = schedHistory;
  const editHistory = Array.isArray(o.shipping_edit_history) ? [...o.shipping_edit_history] : [];
  const after = describe({ ...o, ...patch });
  editHistory.push({
    at: now.toISOString(), admin_id: admin.id, admin_email: admin.email,
    previous: before, next: after, mode: input.mode, scheduled_at: patch.scheduled_at ?? null,
    event_name: ev?.name ?? null, out_of_window: warnings.includes(OUT_OF_WINDOW_WARNING), warnings,
  });
  patch.shipping_edit_history = editHistory;

  const { data: upd, error } = await db.from("orders").update(patch).eq("id", o.id).select("*").maybeSingle();
  if (error || !upd) throw new Error("Não foi possível salvar a alteração.");

  // Pilha: sai (remove itens guardados não solicitados) ou entra (se já pago). Prazo de 30 dias intacto.
  if (o.shipping_method === "card_stack" && input.mode !== "stack") {
    await db.from("card_stack_items").delete().eq("order_id", o.id).eq("status", "stored").is("service_order_id", null);
  } else if (input.mode === "stack" && isPaidOrderStatus(o.status)) {
    const { addOrderToStack } = await import("@/lib/card-stack.server");
    await addOrderToStack(o.id).catch((e) => console.error("[admin-shipping-edit] stack", e));
  }
  return { before, after, order: upd };
}

export async function adminEditOrderShipping(
  admin: { id: string; email: string | null },
  orderId: string,
  input: AdminShippingInput,
  opts: { notifyClient: boolean; applyToStack: boolean; allowAnyMode?: boolean },
) {
  const err = validateAdminShippingInput(input);
  if (err) throw new Error(err);
  const db = supabaseAdmin as any;
  const now = new Date();
  const { data: o } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!o) throw new Error("Pedido não encontrado.");
  if (!opts.allowAnyMode && !canAdminEditShipping(o)) throw new Error("Este pedido não permite editar envio/retirada.");

  let ev: PickupEvent | null = null;
  if (input.mode === "event") {
    const { data: row } = await db.from("events").select("*").eq("id", input.eventId).maybeSingle();
    if (!row) throw new Error("Evento não encontrado.");
    ev = toEvent(row);
  }
  const warnings = adminShippingWarnings(input, ev, now);

  // Pedidos alvo: este, ou todos da mesma pilha com cartas guardadas.
  const targets: any[] = [o];
  if (opts.applyToStack && o.shipping_method === "card_stack") {
    const { data: mine } = await db.from("card_stack_items").select("stack_id").eq("order_id", o.id).limit(1);
    const stackId = mine?.[0]?.stack_id;
    if (stackId) {
      const { data: rows } = await db.from("card_stack_items").select("order_id").eq("stack_id", stackId).eq("status", "stored");
      const ids = [...new Set((rows ?? []).map((r: any) => r.order_id).filter((id: string | null) => id && id !== o.id))];
      if (ids.length) {
        const { data: others } = await db.from("orders").select("*").in("id", ids);
        for (const x of others ?? []) if (canAdminEditShipping(x)) targets.push(x);
      }
    }
  }

  const results = [];
  for (const t of targets) results.push(await applyToOrder(t, input, ev, admin, warnings, now));
  const main = results[0];

  // Alerta central: notificação no admin + e-mails (cliente opcional, loja sempre).
  const data = scheduleConfirmationData(main.order);
  const otherIds = results.slice(1).map((r) => `#${r.order.id.slice(0, 8).toUpperCase()}`);
  try {
    const { notifyFulfillmentChange } = await import("@/lib/fulfillment-alerts.server");
    const { modalityOfOrder } = await import("@/lib/fulfillment-alerts");
    const mo = main.order;
    await notifyFulfillmentChange({
      targetType: "order", targetId: mo.id, code: `#${mo.id.slice(0, 8).toUpperCase()}`,
      action: "changed", source: "admin", modality: modalityOfOrder(mo),
      customerName: mo.recipient_name, customerEmail: mo.email, customerPhone: mo.phone ?? null,
      scheduledAt: mo.scheduled_at ?? null, when: data?.when ?? null, eventId: mo.event_id ?? null, eventName: ev?.name ?? null,
      location: data?.address || null, before: main.before,
      relatedOrders: otherIds.length ? [`#${mo.id.slice(0, 8).toUpperCase()}`, ...otherIds] : undefined,
      calendarUrl: data?.calendarUrl ?? null, notifyClient: opts.notifyClient,
      dedupeExtra: String(now.getTime()),
    });
  } catch (e) { console.error("[admin-shipping-edit] alert", e); }
  return { updated: results.length, warnings, after: main.after };
}
