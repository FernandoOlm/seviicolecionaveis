// Regras da Entrega em mãos: área (Aracaju/SE) e status do pagamento da taxa (só admin confirma).

export const HAND_DELIVERY_AREA_MESSAGE =
  "A Entrega em mãos é feita somente em Aracaju/SE. Escolha outra forma de receber seus pedidos.";
export const HAND_DELIVERY_OUT_OF_AREA_WARNING = "Endereço fora da área de entrega";

function norm(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export interface AreaAddress { city?: string | null; state?: string | null; cep?: string | null }

/** Aracaju/SE, tolerante a acentos, maiúsculas e espaços. Se houver CEP, ele precisa ser de Aracaju (49000-000 a 49099-999). */
export function isHandDeliveryArea(a: AreaAddress | null | undefined): boolean {
  if (!a) return false;
  if (norm(a.city) !== "aracaju") return false;
  const st = norm(a.state);
  if (st !== "se" && st !== "sergipe") return false;
  const cep = (a.cep ?? "").replace(/\D/g, "");
  if (cep.length === 8 && !cep.startsWith("490")) return false;
  return true;
}

export type HandDeliveryFeeStatus = "pending" | "confirmed";

/** "paid" de fluxos antigos conta como pago. */
export function isHandDeliveryFeePaid(status: string | null | undefined): boolean {
  return status === "confirmed" || status === "paid";
}

export const HAND_DELIVERY_FEE_LABELS = {
  pending: "Aguardando confirmação",
  paid: "Pago",
} as const;

export function handDeliveryFeeLabel(status: string | null | undefined): string {
  return isHandDeliveryFeePaid(status) ? HAND_DELIVERY_FEE_LABELS.paid : HAND_DELIVERY_FEE_LABELS.pending;
}
