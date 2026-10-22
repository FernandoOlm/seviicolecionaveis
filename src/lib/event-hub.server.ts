import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canAddToEvent, isEligibleForEvent, normalizeOrderQuery, restorePatch, EVENT_BLOCKED_MESSAGE, type PreviousModality } from "@/lib/event-hub";
import { formatSchedule } from "@/lib/scheduling";
import { modalityOfOrder, MODALITY_LABELS } from "@/lib/fulfillment-alerts";

type Admin = { id: string; email: string | null };
const db = () => supabaseAdmin as any;
const code = (id: string) => id.slice(0, 8).toUpperCase();

function modalityLabel(o: any): string {
  const m = MODALITY_LABELS[modalityOfOrder(o)];
  if (o.shipping_method === "card_stack" && !o.schedule_kind) return "Pilha de Cartas";
  if (o.shipping_method === "to_define") return "Sem modalidade";
  return o.scheduled_at ? `${m} ${formatSchedule("pickup", o.scheduled_at)}` : m;
}

async function loadEvent(eventId: string) {
  const { data: ev } = await db().from("events").select("*").eq("id", eventId).maybeSingle();
  if (!ev) throw new Error("Evento não encontrado.");
  return ev;
}

async function stackIdsOf(orderIds: string[]) {
  if (!orderIds.length) return new Map<string, string>();
  const { data } = await db().from("card_stack_items").select("order_id, stack_id").in("order_id", orderIds).eq("status", "stored");
  return new Map<string, string>((data ?? []).map((r: any) => [r.order_id, r.stack_id]));
}

export async function searchEventCandidates(eventId: string, rawQuery: string) {
  const q = normalizeOrderQuery(rawQuery).toLowerCase();
  if (q.length < 2) return [];
  const digits = q.replace(/\D/g, "");
  const { data } = await db().from("orders")
    .select("id, recipient_name, email, phone, status, shipping_method, schedule_kind, scheduled_at, event_id, total_cents, shipping_cost_cents, hand_delivery_fee_status, created_at, order_items(card_name, quantity)")
    .not("status", "in", "(delivered,cancelled,refunded)")
    .order("created_at", { ascending: false }).limit(1500);
  const rows = (data ?? []).filter((o: any) =>
    o.id.toLowerCase().startsWith(q) ||
    (o.recipient_name ?? "").toLowerCase().includes(q) ||
    (o.email ?? "").toLowerCase().includes(q) ||
    (digits.length >= 4 && (o.phone ?? "").replace(/\D/g, "").includes(digits)),
  ).slice(0, 30);
  const stacks = await stackIdsOf(rows.map((o: any) => o.id));
  return rows.map((o: any) => {
    const items = (o.order_items ?? []) as Array<{ card_name: string; quantity: number }>;
    return {
      id: o.id as string, code: code(o.id), customer: o.recipient_name as string | null,
      items: items.slice(0, 3).map((i) => `${i.quantity}× ${i.card_name}`).join(", ") + (items.length > 3 ? ` +${items.length - 3}` : ""),
      status: o.status as string, modality: modalityLabel(o), totalCents: o.total_cents as number,
      alreadyInEvent: o.event_id === eventId,
      hasSchedule: !!o.scheduled_at || o.shipping_method === "fixed" || o.shipping_method === "superfrete",
      feeWarning: o.hand_delivery_fee_status === "paid" || o.hand_delivery_fee_status === "confirmed" || (o.shipping_cost_cents ?? 0) > 0,
      stackId: stacks.get(o.id) ?? null,
    };
  });
}

export async function addOrdersToEvent(admin: Admin, input: { eventId: string; orderIds: string[]; includeStack: boolean; at: string; notifyClient: boolean }) {
  const ev = await loadEvent(input.eventId);
  if (!canAddToEvent(ev)) throw new Error(EVENT_BLOCKED_MESSAGE);
  const ids = new Set(input.orderIds);
  if (input.includeStack) {
    const stacks = [...new Set((await stackIdsOf(input.orderIds)).values())];
    if (stacks.length) {
      const { data } = await db().from("card_stack_items").select("order_id").in("stack_id", stacks).eq("status", "stored");
      for (const r of data ?? []) if (r.order_id) ids.add(r.order_id);
    }
  }
  const { adminEditOrderShipping } = await import("@/lib/admin-shipping-edit.server");
  const added: string[] = []; const skipped: string[] = []; const warnings = new Set<string>();
  const now = new Date().toISOString();
  for (const id of ids) {
    const { data: o } = await db().from("orders").select("*").eq("id", id).maybeSingle();
    if (!o || !isEligibleForEvent(o.status) || o.event_id === input.eventId) { skipped.push(id); continue; }
    const prev: PreviousModality = {
      shipping_method: o.shipping_method, schedule_kind: o.schedule_kind, scheduled_at: o.scheduled_at,
      event_id: o.event_id, notes: o.notes, hand_delivery_fee_status: o.hand_delivery_fee_status,
    };
    // Trava contra cliques repetidos: só um pedido passa a apontar para este evento.
    const claim = db().from("orders").update({ event_id: input.eventId, event_previous: prev, event_added_manually_at: now, event_added_by: admin.id }).eq("id", id);
    const { data: claimed } = await (o.event_id ? claim.neq("event_id", input.eventId) : claim.is("event_id", null)).select("id");
    if (!claimed?.length) { skipped.push(id); continue; }
    try {
      const r = await adminEditOrderShipping(admin, id, { mode: "event", eventId: input.eventId, at: input.at }, { notifyClient: input.notifyClient, applyToStack: false, allowAnyMode: true });
      r.warnings.forEach((w: string) => warnings.add(w));
      added.push(id);
    } catch (e) {
      await db().from("orders").update({ event_id: prev.event_id, event_previous: null, event_added_manually_at: null, event_added_by: null }).eq("id", id);
      throw e;
    }
  }
  return { added: added.length, skipped: skipped.length, warnings: [...warnings] };
}

export async function rescheduleEventOrder(admin: Admin, input: { eventId: string; orderId: string; at: string; notifyClient: boolean }) {
  const { data: o } = await db().from("orders").select("event_id, status").eq("id", input.orderId).maybeSingle();
  if (!o || o.event_id !== input.eventId) throw new Error("Pedido não está neste evento.");
  const { adminEditOrderShipping } = await import("@/lib/admin-shipping-edit.server");
  const r = await adminEditOrderShipping(admin, input.orderId, { mode: "event", eventId: input.eventId, at: input.at }, { notifyClient: input.notifyClient, applyToStack: false, allowAnyMode: true });
  return { warnings: r.warnings };
}

export async function removeOrderFromEvent(admin: Admin, input: { eventId: string; orderId: string }) {
  const { data: o } = await db().from("orders").select("*").eq("id", input.orderId).maybeSingle();
  if (!o || o.event_id !== input.eventId) throw new Error("Pedido não está neste evento.");
  const ev = await loadEvent(input.eventId);
  const restored = restorePatch(o.event_previous ?? null, false);
  const now = new Date().toISOString();
  const before = `Retirada em eventos — ${ev.name}${o.scheduled_at ? ` — ${formatSchedule("pickup", o.scheduled_at)}` : ""}`;
  const history = Array.isArray(o.shipping_edit_history) ? [...o.shipping_edit_history] : [];
  history.push({ at: now, admin_id: admin.id, admin_email: admin.email, previous: before, next: modalityLabel({ ...o, ...restored }), mode: "remove_from_event", event_name: ev.name });
  const sched = Array.isArray(o.schedule_history) ? [...o.schedule_history] : [];
  if (o.scheduled_at) sched.push({ scheduled_at: o.scheduled_at, kind: "event", outcome: "Removido do evento pelo admin", recorded_at: now });
  const { data: upd, error } = await db().from("orders").update({
    ...restored, reschedule_required: false, event_previous: null, event_added_manually_at: null, event_added_by: null,
    shipping_edit_history: history, schedule_history: sched, shipping_edited_by_admin_at: now, updated_at: now,
  }).eq("id", o.id).eq("event_id", input.eventId).select("*").maybeSingle();
  if (error || !upd) throw new Error("Não foi possível remover do evento.");
  if (upd.shipping_method === "card_stack") {
    const { addOrderToStack } = await import("@/lib/card-stack.server");
    await addOrderToStack(upd.id).catch((e) => console.error("[event-hub] stack", e));
  }
  try {
    const { notifyFulfillmentChange } = await import("@/lib/fulfillment-alerts.server");
    await notifyFulfillmentChange({
      targetType: "order", targetId: upd.id, code: `#${code(upd.id)}`, action: "changed", source: "admin",
      modality: modalityOfOrder(upd), customerName: upd.recipient_name, customerEmail: upd.email,
      scheduledAt: upd.scheduled_at, when: upd.scheduled_at ? formatSchedule("pickup", upd.scheduled_at) : null,
      before, notifyClient: false, dedupeExtra: `remove-${now}`,
    });
  } catch (e) { console.error("[event-hub] alert", e); }
  return { ok: true };
}

export async function markEventOrderDelivered(admin: Admin, input: { eventId: string; orderId: string }) {
  const now = new Date().toISOString();
  const { data, error } = await db().from("orders").update({ status: "delivered", updated_at: now })
    .eq("id", input.orderId).eq("event_id", input.eventId).not("status", "in", "(delivered,cancelled,refunded)").select("id");
  if (error) throw new Error("Não foi possível marcar como entregue.");
  if (!data?.length) throw new Error("Pedido já entregue ou não está neste evento.");
  void admin;
  return { ok: true };
}
