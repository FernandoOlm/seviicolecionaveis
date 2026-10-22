// Regras puras do hub de Eventos (inclusão manual de pedidos pelo admin).
import { todayYmd, localParts } from "@/lib/scheduling";
import type { PickupEvent } from "@/lib/events";

export const EVENT_BLOCKED_MESSAGE = "Este evento está desativado ou já terminou. Não é possível adicionar pedidos.";
const INELIGIBLE = ["delivered", "cancelled", "refunded"];

export function canAddToEvent(ev: Pick<PickupEvent, "active" | "end_date">, now = new Date()): boolean {
  return !!ev.active && ev.end_date >= todayYmd(now);
}

export function isEligibleForEvent(status: string): boolean {
  return !INELIGIBLE.includes(status);
}

/** "#ab12" → "ab12"; mantém o resto para busca por nome/e-mail/telefone. */
export function normalizeOrderQuery(q: string): string {
  return q.trim().replace(/^#/, "").trim();
}

/** Quantos pedidos já estão em cada horário (informativo, sem limite). */
export function slotCounts(orders: Array<{ scheduledAt: string | null }>, ymd: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of orders) {
    if (!o.scheduledAt) continue;
    const p = localParts(o.scheduledAt);
    if (p.ymd === ymd) out[p.time] = (out[p.time] ?? 0) + 1;
  }
  return out;
}

export interface PreviousModality {
  shipping_method: string | null;
  schedule_kind: string | null;
  scheduled_at: string | null;
  event_id: string | null;
  notes: string | null;
  hand_delivery_fee_status: string | null;
}

/** Ao remover do evento: volta à modalidade anterior, ou à Pilha / "Definir depois". */
export function restorePatch(prev: PreviousModality | null, inStack: boolean): PreviousModality {
  if (prev && prev.schedule_kind !== "event") return prev;
  return {
    shipping_method: inStack || prev?.shipping_method === "card_stack" ? "card_stack" : "to_define",
    schedule_kind: null, scheduled_at: null, event_id: null,
    notes: prev?.notes ?? null, hand_delivery_fee_status: null,
  };
}
