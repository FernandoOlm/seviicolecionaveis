// Edição de envio/retirada pelo admin (regras puras, seguras para o navegador).
import { formatSchedule, validateSchedule } from "./scheduling";
import { validateEventSchedule, ymdOfIso, type PickupEvent } from "./events";
import { localParts } from "./scheduling";

export type AdminShippingMode = "pickup" | "event" | "delivery" | "tracked" | "stack";

export const ADMIN_SHIPPING_MODE_LABELS: Record<AdminShippingMode, string> = {
  pickup: "Retirada em mãos",
  event: "Retirada em eventos",
  delivery: "Entrega em mãos",
  tracked: "Frete rastreado",
  stack: "Manter na Pilha de Cartas",
};

export const PICKUP_POINT_LABELS = {
  aruana: "Aruana — Rua Josepha Andrade Irmã Fontes, 600, Residencial Vista Aruana",
  aeroporto: "Aeroporto — Av. Silvério Leite Fontes, 1128, Palm Ville Residence",
} as const;
export type PickupPoint = keyof typeof PICKUP_POINT_LABELS;

export const OUT_OF_WINDOW_WARNING = "Você está agendando fora do prazo padrão";

export interface AdminShippingAddress {
  cep?: string; street?: string; number?: string; complement?: string;
  neighborhood?: string; city?: string; state?: string;
}

export interface AdminShippingInput {
  mode: AdminShippingMode;
  at?: string | null;
  pickupPoint?: PickupPoint | null;
  eventId?: string | null;
  address?: AdminShippingAddress | null;
  deliveryInfo?: string | null;
  feeStatus?: "pending" | "confirmed" | null;
  shippingCents?: number | null;
}

/** Campos obrigatórios por modalidade. Retorna mensagem clara ou null. */
export function validateAdminShippingInput(i: AdminShippingInput): string | null {
  const addrOk = (a?: AdminShippingAddress | null) =>
    !!a && !!a.street?.trim() && !!a.number?.trim() && !!a.city?.trim();
  switch (i.mode) {
    case "pickup":
      if (!i.pickupPoint) return "Escolha o local da retirada (Aruana ou Aeroporto).";
      if (!i.at) return "Escolha a data e o horário da retirada.";
      return null;
    case "event":
      if (!i.eventId) return "Escolha o evento.";
      if (!i.at) return "Escolha o horário da retirada no evento.";
      return null;
    case "delivery":
      if (!i.at) return "Escolha a quinta-feira da entrega.";
      if (!addrOk(i.address)) return "Preencha o endereço da entrega (rua, número e cidade).";
      if (!i.feeStatus) return "Informe o status do pagamento do Pix de R$ 15.";
      return null;
    case "tracked":
      if (!addrOk(i.address) || !i.address?.cep?.trim()) return "Preencha o endereço completo com CEP.";
      if (i.shippingCents == null || !Number.isFinite(i.shippingCents) || i.shippingCents < 0)
        return "Informe o valor do frete.";
      return null;
    case "stack":
      return null;
  }
}

/** Avisos (não bloqueiam): fora do prazo de 24h, dia/horário inválido ou evento sem disponibilidade. */
export function adminShippingWarnings(i: AdminShippingInput, ev: PickupEvent | null, now = new Date()): string[] {
  if (!i.at) return [];
  const out: string[] = [];
  if (i.mode === "pickup" || i.mode === "delivery") {
    const err = validateSchedule(i.mode, i.at, now);
    if (err) out.push(new Date(i.at).getTime() - now.getTime() < 24 * 3_600_000 ? OUT_OF_WINDOW_WARNING : err);
  } else if (i.mode === "event" && ev) {
    const err = validateEventSchedule(ev, ymdOfIso(i.at), localParts(i.at).time, now);
    if (err) out.push(`Horário sem disponibilidade no evento: ${err}`);
    if (new Date(i.at).getTime() - now.getTime() < 24 * 3_600_000) out.push(OUT_OF_WINDOW_WARNING);
  }
  return [...new Set(out)];
}

const SCHEDULE_LINE = /^(Retirada em mãos: |Retirada em eventos: |Entrega em mãos \(Aracaju\)|Informações adicionais: )/;

/** Substitui as linhas de modalidade nas observações, mantendo o resto. */
export function rebuildShippingNotes(prev: string | null, i: AdminShippingInput, eventName?: string | null): string | null {
  const kept = (prev ?? "").split("\n").filter((l) => !SCHEDULE_LINE.test(l));
  let line = "";
  if (i.mode === "pickup" && i.pickupPoint && i.at)
    line = `Retirada em mãos: ${PICKUP_POINT_LABELS[i.pickupPoint]} — ${formatSchedule("pickup", i.at)}.`;
  else if (i.mode === "event" && i.at)
    line = `Retirada em eventos: ${eventName ?? "Evento"} — ${formatSchedule("pickup", i.at)}.`;
  else if (i.mode === "delivery" && i.at)
    line = `Entrega em mãos (Aracaju) — ${formatSchedule("delivery", i.at)}. Taxa R$ 15,00 via Pix — ${i.feeStatus === "confirmed" ? "pago" : "aguardando comprovante"}.` +
      (i.deliveryInfo?.trim() ? `\nInformações adicionais: ${i.deliveryInfo.trim()}` : "");
  const out = [line, ...kept].filter((l) => l.trim()).join("\n");
  return out || null;
}

/** Modalidade atual do pedido, para comparação lado a lado. */
export function currentShippingMode(o: { shipping_method: string | null; schedule_kind: string | null }): AdminShippingMode | null {
  if (o.schedule_kind === "pickup") return "pickup";
  if (o.schedule_kind === "event") return "event";
  if (o.schedule_kind === "delivery") return "delivery";
  if (o.shipping_method === "card_stack") return "stack";
  if (o.shipping_method === "fixed") return "tracked";
  return null;
}

/** Botão aparece em Pilha, Retirada em eventos ou Retirada em mãos, e nunca após "Entregue". */
export function canAdminEditShipping(o: { status: string; shipping_method: string | null; schedule_kind: string | null }): boolean {
  if (["delivered", "cancelled", "refunded"].includes(o.status)) return false;
  return o.shipping_method === "card_stack" || o.shipping_method === "to_define" || o.schedule_kind === "event" || o.schedule_kind === "pickup";
}
