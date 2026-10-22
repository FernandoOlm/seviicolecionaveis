// Pedido manual criado pelo admin (regras puras, seguras para o navegador).
import type { AdminShippingMode } from "./admin-shipping-edit";

export type ManualShippingMode = AdminShippingMode | "later";
export const MANUAL_SHIPPING_LATER = "to_define";

export const MANUAL_SOURCES = {
  whatsapp: "WhatsApp", instagram: "Instagram", presencial: "Presencial", evento: "Evento", outro: "Outro",
} as const;
export type ManualSource = keyof typeof MANUAL_SOURCES;

export const MANUAL_PAYMENT_METHODS = {
  manual_pix: "Pix", manual_cash: "Dinheiro", manual_card: "Cartão (maquininha)", manual_other: "Outro",
} as const;
export type ManualPaymentMethod = keyof typeof MANUAL_PAYMENT_METHODS;

export interface ManualItem {
  kind: "catalog" | "custom";
  cardId?: string | null;
  name: string;
  unitPriceCents: number;
  quantity: number;
}

export interface ManualAdjustments {
  discountType: "fixed" | "percent";
  discountValue: number; // centavos (fixed) ou % (percent)
  discountReason?: string;
  surchargeCents: number;
  surchargeReason?: string;
}

export function manualSubtotalCents(items: ManualItem[]): number {
  return items.reduce((s, i) => s + Math.max(0, Math.round(i.unitPriceCents)) * Math.max(0, Math.floor(i.quantity)), 0);
}

export function manualDiscountCents(subtotal: number, adj: ManualAdjustments): number {
  const v = Math.max(0, adj.discountValue || 0);
  const raw = adj.discountType === "percent" ? Math.round((subtotal * Math.min(v, 100)) / 100) : Math.round(v);
  return Math.min(raw, subtotal);
}

export function manualTotals(items: ManualItem[], adj: ManualAdjustments, shippingCents = 0) {
  const subtotal = manualSubtotalCents(items);
  const discount = manualDiscountCents(subtotal, adj);
  const surcharge = Math.max(0, Math.round(adj.surchargeCents || 0));
  const shipping = Math.max(0, Math.round(shippingCents || 0));
  return { subtotal, discount, surcharge, shipping, total: subtotal - discount + surcharge + shipping };
}

export function validateManualItems(items: ManualItem[]): string | null {
  if (items.length === 0) return "Adicione pelo menos um item ao pedido.";
  for (const i of items) {
    if (!i.name.trim()) return "Todo item precisa de um nome.";
    if (!Number.isInteger(i.quantity) || i.quantity < 1) return `Quantidade inválida em "${i.name}".`;
    if (!Number.isFinite(i.unitPriceCents) || i.unitPriceCents < 0) return `Preço inválido em "${i.name}".`;
    if (i.kind === "catalog" && !i.cardId) return `Item do catálogo sem referência: "${i.name}".`;
  }
  return null;
}

/** Itens do catálogo com quantidade maior que o estoque disponível. */
export function stockShortages(items: ManualItem[], stock: Record<string, number>) {
  const need = new Map<string, { name: string; qty: number }>();
  for (const i of items) {
    if (i.kind !== "catalog" || !i.cardId) continue;
    const cur = need.get(i.cardId) ?? { name: i.name, qty: 0 };
    cur.qty += i.quantity;
    need.set(i.cardId, cur);
  }
  const out: { cardId: string; name: string; requested: number; available: number }[] = [];
  for (const [cardId, n] of need) {
    const available = stock[cardId] ?? 0;
    if (n.qty > available) out.push({ cardId, name: n.name, requested: n.qty, available });
  }
  return out;
}

export function manualShippingMethod(mode: ManualShippingMode): string {
  if (mode === "later") return MANUAL_SHIPPING_LATER;
  if (mode === "stack") return "card_stack";
  if (mode === "tracked") return "fixed";
  return "arrange";
}
