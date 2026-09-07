// Loyalty / Programa de Pontos Sevii — constantes e helpers puros (isomórficos).

export const REAIS_PER_POINT = 5;           // R$ 5 gastos = 1 ponto (base Bronze) — 100 pts = R$5 → 1% de retorno
export const POINTS_PER_REAL = 1 / REAIS_PER_POINT;
export const POINTS_PER_REDEEM_BLOCK = 100; // múltiplos de 100 pontos
export const CENTS_PER_REDEEM_BLOCK = 500;  // 100 pontos = R$ 5,00
export const MIN_REDEEM_POINTS = 100;
export const SIGNUP_BONUS_POINTS = 50;
export const BIRTHDAY_BONUS_POINTS = 100;
export const EXPIRATION_MONTHS = 12;        // pontos expiram após 12 meses

// ---------------- Tiers ----------------
export type LoyaltyTier = "bronze" | "silver" | "gold";

export interface TierConfig {
  key: LoyaltyTier;
  label: string;
  /** Pontos ganhos ao longo da vida para entrar nesse tier. */
  threshold: number;
  /** Multiplicador em basis points (10000 = 1.00x). */
  multiplierBp: number;
  color: string; // tailwind class fragment
}

export const TIERS: TierConfig[] = [
  { key: "bronze", label: "Bronze", threshold: 0,    multiplierBp: 10000, color: "amber-700" },
  { key: "silver", label: "Prata",  threshold: 500,  multiplierBp: 12500, color: "slate-400" },
  { key: "gold",   label: "Ouro",   threshold: 2000, multiplierBp: 15000, color: "yellow-500" },
];

export function tierFromLifetime(lifetimeEarned: number): TierConfig {
  let current = TIERS[0];
  for (const t of TIERS) if (lifetimeEarned >= t.threshold) current = t;
  return current;
}

export function nextTier(currentKey: LoyaltyTier): TierConfig | null {
  const idx = TIERS.findIndex((t) => t.key === currentKey);
  return idx >= 0 && idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}

export function multiplierLabel(bp: number): string {
  const v = bp / 10000;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 }) + "x";
}

/**
 * Pontos ganhos em um pedido pago (base = subtotal − descontos, em centavos),
 * aplicando o multiplicador de tier (em basis points; 10000 = 1.00x).
 */
export function pointsEarnedFromCents(baseAfterDiscountCents: number, multiplierBp: number = 10000): number {
  if (!baseAfterDiscountCents || baseAfterDiscountCents <= 0) return 0;
  // R$ 5 = 1 pt → centavos/500 = pts (base). Multiplicador via bp.
  const base = baseAfterDiscountCents / (100 * REAIS_PER_POINT);
  return Math.floor((base * multiplierBp) / 10000);
}


/** Converte pontos resgatados em desconto (centavos). */
export function pointsToDiscountCents(points: number): number {
  if (!points || points <= 0) return 0;
  const blocks = Math.floor(points / POINTS_PER_REDEEM_BLOCK);
  return blocks * CENTS_PER_REDEEM_BLOCK;
}

/** Normaliza pontos para múltiplos válidos, respeitando saldo e teto. */
export function normalizeRedeemPoints(
  desired: number,
  balance: number,
  maxDiscountableCents: number,
): number {
  if (!desired || desired < MIN_REDEEM_POINTS) return 0;
  const maxByCents = Math.floor(maxDiscountableCents / CENTS_PER_REDEEM_BLOCK) * POINTS_PER_REDEEM_BLOCK;
  const cap = Math.min(balance, maxByCents);
  if (cap < MIN_REDEEM_POINTS) return 0;
  const blocks = Math.floor(Math.min(desired, cap) / POINTS_PER_REDEEM_BLOCK);
  return blocks * POINTS_PER_REDEEM_BLOCK;
}

// ---------------- Resgate restrito a cartas avulsas ----------------
// Itens não-carta usam um prefixo no id ("sealed:", "accessory:", "videogame:",
// "panel:", "stack:", etc). Cartas avulsas usam o uuid da tabela `cards` OU o id
// composto do catálogo (`nome__colecao__numero`), que nunca contém ":".
const NON_SINGLE_PREFIX_RE = /^[a-z_]+:/i;

/**
 * Cartas avulsas acumulam e aceitam resgate de pontos.
 * Produtos lacrados, acessórios, videogames, painéis e pilhas acumulam pontos,
 * mas não podem ser pagos com pontos.
 */
export function isSingleCardId(cardId: string | null | undefined): boolean {
  return typeof cardId === "string" && cardId.length > 0 && !NON_SINGLE_PREFIX_RE.test(cardId);
}


/** Subtotal (em centavos) apenas das cartas avulsas do carrinho. unitPrice em reais. */
export function singlesSubtotalCents(
  items: ReadonlyArray<{ cardId: string; unitPrice: number; quantity: number }>,
): number {
  return items.reduce(
    (sum, i) => sum + (isSingleCardId(i.cardId) ? Math.round(i.unitPrice * 100) * i.quantity : 0),
    0,
  );
}

export function formatPoints(n: number): string {
  return n.toLocaleString("pt-BR");
}

export type LoyaltyReason =
  | "signup"
  | "birthday"
  | "order_earned"
  | "order_redeemed"
  | "admin_adjust"
  | "refund"
  | "expiration";

export const REASON_LABEL: Record<LoyaltyReason, string> = {
  signup: "Bônus de boas-vindas",
  birthday: "Bônus de aniversário",
  order_earned: "Pontos do pedido",
  order_redeemed: "Resgate em pedido",
  admin_adjust: "Ajuste manual",
  refund: "Estorno",
  expiration: "Pontos expirados",
};
