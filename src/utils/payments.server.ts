import { type StripeEnv, createStripeClient } from "@/lib/stripe.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createPixPayment, getPixPayment, createCardPaymentMP } from "@/lib/mercadopago.server";
import { markOrderPaid, cancelOrder } from "@/lib/orders.server";
import type { AdminTestInput, CardInput, PixInput, StripeInput } from "./payments.schemas";
import { sendTransactionalEmailSafe } from "@/lib/email/send.server";
import { computeBundleDiscount } from "@/lib/bundles";
import { TEST_ADMIN_CARD_ID } from "@/lib/test-card";
import { parseVariants, parseAccessoryCartId } from "@/lib/accessory-variants";
import { assertSalesOpen } from "@/lib/event-mode.server";

async function sendOrderReceivedEmail(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, email, recipient_name, total_cents, payment_method")
    .eq("id", orderId)
    .maybeSingle();
  if (!order?.email) return;
  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("card_name, quantity, unit_price_cents, finish, language, card_image")
    .eq("order_id", orderId);
  await sendTransactionalEmailSafe({
    templateName: "order-received",
    recipientEmail: order.email,
    idempotencyKey: `order-received-${order.id}`,
    templateData: {
      recipientName: order.recipient_name?.split(/\s+/)[0],
      orderId: order.id,
      items: items ?? [],
      totalCents: order.total_cents,
      paymentMethod: order.payment_method,
    },
  });
}

/**
 * Cancela quaisquer pedidos pendentes anteriores do mesmo usuário para evitar
 * duplicação (cliente inicia um Pix/cartão, não paga, recomeça e paga — sem
 * isso, ficavam dois registros: "Pedido recebido" + "Pago" para o mesmo carrinho).
 * Libera também as reservas de estoque desses pedidos antigos.
 */
async function cancelOtherPendingOrdersForUser(userId: string, exceptOrderId?: string) {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending");
  if (error || !data) return;
  for (const o of data) {
    if (exceptOrderId && o.id === exceptOrderId) continue;
    try {
      await cancelOrder(o.id);
    } catch (e) {
      console.error("[cancelOtherPendingOrdersForUser] falhou ao cancelar", o.id, e);
    }
  }
}

const SHIPPING_FIXED_CENTS = 2500;
const ADMIN_COUPON_CODE = "POKEAGIOTAGEM";
const ADMIN_COUPON_PERCENT = 30;
const FIRST_PURCHASE_COUPON = "PRIMEIRACOMPRA10";
const FIRST_PURCHASE_PERCENT = 10;
const FIRST_PURCHASE_MAX_DISCOUNT_CENTS = 2000; // teto de R$ 20,00
export const PIX_DISCOUNT_PERCENT = 5; // desconto automático no Pix sobre o subtotal (após cupom)
const PIX_EXPIRES_MINUTES = 30;
export const ARTE_EM_CARDS_FEE_CENTS = 500; // taxa semanal R$ 5,00

export function computePixDiscountCents(subtotalCents: number, couponDiscountCents: number): number {
  const base = Math.max(0, subtotalCents - couponDiscountCents);
  return Math.round((base * PIX_DISCOUNT_PERCENT) / 100);
}

async function resolveArteEmCardsFee(
  userId: string,
  rawCode: string | null | undefined,
): Promise<{ feeCents: number; codeUsed: string | null }> {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (code) {
    const { validateCodeForUser } = await import("@/lib/arte-em-cards.server");
    const v = await validateCodeForUser(userId, code);
    if (v.valid) return { feeCents: 0, codeUsed: v.code };
  }
  return { feeCents: ARTE_EM_CARDS_FEE_CENTS, codeUsed: null };
}

function computeShippingCents(input: {
  shippingMethod: "fixed" | "arrange" | "arte_em_cards" | "card_stack";
  shippingQuote?: { priceCents: number } | null;
}): number {
  if (input.shippingMethod === "arte_em_cards") {
    // Caller handles Arte em Cards fee separately (needs DB lookup).
    return 0;
  }
  if (input.shippingMethod === "card_stack") {
    // Pilha de Cartas: armazenamento gratuito; frete é cobrado quando o cliente solicita o envio.
    return 0;
  }
  if (input.shippingQuote && input.shippingQuote.priceCents >= 0) {
    return input.shippingQuote.priceCents;
  }
  return input.shippingMethod === "fixed" ? SHIPPING_FIXED_CENTS : 0;
}

async function resolvePointsRedemption(
  userId: string,
  desired: number | null | undefined,
  maxDiscountableCents: number,
): Promise<{ points: number; discountCents: number }> {
  const want = Math.max(0, Math.floor(desired ?? 0));
  if (want <= 0 || maxDiscountableCents <= 0) return { points: 0, discountCents: 0 };
  const { normalizeRedeemPoints, pointsToDiscountCents } = await import("@/lib/loyalty");
  const { data: balRow } = await supabaseAdmin.rpc("user_points_balance", { _user_id: userId });
  const balance = Number(balRow ?? 0);
  const points = normalizeRedeemPoints(want, balance, maxDiscountableCents);
  return { points, discountCents: pointsToDiscountCents(points) };
}

/** Verifica se o cliente já atingiu o limite de usos por conta do cupom (pedidos não cancelados). */
async function userReachedCouponLimit(
  userId: string,
  coupon: { code: string; max_uses_per_user?: number | null },
): Promise<boolean> {
  const limit = coupon.max_uses_per_user;
  if (!limit || limit < 1) return false;
  const { count, error } = await supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("coupon_code", coupon.code)
    .neq("status", "cancelled");
  if (error) throw new Error(error.message);
  return (count ?? 0) >= limit;
}

async function validateCoupon(
  userId: string,
  rawCode: string | null | undefined,
  subtotalCents: number,
): Promise<{ discountCents: number; code: string | null; walletCouponId: string | null; walletDeductionCents: number }> {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) return { discountCents: 0, code: null, walletCouponId: null, walletDeductionCents: 0 };

  if (code === ADMIN_COUPON_CODE) {
    const { data: roleRow, error } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!roleRow) throw new Error("Cupom restrito a administradores");
    return {
      discountCents: Math.round((subtotalCents * ADMIN_COUPON_PERCENT) / 100),
      code: ADMIN_COUPON_CODE,
      walletCouponId: null,
      walletDeductionCents: 0,
    };
  }

  if (code === FIRST_PURCHASE_COUPON) {
    // Uso único por conta: bloqueia se já existir QUALQUER pedido do usuário
    // com este cupom que não tenha sido cancelado (pago ou pendente vale).
    const { count, error } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("coupon_code", FIRST_PURCHASE_COUPON)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
    if ((count ?? 0) > 0) {
      throw new Error("Cupom PRIMEIRACOMPRA10 já foi utilizado nesta conta");
    }
    const raw = Math.round((subtotalCents * FIRST_PURCHASE_PERCENT) / 100);
    return {
      discountCents: Math.min(raw, FIRST_PURCHASE_MAX_DISCOUNT_CENTS),
      code: FIRST_PURCHASE_COUPON,
      walletCouponId: null,
      walletDeductionCents: 0,
    };
  }

  // Fallback: cupons gerenciáveis na tabela public.coupons
  const { data: coupon, error: couponErr } = await supabaseAdmin
    .from("coupons")
    .select("id, code, user_id, percent, amount_cents, balance_cents, max_discount_cents, max_uses, max_uses_per_user, used_count, expires_at, active")
    .eq("code", code)
    .maybeSingle();
  if (couponErr) throw new Error(couponErr.message);
  if (!coupon || !coupon.active) throw new Error("Cupom inválido");
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    throw new Error("Cupom expirado");
  }
  if (coupon.user_id && coupon.user_id !== userId) {
    throw new Error("Este cupom não está disponível para sua conta");
  }

  // Vale-presente carteira: usa balance_cents (multi-uso até zerar saldo).
  // IMPORTANTE: NÃO debita o saldo aqui — apenas valida e retorna o valor.
  // O débito real acontece em markOrderPaid() para evitar perder saldo em
  // tentativas de pagamento que não se concretizam.
  const isWallet =
    !!coupon.user_id &&
    coupon.amount_cents != null &&
    coupon.amount_cents > 0 &&
    coupon.balance_cents != null;

  if (isWallet) {
    const balance = coupon.balance_cents ?? 0;
    if (balance <= 0) throw new Error("Saldo do vale-presente esgotado");
    const discountCents = Math.min(balance, subtotalCents);
    return {
      discountCents,
      code: coupon.code,
      walletCouponId: coupon.id,
      walletDeductionCents: discountCents,
    };
  }

  if (coupon.used_count >= coupon.max_uses) {
    throw new Error("Cupom já foi utilizado");
  }
  if (await userReachedCouponLimit(userId, coupon)) {
    throw new Error("Você já utilizou este cupom");
  }

  // Reserva o uso de forma atômica (evita corrida de uso duplicado)
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("coupons")
    .update({ used_count: coupon.used_count + 1 })
    .eq("id", coupon.id)
    .eq("used_count", coupon.used_count)
    .select("id")
    .maybeSingle();
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed) throw new Error("Cupom já foi utilizado");

  let discountCents: number;
  if (coupon.amount_cents && coupon.amount_cents > 0) {
    // Vale-presente de valor fixo (single-use legado)
    discountCents = Math.min(coupon.amount_cents, subtotalCents);
  } else {
    const percent = coupon.percent ?? 0;
    const raw = Math.round((subtotalCents * percent) / 100);
    discountCents =
      coupon.max_discount_cents && coupon.max_discount_cents > 0
        ? Math.min(raw, coupon.max_discount_cents)
        : raw;
  }
  return { discountCents, code: coupon.code, walletCouponId: null, walletDeductionCents: 0 };
}


export async function previewCouponServer(
  userId: string,
  rawCode: string,
  subtotalCents: number,
): Promise<
  | { valid: true; discountCents: number; code: string; label: string; kind: "amount" | "percent"; percent: number | null; amountCents: number | null }
  | { valid: false; error: string }
> {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) return { valid: false, error: "Informe um código" };
  try {
    if (code === ADMIN_COUPON_CODE) {
      const { data: roleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleRow) return { valid: false, error: "Cupom restrito a administradores" };
      return {
        valid: true,
        discountCents: Math.round((subtotalCents * ADMIN_COUPON_PERCENT) / 100),
        code,
        label: `${code} −${ADMIN_COUPON_PERCENT}% (admin)`,
        kind: "percent",
        percent: ADMIN_COUPON_PERCENT,
        amountCents: null,
      };
    }
    if (code === FIRST_PURCHASE_COUPON) {
      const { count } = await supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("coupon_code", FIRST_PURCHASE_COUPON)
        .neq("status", "cancelled");
      if ((count ?? 0) > 0) return { valid: false, error: "Cupom PRIMEIRACOMPRA10 já foi utilizado nesta conta" };
      const raw = Math.round((subtotalCents * FIRST_PURCHASE_PERCENT) / 100);
      return {
        valid: true,
        discountCents: Math.min(raw, FIRST_PURCHASE_MAX_DISCOUNT_CENTS),
        code,
        label: `${code} −${FIRST_PURCHASE_PERCENT}% (1ª compra, até R$ ${FIRST_PURCHASE_MAX_DISCOUNT_CENTS / 100})`,
        kind: "percent",
        percent: FIRST_PURCHASE_PERCENT,
        amountCents: null,
      };
    }

    const { data: coupon } = await supabaseAdmin
      .from("coupons")
      .select("id, code, user_id, percent, amount_cents, balance_cents, max_discount_cents, max_uses, max_uses_per_user, used_count, expires_at, active")
      .eq("code", code)
      .maybeSingle();
    if (!coupon || !coupon.active) return { valid: false, error: "Cupom inválido" };
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date())
      return { valid: false, error: "Cupom expirado" };
    if (coupon.user_id && coupon.user_id !== userId)
      return { valid: false, error: "Este cupom não está disponível para sua conta" };

    const isWallet =
      !!coupon.user_id &&
      coupon.amount_cents != null &&
      coupon.amount_cents > 0 &&
      coupon.balance_cents != null;

    if (isWallet) {
      const balance = coupon.balance_cents ?? 0;
      if (balance <= 0) return { valid: false, error: "Saldo do vale-presente esgotado" };
      const discountCents = Math.min(balance, subtotalCents);
      return {
        valid: true,
        discountCents,
        code: coupon.code,
        label: `${coupon.code} − vale-presente (saldo R$ ${(balance / 100).toFixed(2).replace(".", ",")})`,
        kind: "amount",
        percent: null,
        amountCents: balance,
      };
    }

    if (coupon.used_count >= coupon.max_uses)
      return { valid: false, error: "Cupom já foi utilizado" };
    if (await userReachedCouponLimit(userId, coupon))
      return { valid: false, error: "Você já utilizou este cupom" };

    if (coupon.amount_cents && coupon.amount_cents > 0) {
      const discountCents = Math.min(coupon.amount_cents, subtotalCents);
      return {
        valid: true,
        discountCents,
        code: coupon.code,
        label: `${coupon.code} − vale-presente de R$ ${(coupon.amount_cents / 100).toFixed(2).replace(".", ",")}`,
        kind: "amount",
        percent: null,
        amountCents: coupon.amount_cents,
      };
    }
    const percent = coupon.percent ?? 0;
    const raw = Math.round((subtotalCents * percent) / 100);
    const discountCents =
      coupon.max_discount_cents && coupon.max_discount_cents > 0
        ? Math.min(raw, coupon.max_discount_cents)
        : raw;
    return {
      valid: true,
      discountCents,
      code: coupon.code,
      label: `${coupon.code} −${percent}%`,
      kind: "percent",
      percent,
      amountCents: null,
    };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : "Cupom inválido" };
  }
}


type ResolvableItem = {
  cardId: string;
  name: string;
  image?: string | null;
  collection?: string | null;
  number?: string | null;
  finish: string;
  language: string;
  condition?: string | null;
  unitPrice: number;
  quantity: number;
};

function normalizeText(value: string) {
  return value.normalize("NFC").trim();
}

function normalizeOptionalText(value: string | null | undefined) {
  if (value == null) return value;
  const clean = normalizeText(value);
  return clean || null;
}

function finishKey(value: string) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizeCheckoutItem<T extends ResolvableItem>(it: T): T {
  return {
    ...it,
    name: normalizeText(it.name),
    collection: normalizeOptionalText(it.collection),
    number: normalizeOptionalText(it.number),
    finish: finishKey(it.finish) === "ima" ? "Ímã" : normalizeText(it.finish),
    language: normalizeText(it.language),
    condition: normalizeOptionalText(it.condition),
  };
}

function isVirtualItem(it: { finish: string }) {
  return finishKey(it.finish) === "ima";
}

function isPanelItem(it: { cardId?: string }) {
  return typeof it.cardId === "string" && it.cardId.startsWith("panel:");
}

function isSealedItem(it: { cardId?: string }) {
  return typeof it.cardId === "string" && it.cardId.startsWith("sealed:");
}

function isAccessoryItem(it: { cardId?: string }) {
  return typeof it.cardId === "string" && it.cardId.startsWith("accessory:");
}

function isVideogameItem(it: { cardId?: string }) {
  return typeof it.cardId === "string" && it.cardId.startsWith("videogame:");
}

async function resolveCardIds<T extends ResolvableItem>(items: T[]): Promise<T[]> {
  const resolved: T[] = [];
  for (const raw of items) {
    const it = normalizeCheckoutItem(raw);
    if (isPanelItem(it)) {
      const panelId = it.cardId.slice("panel:".length);
      const { data: panel, error: pErr } = await supabaseAdmin
        .from("panels")
        .select("price_cents, active")
        .eq("id", panelId)
        .maybeSingle();
      if (pErr) throw new Error(pErr.message);
      if (!panel || panel.active === false) {
        throw new Error(`Painel não encontrado ou indisponível: "${it.name}".`);
      }
      const cents = Number(panel.price_cents ?? 0);
      if (cents <= 0) {
        throw new Error(`Preço indisponível para o painel "${it.name}".`);
      }
      resolved.push({ ...it, unitPrice: cents / 100 });
      continue;
    }
    if (isSealedItem(it)) {
      const sealedId = it.cardId.slice("sealed:".length);
      const { data: sealed, error: sErr } = await supabaseAdmin
        .from("sealed_products")
        .select("price_cents, active")
        .eq("id", sealedId)
        .maybeSingle();
      if (sErr) throw new Error(sErr.message);
      if (!sealed || sealed.active === false) {
        throw new Error(`Produto lacrado não encontrado ou indisponível: "${it.name}".`);
      }
      const cents = Number(sealed.price_cents ?? 0);
      if (cents <= 0) {
        throw new Error(`Preço indisponível para o produto lacrado "${it.name}".`);
      }
      resolved.push({ ...it, unitPrice: cents / 100 });
      continue;
    }
    if (isAccessoryItem(it)) {
      const { accessoryId, variantId } = parseAccessoryCartId(it.cardId);
      const { data: accessory, error: aErr } = await supabaseAdmin
        .from("accessories")
        .select("price_cents, active, variants")
        .eq("id", accessoryId)
        .maybeSingle();
      if (aErr) throw new Error(aErr.message);
      if (!accessory || accessory.active === false) {
        throw new Error(`Acessório não encontrado ou indisponível: "${it.name}".`);
      }
      let cents = Number(accessory.price_cents ?? 0);
      if (variantId) {
        const variant = parseVariants((accessory as { variants?: unknown }).variants).find(
          (v) => v.id === variantId,
        );
        if (!variant) {
          throw new Error(`Variação indisponível para o acessório "${it.name}".`);
        }
        cents = Number(variant.price_cents ?? accessory.price_cents ?? 0);
      }
      if (cents <= 0) {
        throw new Error(`Preço indisponível para o acessório "${it.name}".`);
      }
      resolved.push({ ...it, unitPrice: cents / 100 });
      continue;
    }
    if (isVideogameItem(it)) {
      const videogameId = it.cardId.slice("videogame:".length);
      const { data: videogame, error: vErr } = await supabaseAdmin
        .from("videogames")
        .select("price_cents, active")
        .eq("id", videogameId)
        .maybeSingle();
      if (vErr) throw new Error(vErr.message);
      if (!videogame || videogame.active === false) {
        throw new Error(`Videogame não encontrado ou indisponível: "${it.name}".`);
      }
      const cents = Number(videogame.price_cents ?? 0);
      if (cents <= 0) {
        throw new Error(`Preço indisponível para o videogame "${it.name}".`);
      }
      resolved.push({ ...it, unitPrice: cents / 100 });
      continue;
    }
    let query = supabaseAdmin
      .from("cards")
      .select("id, base_price_cents")
      .eq("name", it.name)
      .eq("finish", it.finish as never)
      .eq("language", it.language as never)
      .limit(1);
    if (it.collection) query = query.eq("collection", it.collection);
    if (it.number) query = query.eq("card_number", it.number);
    if (it.condition) query = query.eq("condition", it.condition as never);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      throw new Error(
        `Carta não encontrada no estoque: "${it.name}" (${it.finish}/${it.language}${it.condition ? "/" + it.condition : ""}).`,
      );
    }
    // Server-authoritative price: prefer cards.base_price_cents, fall back to
    // card_prices (the scraped Liga Pokémon price). Never trust client input.
    let priceCents: number | null =
      data.base_price_cents != null ? Number(data.base_price_cents) : null;
    if (priceCents == null) {
      const { data: scraped } = await supabaseAdmin
        .from("card_prices")
        .select("price_cents")
        .eq("card_name", it.name)
        .eq("collection", it.collection ?? "")
        .eq("card_number", it.number ?? "")
        .eq("finish", it.finish)
        .eq("language", it.language)
        .maybeSingle();
      if (scraped?.price_cents != null) priceCents = Number(scraped.price_cents);
    }
    if (priceCents == null || priceCents <= 0) {
      throw new Error(
        `Preço indisponível para "${it.name}". Tente novamente em instantes.`,
      );
    }
    resolved.push({ ...it, cardId: data.id, unitPrice: priceCents / 100 });
  }
  return resolved;
}

// Preenche o subtipo Liga (Normal / Foil / Double Rare) nos itens do pedido,
// buscando direto na carta — assim o pedido identifica a variante exata.
async function withLigaSubcategory<T extends { card_id: string; liga_subcategory?: string | null }>(
  rows: T[],
): Promise<T[]> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = [...new Set(rows.map((r) => r.card_id).filter((id) => uuid.test(id)))];
  if (ids.length === 0) return rows;
  const { data } = await supabaseAdmin
    .from("cards")
    .select("id, liga_subcategory")
    .in("id", ids);
  const map = new Map((data ?? []).map((c: any) => [c.id, c.liga_subcategory ?? null]));
  return rows.map((r) => ({ ...r, liga_subcategory: map.get(r.card_id) ?? null }));
}



async function getActiveReservationsByCard(
  cardIds: string[],
  excludeOrderId?: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (cardIds.length === 0) return map;
  const nowIso = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from("stock_reservations")
    .select("card_id, quantity, order_id")
    .in("card_id", cardIds)
    .gt("expires_at", nowIso);
  for (const r of data ?? []) {
    if (excludeOrderId && r.order_id === excludeOrderId) continue;
    map.set(r.card_id, (map.get(r.card_id) ?? 0) + (r.quantity ?? 0));
  }
  return map;
}

async function ensureAvailableStock(
  items: { cardId: string; quantity: number; name: string; finish: string }[],
  opts?: { excludeOrderId?: string },
) {
  const realCardIds = items
    .filter(
      (it) =>
        !isVirtualItem(it) &&
        !isPanelItem(it) &&
        !isSealedItem(it) &&
        !isAccessoryItem(it) &&
        !isVideogameItem(it),
    )
    .map((it) => it.cardId);
  const reservations = await getActiveReservationsByCard(realCardIds, opts?.excludeOrderId);

  for (const it of items) {
    if (isPanelItem(it)) {
      const panelId = it.cardId.slice("panel:".length);
      const { data } = await supabaseAdmin
        .from("panels")
        .select("stock")
        .eq("id", panelId)
        .maybeSingle();
      const available = Number(data?.stock ?? 0);
      if (available < it.quantity) {
        throw new Error(
          `Estoque insuficiente para "${it.name}". Disponível: ${available}, solicitado: ${it.quantity}.`,
        );
      }
      continue;
    }
    if (isSealedItem(it)) {
      const sealedId = it.cardId.slice("sealed:".length);
      const { data } = await supabaseAdmin
        .from("sealed_products")
        .select("stock")
        .eq("id", sealedId)
        .maybeSingle();
      const available = Number(data?.stock ?? 0);
      if (available < it.quantity) {
        throw new Error(
          `Estoque insuficiente para "${it.name}". Disponível: ${available}, solicitado: ${it.quantity}.`,
        );
      }
      continue;
    }
    if (isAccessoryItem(it)) {
      const { accessoryId, variantId } = parseAccessoryCartId(it.cardId);
      const { data } = await supabaseAdmin
        .from("accessories")
        .select("stock, variants")
        .eq("id", accessoryId)
        .maybeSingle();
      const variant = variantId
        ? parseVariants((data as { variants?: unknown } | null)?.variants).find((v) => v.id === variantId)
        : null;
      const available = variantId ? Number(variant?.stock ?? 0) : Number(data?.stock ?? 0);
      if (available < it.quantity) {
        throw new Error(
          `Estoque insuficiente para "${it.name}". Disponível: ${available}, solicitado: ${it.quantity}.`,
        );
      }
      continue;
    }
    if (isVideogameItem(it)) {
      const videogameId = it.cardId.slice("videogame:".length);
      const { data } = await supabaseAdmin
        .from("videogames")
        .select("stock")
        .eq("id", videogameId)
        .maybeSingle();
      const available = Number(data?.stock ?? 0);
      if (available < it.quantity) {
        throw new Error(
          `Estoque insuficiente para "${it.name}". Disponível: ${available}, solicitado: ${it.quantity}.`,
        );
      }
      continue;
    }
    if (isVirtualItem(it)) continue;
    const { data, error } = await supabaseAdmin
      .from("cards")
      .select("stock, event_reserved")
      .eq("id", it.cardId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // Unidades levadas a eventos presenciais não podem ser vendidas no site
    const atEvent = Number((data as { event_reserved?: number } | null)?.event_reserved ?? 0);
    const rawStock = Math.max(0, Number(data?.stock ?? 0) - atEvent);
    const reserved = reservations.get(it.cardId) ?? 0;
    const available = Math.max(0, rawStock - reserved);
    if (available < it.quantity) {
      throw new Error(
        `Estoque insuficiente para "${it.name}". Disponível: ${available}, solicitado: ${it.quantity}.`,
      );
    }
  }
}

/**
 * Reserva estoque para um pedido pendente. Impede que outro cliente compre
 * a mesma unidade enquanto este pedido aguarda confirmação de pagamento.
 * Reservas são ignoradas quando expiram e removidas ao pagar (markOrderPaid)
 * ou cancelar (cancelOrder / order-cancellation).
 */
async function reserveStockForOrder(
  orderId: string,
  userId: string,
  items: { cardId: string; quantity: number; finish: string }[],
  expiresAt: Date,
) {
  const rows = items
    .filter(
      (i) =>
        !isVirtualItem(i) &&
        !isPanelItem(i) &&
        !isSealedItem(i) &&
        !isAccessoryItem(i) &&
        !isVideogameItem(i),
    )
    .map((i) => ({
      user_id: userId,
      order_id: orderId,
      card_id: i.cardId,
      quantity: i.quantity,
      expires_at: expiresAt.toISOString(),
    }));
  if (rows.length === 0) return;
  const { error } = await supabaseAdmin.from("stock_reservations").insert(rows);
  if (error) console.error("[reserveStockForOrder] insert falhou:", error);
}


export async function createOrderCheckoutServer(data: StripeInput, userId: string) {
  await assertSalesOpen();
  await cancelOtherPendingOrdersForUser(userId);

  const env = data.environment as StripeEnv;
  const stripe = createStripeClient(env);

  // Resolve cards and override unitPrice with the server-side authoritative price.
  const items = await resolveCardIds(data.items);
  await ensureAvailableStock(items);

  const subtotalCents = items.reduce(
    (s, i) => s + Math.round(i.unitPrice * 100) * i.quantity,
    0,
  );
  const baseShippingCents = computeShippingCents(data);
  const arte = data.shippingMethod === "arte_em_cards"
    ? await resolveArteEmCardsFee(userId, data.arteEmCardsCode)
    : { feeCents: 0, codeUsed: null as string | null };
  const shippingCents = baseShippingCents + arte.feeCents;

  const bundle = computeBundleDiscount(items);
  const bundleDiscountCents = bundle.bundleDiscountCents;
  const nonBundleSubtotalCents = Math.max(0, subtotalCents - bundle.bundleSubtotalCents);

  const { discountCents: couponDiscountCents, code: appliedCoupon, walletDeductionCents } = await validateCoupon(
    userId,
    data.couponCode,
    nonBundleSubtotalCents,
  );
  // Resgate de pontos limitado ao valor das cartas avulsas (lacrados,
  // acessórios, videogames e painéis não podem ser pagos com pontos).
  const singlesCents = (await import("@/lib/loyalty")).singlesSubtotalCents(items);
  const pointsBase = Math.min(singlesCents, Math.max(0, subtotalCents - bundleDiscountCents - couponDiscountCents));
  const { points: pointsRedeemed, discountCents: pointsDiscountCents } =
    await resolvePointsRedemption(userId, data.pointsToRedeem, pointsBase);
  const discountCents = bundleDiscountCents + couponDiscountCents + pointsDiscountCents;

  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);


  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = userData?.user?.email ?? "";

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .insert({
      user_id: userId,
      status: "pending",
      payment_method: "stripe",
      shipping_method: data.shippingMethod,
      shipping_cost_cents: shippingCents,
      subtotal_cents: subtotalCents,
      discount_cents: discountCents,
      bundle_discount_cents: bundleDiscountCents,
      coupon_discount_cents: couponDiscountCents,
      pix_discount_cents: 0,
      coupon_code: appliedCoupon,
      total_cents: totalCents,
      recipient_name: data.address.recipientName,
      cpf: data.address.cpf,
      phone: data.address.phone,
      email,
      cep: data.address.cep,
      street: data.address.street,
      number: data.address.number,
      complement: data.address.complement,
      neighborhood: data.address.neighborhood,
      city: data.address.city,
      state: data.address.state,
      notes: data.notes,
      arte_em_cards_code: arte.codeUsed,
      wallet_deduction_cents: walletDeductionCents,
      points_redeemed: pointsRedeemed,
      points_discount_cents: pointsDiscountCents,
      superfrete_service_id: data.shippingMethod === "fixed" ? data.shippingQuote?.serviceId ?? null : null,
      superfrete_service_name: data.shippingMethod === "fixed" ? data.shippingQuote?.serviceName ?? null : null,
    })

    .select("id")
    .single();
  if (orderErr || !order) throw new Error(orderErr?.message ?? "Falha ao criar pedido");

  const orderItems = items.map((i) => ({
    order_id: order.id,
    card_id: i.cardId,
    card_name: i.name,
    card_image: i.image ?? null,
    collection: i.collection ?? null,
    card_number: i.number ?? null,
    finish: i.finish,
    language: i.language,
    condition: i.condition ?? null,
    quantity: i.quantity,
    unit_price_cents: Math.round(i.unitPrice * 100),
  }));
  const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(await withLigaSubcategory(orderItems));
  if (itemsErr) throw new Error(itemsErr.message);
  await reserveStockForOrder(order.id, userId, items, new Date(Date.now() + 60 * 60 * 1000));
  await sendOrderReceivedEmail(order.id);

  // Vale-presente cobre o pedido inteiro: marca pago direto, sem gateway.
  if (totalCents === 0) {
    await markOrderPaid(order.id);
    return { clientSecret: null, orderId: order.id, status: "paid" as const };
  }



  const discountMultiplier =
    discountCents > 0 ? (subtotalCents - discountCents) / subtotalCents : 1;
  const lineItems = items.map((i) => {
    const original = Math.round(i.unitPrice * 100);
    const discounted = Math.round(original * discountMultiplier);
    return {
      price_data: {
        currency: "brl",
        product_data: {
          name: `${i.name} (${i.finish}, ${i.language}${i.condition ? `, ${i.condition}` : ""})${appliedCoupon ? ` — cupom ${appliedCoupon}` : ""}`,
          ...(i.image && i.image.startsWith("http") ? { images: [i.image] } : {}),
        },
        unit_amount: discounted,
      },
      quantity: i.quantity,
    };
  });
  if (shippingCents > 0) {
    lineItems.push({
      price_data: {
        currency: "brl",
        product_data: { name: "Frete (Mini Envios)" },
        unit_amount: shippingCents,
      },
      quantity: 1,
    });
  }

  let returnUrl = data.returnUrl;
  try {
    const u = new URL(data.returnUrl);
    returnUrl = `${u.origin}/orders/${order.id}?session_id={CHECKOUT_SESSION_ID}`;
  } catch {
    returnUrl = data.returnUrl;
  }

  const session = await stripe.checkout.sessions.create({
    line_items: lineItems,
    mode: "payment",
    ui_mode: "embedded_page",
    redirect_on_completion: "always",
    return_url: returnUrl,
    customer_email: email,
    metadata: { orderId: order.id, userId },
    payment_intent_data: { metadata: { orderId: order.id, userId } },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });

  await supabaseAdmin.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);

  return { clientSecret: session.client_secret, orderId: order.id };
}

export async function createPixOrderServer(data: PixInput, userId: string) {
  await assertSalesOpen();
  await cancelOtherPendingOrdersForUser(userId);

  const items = await resolveCardIds(data.items);
  await ensureAvailableStock(items);

  const subtotalCents = items.reduce(
    (s, i) => s + Math.round(i.unitPrice * 100) * i.quantity,
    0,
  );
  const baseShippingCents = computeShippingCents(data);
  const arte = data.shippingMethod === "arte_em_cards"
    ? await resolveArteEmCardsFee(userId, data.arteEmCardsCode)
    : { feeCents: 0, codeUsed: null as string | null };
  const shippingCents = baseShippingCents + arte.feeCents;

  const bundle = computeBundleDiscount(items);
  const bundleDiscountCents = bundle.bundleDiscountCents;
  const nonBundleSubtotalCents = Math.max(0, subtotalCents - bundle.bundleSubtotalCents);

  const { discountCents: couponDiscountCents, code: appliedCoupon, walletDeductionCents } = await validateCoupon(
    userId,
    data.couponCode,
    nonBundleSubtotalCents,
  );

  // Resgate de pontos limitado ao valor das cartas avulsas (lacrados,
  // acessórios, videogames e painéis não podem ser pagos com pontos).
  const singlesCents = (await import("@/lib/loyalty")).singlesSubtotalCents(items);
  const pointsBase = Math.min(singlesCents, Math.max(0, subtotalCents - bundleDiscountCents - couponDiscountCents));
  const { points: pointsRedeemed, discountCents: pointsDiscountCents } =
    await resolvePointsRedemption(userId, data.pointsToRedeem, pointsBase);

  // Pix 5% incide apenas sobre o que sobra fora do combo (após cupom e pontos)
  const pixBase = Math.max(0, nonBundleSubtotalCents - couponDiscountCents - pointsDiscountCents);
  const pixDiscountCents = Math.round((pixBase * PIX_DISCOUNT_PERCENT) / 100);
  const discountCents = bundleDiscountCents + couponDiscountCents + pointsDiscountCents + pixDiscountCents;

  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);


  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = userData?.user?.email ?? "";

  const pixExpires = new Date(Date.now() + PIX_EXPIRES_MINUTES * 60 * 1000);

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .insert({
      user_id: userId,
      status: "pending",
      payment_method: "pix",
      shipping_method: data.shippingMethod,
      shipping_cost_cents: shippingCents,
      subtotal_cents: subtotalCents,
      discount_cents: discountCents,
      bundle_discount_cents: bundleDiscountCents,
      coupon_discount_cents: couponDiscountCents,
      pix_discount_cents: pixDiscountCents,
      coupon_code: appliedCoupon,
      total_cents: totalCents,
      recipient_name: data.address.recipientName,
      cpf: data.address.cpf,
      phone: data.address.phone,
      email,
      cep: data.address.cep,
      street: data.address.street,
      number: data.address.number,
      complement: data.address.complement,
      neighborhood: data.address.neighborhood,
      city: data.address.city,
      state: data.address.state,
      notes: data.notes,
      arte_em_cards_code: arte.codeUsed,
      wallet_deduction_cents: walletDeductionCents,
      points_redeemed: pointsRedeemed,
      points_discount_cents: pointsDiscountCents,
      pix_expires_at: pixExpires.toISOString(),
      superfrete_service_id: data.shippingMethod === "fixed" ? data.shippingQuote?.serviceId ?? null : null,


      superfrete_service_name: data.shippingMethod === "fixed" ? data.shippingQuote?.serviceName ?? null : null,
    })
    .select("id")
    .single();
  if (orderErr || !order) throw new Error(orderErr?.message ?? "Falha ao criar pedido");

  const orderItems = items.map((i) => ({
    order_id: order.id,
    card_id: i.cardId,
    card_name: i.name,
    card_image: i.image ?? null,
    collection: i.collection ?? null,
    card_number: i.number ?? null,
    finish: i.finish,
    language: i.language,
    condition: i.condition ?? null,
    quantity: i.quantity,
    unit_price_cents: Math.round(i.unitPrice * 100),
  }));
  const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(await withLigaSubcategory(orderItems));
  if (itemsErr) throw new Error(itemsErr.message);
  await reserveStockForOrder(order.id, userId, items, new Date(Date.now() + 60 * 60 * 1000));


  // Vale-presente cobre o pedido inteiro: marca pago direto, sem Pix.
  if (totalCents === 0) {
    await sendOrderReceivedEmail(order.id);
    await markOrderPaid(order.id);
    return {
      orderId: order.id,
      qrCode: "",
      qrCodeBase64: "",
      expiresAt: new Date().toISOString(),
      totalCents: 0,
      status: "paid" as const,
    };
  }

  const baseUrl = process.env.PUBLIC_SITE_URL ?? "https://seviicolecionaveis.com.br";
  const notificationUrl = `${baseUrl}/api/public/payments/mercadopago-webhook`;

  const [firstName, ...rest] = data.address.recipientName.trim().split(/\s+/);
  const lastName = rest.join(" ") || "Sevii";

  const pix = await createPixPayment({
    amountCents: totalCents,
    description: `Pedido Sevii Colecionáveis #${order.id.slice(0, 8)}`,
    payerEmail: email,
    payerFirstName: firstName,
    payerLastName: lastName,
    payerCpf: data.address.cpf,
    externalReference: order.id,
    notificationUrl,
    expiresInMinutes: PIX_EXPIRES_MINUTES,
  });

  await supabaseAdmin
    .from("orders")
    .update({
      mercadopago_payment_id: String(pix.id),
      pix_qr_code: pix.qr_code,
      pix_qr_code_base64: pix.qr_code_base64,
      pix_expires_at: pix.date_of_expiration,
    })
    .eq("id", order.id);

  // E-mail só depois do Pix pronto: falha/lentidão no e-mail nunca bloqueia o pagamento.
  await sendOrderReceivedEmail(order.id);


  return {
    orderId: order.id,
    qrCode: pix.qr_code,
    qrCodeBase64: pix.qr_code_base64,
    expiresAt: pix.date_of_expiration,
    totalCents,
  };
}

export async function checkPixOrderStatusServer(orderId: string, userId: string) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, status, payment_method, mercadopago_payment_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order || order.user_id !== userId) throw new Error("Pedido não encontrado");

  if (order.status === "paid" || order.status === "preparing" || order.status === "delivered") {
    return { status: "paid" as const };
  }

  if (order.payment_method === "pix") {
    // 1) Consulta direta pelo payment_id (quando temos)
    if (order.mercadopago_payment_id) {
      try {
        const remote = await getPixPayment(order.mercadopago_payment_id);
        if (remote.status === "approved") {
          await markOrderPaid(order.id, { mercadopagoPaymentId: order.mercadopago_payment_id });
          return { status: "paid" as const };
        }
      } catch (e) {
        console.error("checkPixOrderStatus poll error", e);
      }
    }
    // 2) Fallback: busca por external_reference (caso o webhook tenha falhado
    //    e o cliente tenha pago via Pix copiado para outra conta/QR salvo)
    try {
      const { findPaymentByExternalReference } = await import("@/lib/mercadopago.server");
      const found = await findPaymentByExternalReference(order.id);
      if (found?.status === "approved") {
        await markOrderPaid(order.id, { mercadopagoPaymentId: String(found.id) });
        return { status: "paid" as const };
      }
    } catch (e) {
      console.error("checkPixOrderStatus externalRef lookup failed", e);
    }
  }

  return { status: order.status as "pending" | "cancelled" | "paid" };
}

export async function createCardOrderServer(data: CardInput, userId: string) {
  await assertSalesOpen();
  await cancelOtherPendingOrdersForUser(userId);

  const items = await resolveCardIds(data.items);
  await ensureAvailableStock(items);

  const subtotalCents = items.reduce(
    (s, i) => s + Math.round(i.unitPrice * 100) * i.quantity,
    0,
  );
  const baseShippingCents = computeShippingCents(data);
  const arte = data.shippingMethod === "arte_em_cards"
    ? await resolveArteEmCardsFee(userId, data.arteEmCardsCode)
    : { feeCents: 0, codeUsed: null as string | null };
  const shippingCents = baseShippingCents + arte.feeCents;

  const bundle = computeBundleDiscount(items);
  const bundleDiscountCents = bundle.bundleDiscountCents;
  const nonBundleSubtotalCents = Math.max(0, subtotalCents - bundle.bundleSubtotalCents);

  const { discountCents: couponDiscountCents, code: appliedCoupon, walletDeductionCents } = await validateCoupon(
    userId,
    data.couponCode,
    nonBundleSubtotalCents,
  );
  // Resgate de pontos limitado ao valor das cartas avulsas (lacrados,
  // acessórios, videogames e painéis não podem ser pagos com pontos).
  const singlesCents = (await import("@/lib/loyalty")).singlesSubtotalCents(items);
  const pointsBase = Math.min(singlesCents, Math.max(0, subtotalCents - bundleDiscountCents - couponDiscountCents));
  const { points: pointsRedeemed, discountCents: pointsDiscountCents } =
    await resolvePointsRedemption(userId, data.pointsToRedeem, pointsBase);
  const discountCents = bundleDiscountCents + couponDiscountCents + pointsDiscountCents;

  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);


  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = userData?.user?.email ?? data.card.payerEmail ?? "";

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .insert({
      user_id: userId,
      status: "pending",
      payment_method: "mercadopago_card",
      shipping_method: data.shippingMethod,
      shipping_cost_cents: shippingCents,
      subtotal_cents: subtotalCents,
      discount_cents: discountCents,
      bundle_discount_cents: bundleDiscountCents,
      coupon_discount_cents: couponDiscountCents,
      pix_discount_cents: 0,
      coupon_code: appliedCoupon,
      total_cents: totalCents,
      recipient_name: data.address.recipientName,
      cpf: data.address.cpf,
      phone: data.address.phone,
      email,
      cep: data.address.cep,
      street: data.address.street,
      number: data.address.number,
      complement: data.address.complement,
      neighborhood: data.address.neighborhood,
      city: data.address.city,
      state: data.address.state,
      notes: data.notes,
      arte_em_cards_code: arte.codeUsed,
      wallet_deduction_cents: walletDeductionCents,
      points_redeemed: pointsRedeemed,
      points_discount_cents: pointsDiscountCents,
      superfrete_service_id: data.shippingMethod === "fixed" ? data.shippingQuote?.serviceId ?? null : null,
      superfrete_service_name: data.shippingMethod === "fixed" ? data.shippingQuote?.serviceName ?? null : null,
    })

    .select("id")
    .single();
  if (orderErr || !order) throw new Error(orderErr?.message ?? "Falha ao criar pedido");

  const orderItems = items.map((i) => ({
    order_id: order.id,
    card_id: i.cardId,
    card_name: i.name,
    card_image: i.image ?? null,
    collection: i.collection ?? null,
    card_number: i.number ?? null,
    finish: i.finish,
    language: i.language,
    condition: i.condition ?? null,
    quantity: i.quantity,
    unit_price_cents: Math.round(i.unitPrice * 100),
  }));
  const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(await withLigaSubcategory(orderItems));
  if (itemsErr) throw new Error(itemsErr.message);
  await reserveStockForOrder(order.id, userId, items, new Date(Date.now() + 60 * 60 * 1000));
  await sendOrderReceivedEmail(order.id);

  // Vale-presente cobre o pedido inteiro: marca pago direto, sem cobrança no cartão.
  if (totalCents === 0) {
    await markOrderPaid(order.id);
    return { orderId: order.id, status: "approved" as const };
  }

  const baseUrl = process.env.PUBLIC_SITE_URL ?? "https://seviicolecionaveis.com.br";
  const notificationUrl = `${baseUrl}/api/public/payments/mercadopago-webhook`;

  const [firstName, ...rest] = data.address.recipientName.trim().split(/\s+/);
  const lastName = rest.join(" ") || "Sevii";

  let customerId: string | null = null;
  if (data.saveCard) {
    try {
      const { ensureMpCustomerForUser } = await import("@/lib/saved-cards.server");
      customerId = await ensureMpCustomerForUser(userId);
    } catch (e) {
      console.error("ensureMpCustomerForUser failed (continuando sem salvar)", e);
    }
  }

  try {
    const result = await createCardPaymentMP({
      amountCents: totalCents,
      description: `Pedido Sevii Colecionáveis #${order.id.slice(0, 8)}`,
      token: data.card.token,
      paymentMethodId: data.card.paymentMethodId,
      issuerId: data.card.issuerId ?? null,
      installments: data.card.installments,
      payerEmail: data.card.payerEmail || email,
      payerFirstName: firstName,
      payerLastName: lastName,
      payerCpf: data.card.payerCpf ?? data.address.cpf ?? null,
      externalReference: order.id,
      notificationUrl,
      customerId,
    });

    await supabaseAdmin
      .from("orders")
      .update({ mercadopago_payment_id: String(result.id) })
      .eq("id", order.id);

    if (customerId && (result.status === "approved" || result.status === "in_process" || result.status === "authorized")) {
      try {
        const { syncSavedCardsForUser } = await import("@/lib/saved-cards.server");
        await syncSavedCardsForUser(userId, customerId);
      } catch (e) {
        console.error("syncSavedCardsForUser failed", e);
      }
    }

    if (result.status === "approved") {
      await markOrderPaid(order.id, { mercadopagoPaymentId: String(result.id) });
      return { orderId: order.id, status: "approved" as const };
    }
    if (result.status === "in_process" || result.status === "pending" || result.status === "authorized") {
      return { orderId: order.id, status: "in_process" as const, statusDetail: result.status_detail };
    }
    // rejected / cancelled
    await cancelOrder(order.id);
    return {
      orderId: order.id,
      status: "rejected" as const,
      statusDetail: result.status_detail ?? "Pagamento recusado",
    };
  } catch (e) {
    await cancelOrder(order.id);
    throw e;
  }
}

// =========================================================================
// Resume / change payment for an existing pending order
// =========================================================================

export async function regeneratePixForExistingOrderServer(orderId: string, userId: string) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, user_id, status, total_cents, email, recipient_name, cpf",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order || order.user_id !== userId) throw new Error("Pedido não encontrado");
  if (order.status !== "pending") throw new Error("Este pedido não está mais pendente.");

  const baseUrl = process.env.PUBLIC_SITE_URL ?? "https://seviicolecionaveis.com.br";
  const notificationUrl = `${baseUrl}/api/public/payments/mercadopago-webhook`;

  const [firstName, ...rest] = (order.recipient_name ?? "Cliente").trim().split(/\s+/);
  const lastName = rest.join(" ") || "Sevii";

  const pix = await createPixPayment({
    amountCents: order.total_cents,
    description: `Pedido Sevii Colecionáveis #${order.id.slice(0, 8)}`,
    payerEmail: order.email ?? "",
    payerFirstName: firstName,
    payerLastName: lastName,
    payerCpf: order.cpf ?? null,
    externalReference: order.id,
    notificationUrl,
    expiresInMinutes: PIX_EXPIRES_MINUTES,
  });

  await supabaseAdmin
    .from("orders")
    .update({
      payment_method: "pix",
      mercadopago_payment_id: String(pix.id),
      pix_qr_code: pix.qr_code,
      pix_qr_code_base64: pix.qr_code_base64,
      pix_expires_at: pix.date_of_expiration,
    })
    .eq("id", order.id);

  return {
    orderId: order.id,
    qrCode: pix.qr_code,
    qrCodeBase64: pix.qr_code_base64,
    expiresAt: pix.date_of_expiration,
    totalCents: order.total_cents,
  };
}

export async function payExistingOrderWithCardServer(
  orderId: string,
  userId: string,
  card: {
    token: string;
    paymentMethodId: string;
    issuerId?: string | null;
    installments: number;
    payerEmail?: string | null;
    payerCpf?: string | null;
  },
  options: { saveCard?: boolean } = {},
) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, status, total_cents, email, recipient_name, cpf")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order || order.user_id !== userId) throw new Error("Pedido não encontrado");
  if (order.status !== "pending") throw new Error("Este pedido não está mais pendente.");

  const baseUrl = process.env.PUBLIC_SITE_URL ?? "https://seviicolecionaveis.com.br";
  const notificationUrl = `${baseUrl}/api/public/payments/mercadopago-webhook`;

  const [firstName, ...rest] = (order.recipient_name ?? "Cliente").trim().split(/\s+/);
  const lastName = rest.join(" ") || "Sevii";

  // Se o usuário pediu para salvar, garante o MP customer antes do pagamento
  let customerId: string | null = null;
  if (options.saveCard) {
    try {
      const { ensureMpCustomerForUser } = await import("@/lib/saved-cards.server");
      customerId = await ensureMpCustomerForUser(userId);
    } catch (e) {
      console.error("ensureMpCustomerForUser failed (continuando sem salvar)", e);
    }
  }

  const result = await createCardPaymentMP({
    amountCents: order.total_cents,
    description: `Pedido Sevii Colecionáveis #${order.id.slice(0, 8)}`,
    token: card.token,
    paymentMethodId: card.paymentMethodId,
    issuerId: card.issuerId ?? null,
    installments: card.installments,
    payerEmail: card.payerEmail || order.email || "",
    payerFirstName: firstName,
    payerLastName: lastName,
    payerCpf: card.payerCpf ?? order.cpf ?? null,
    externalReference: order.id,
    notificationUrl,
    customerId,
  });

  await supabaseAdmin
    .from("orders")
    .update({
      payment_method: "mercadopago_card",
      mercadopago_payment_id: String(result.id),
    })
    .eq("id", order.id);

  // Sincroniza cartões salvos se MP vinculou ao customer
  if (customerId && (result.status === "approved" || result.status === "in_process" || result.status === "authorized")) {
    try {
      const { syncSavedCardsForUser } = await import("@/lib/saved-cards.server");
      await syncSavedCardsForUser(userId, customerId);
    } catch (e) {
      console.error("syncSavedCardsForUser failed", e);
    }
  }

  if (result.status === "approved") {
    await markOrderPaid(order.id, { mercadopagoPaymentId: String(result.id) });
    return { orderId: order.id, status: "approved" as const };
  }
  if (
    result.status === "in_process" ||
    result.status === "pending" ||
    result.status === "authorized"
  ) {
    return {
      orderId: order.id,
      status: "in_process" as const,
      statusDetail: result.status_detail,
    };
  }
  return {
    orderId: order.id,
    status: "rejected" as const,
    statusDetail: result.status_detail ?? "Pagamento recusado",
  };
}

export async function resendPendingOrderEmailsServer() {
  const { data: orders, error } = await supabaseAdmin
    .from("orders")
    .select("id, email, recipient_name, total_cents, payment_method")
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  const stamp = Date.now();
  let sent = 0;
  for (const order of orders ?? []) {
    if (!order.email) continue;
    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("card_name, quantity, unit_price_cents, finish, language, card_image")
      .eq("order_id", order.id);
    await sendTransactionalEmailSafe({
      templateName: "order-received",
      recipientEmail: order.email,
      idempotencyKey: `order-received-${order.id}-resend-${stamp}`,
      templateData: {
        recipientName: order.recipient_name?.split(/\s+/)[0],
        orderId: order.id,
        items: items ?? [],
        totalCents: order.total_cents,
        paymentMethod: order.payment_method,
      },
    });
    sent++;
  }
  return { sent, total: orders?.length ?? 0 };
}

// =========================================================================
// Admin test order: bypass real payment for the internal "Test Admin" card.
// Goes through the full pipeline (stock check, order/items insert, emails,
// shipping label / card stack hooks) but is marked paid immediately.
// =========================================================================

export async function createAdminTestOrderServer(data: AdminTestInput, userId: string) {
  // 1) Confirma admin
  const { data: roleRow, error: roleErr } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleErr) throw new Error(roleErr.message);
  if (!roleRow) throw new Error("Apenas administradores podem usar este método.");

  await cancelOtherPendingOrdersForUser(userId);

  const items = await resolveCardIds(data.items);

  // 2) Confirma que o carrinho contém SOMENTE o cartão de teste admin
  // (validado após resolução porque o cliente envia id sintético do catálogo).
  const onlyTestCard = items.every((i) => i.cardId === TEST_ADMIN_CARD_ID);
  if (!onlyTestCard) {
    throw new Error("Aprovação Admin só pode ser usada com o cartão de teste.");
  }

  await ensureAvailableStock(items);

  const subtotalCents = items.reduce(
    (s, i) => s + Math.round(i.unitPrice * 100) * i.quantity,
    0,
  );
  const baseShippingCents = computeShippingCents(data);
  const arte = data.shippingMethod === "arte_em_cards"
    ? await resolveArteEmCardsFee(userId, data.arteEmCardsCode)
    : { feeCents: 0, codeUsed: null as string | null };
  const shippingCents = baseShippingCents + arte.feeCents;

  const totalCents = subtotalCents + shippingCents;

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = userData?.user?.email ?? "";

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .insert({
      user_id: userId,
      status: "pending",
      payment_method: "admin_test",
      shipping_method: data.shippingMethod,
      shipping_cost_cents: shippingCents,
      subtotal_cents: subtotalCents,
      discount_cents: 0,
      coupon_code: null,
      total_cents: totalCents,
      recipient_name: data.address.recipientName,
      cpf: data.address.cpf,
      phone: data.address.phone,
      email,
      cep: data.address.cep,
      street: data.address.street,
      number: data.address.number,
      complement: data.address.complement,
      neighborhood: data.address.neighborhood,
      city: data.address.city,
      state: data.address.state,
      notes: [data.notes, "[Pedido de teste admin — aprovado sem cobrança]"]
        .filter(Boolean)
        .join("\n\n"),
      arte_em_cards_code: arte.codeUsed,
      superfrete_service_id: data.shippingMethod === "fixed" ? data.shippingQuote?.serviceId ?? null : null,
      superfrete_service_name: data.shippingMethod === "fixed" ? data.shippingQuote?.serviceName ?? null : null,
    })
    .select("id")
    .single();
  if (orderErr || !order) throw new Error(orderErr?.message ?? "Falha ao criar pedido");

  const orderItems = items.map((i) => ({
    order_id: order.id,
    card_id: i.cardId,
    card_name: i.name,
    card_image: i.image ?? null,
    collection: i.collection ?? null,
    card_number: i.number ?? null,
    finish: i.finish,
    language: i.language,
    condition: i.condition ?? null,
    quantity: i.quantity,
    unit_price_cents: Math.round(i.unitPrice * 100),
  }));
  const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(await withLigaSubcategory(orderItems));
  if (itemsErr) throw new Error(itemsErr.message);
  await reserveStockForOrder(order.id, userId, items, new Date(Date.now() + 60 * 60 * 1000));

  await sendOrderReceivedEmail(order.id);

  // Aprovação imediata — percorre todo o pipeline pós-pagamento.
  await markOrderPaid(order.id);

  return { orderId: order.id, status: "approved" as const };
}
