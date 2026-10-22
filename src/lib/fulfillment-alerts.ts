// Regras puras (browser-safe) dos alertas de modalidade de retirada/envio.

export type Modality = "none" | "pickup" | "event" | "delivery" | "shipping";
export type FulfillmentAction = "defined" | "changed" | "cancelled";

export const MODALITIES: Modality[] = ["none", "pickup", "event", "delivery", "shipping"];
export const MODALITY_LABELS: Record<Modality, string> = {
  none: "Pilha (sem escolha)",
  pickup: "Retirada em mãos",
  event: "Retirada em eventos",
  delivery: "Entrega em mãos",
  shipping: "Frete rastreado",
};

export function modalityOfOrder(o: { shipping_method?: string | null; schedule_kind?: string | null }): Modality {
  const m = o.shipping_method ?? "";
  if (m === "card_stack" || m === "to_define" || m === "") return "none";
  if (m === "arrange") {
    if (o.schedule_kind === "event") return "event";
    if (o.schedule_kind === "delivery") return "delivery";
    return "pickup";
  }
  if (m === "presencial" || m === "arte_em_cards") return "pickup";
  if (m === "delivery_app") return "delivery";
  return "shipping";
}

export function modalityOfServiceOrder(method: string | null | undefined): Modality {
  if (method === "evento") return "event";
  if (method === "app") return "delivery";
  if (method === "correios") return "shipping";
  if (method === "presencial" || method === "arte_em_cards") return "pickup";
  return "none";
}

/** Chave única por alvo + ação + modalidade + data/horário + evento: cliques duplos não geram alertas repetidos. */
export function fulfillmentDedupeKey(p: {
  targetType: string; targetId: string; action: FulfillmentAction; modality: Modality;
  scheduledAt?: string | null; eventId?: string | null; extra?: string | null;
}): string {
  const at = p.scheduledAt ? new Date(p.scheduledAt).toISOString() : "";
  return [p.targetType, p.targetId, p.action, p.modality, at, p.eventId ?? "", p.extra ?? ""].join("|");
}

export function fulfillmentTitle(action: FulfillmentAction, modality: Modality): string {
  if (action === "cancelled") return "Agendamento cancelado";
  const base: Record<Modality, string> = {
    none: "Pedido na Pilha", pickup: "retirada em mãos", event: "retirada em evento",
    delivery: "entrega em mãos", shipping: "envio rastreado",
  };
  if (modality === "none") return action === "changed" ? "Pedido voltou para a Pilha" : "Pedido na Pilha";
  return action === "changed" ? `Alteração de ${base[modality]}` : `Nova ${base[modality]}`;
}

export function clientEmailSubject(action: FulfillmentAction, modality: Modality): string {
  if (action === "cancelled") return "Seu agendamento foi cancelado";
  const word = modality === "shipping" || modality === "delivery" ? "entrega" : "retirada";
  const noun = modality === "shipping" ? "Seu envio" : modality === "delivery" ? "Sua entrega" : "Sua retirada";
  if (modality === "none") return "Seu pedido está na Pilha de Cartas";
  void word;
  return action === "changed" ? `${noun} foi ${modality === "shipping" ? "alterado" : "alterada"}` : `${noun} foi ${modality === "shipping" ? "confirmado" : "confirmada"}`;
}

/** Retries: 3 tentativas com espera crescente (ms antes de cada nova tentativa). */
export const EMAIL_RETRY_DELAYS_MS = [0, 1500, 4000];

export type DateRange = "all" | "today" | "tomorrow" | "week" | "custom";

const TZ = "America/Fortaleza";
function ymd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Filtro de data do agendamento, no fuso de Fortaleza. Semana = hoje até +6 dias. */
export function matchesScheduleRange(
  iso: string | null | undefined, range: DateRange, now = new Date(), from?: string, to?: string,
): boolean {
  if (range === "all") return true;
  if (!iso) return false;
  const day = ymd(new Date(iso));
  const today = ymd(now);
  const plus = (n: number) => ymd(new Date(now.getTime() + n * 86_400_000));
  if (range === "today") return day === today;
  if (range === "tomorrow") return day === plus(1);
  if (range === "week") return day >= today && day <= plus(6);
  if (range === "custom") return (!from || day >= from) && (!to || day <= to);
  return true;
}

export function formatScheduleShort(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(iso: string, now = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}
