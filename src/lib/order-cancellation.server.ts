import { supabaseAdmin } from "@/integrations/supabase/client.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function isAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

export async function restoreStockIfPaid(orderId: string, statusBefore: string) {
  // Restaura estoque para qualquer pedido cujo estoque foi decrementado (flag na tabela).
  // Se a flag ainda não estiver setada (pedidos antigos), o parâmetro `statusBefore`
  // serve de fallback: qualquer status pós-pagamento indica que o estoque foi baixado.
  const { data: orderRow } = await supabaseAdmin
    .from("orders")
    .select("stock_decremented")
    .eq("id", orderId)
    .maybeSingle();
  const wasDecremented =
    (orderRow as any)?.stock_decremented === true ||
    ["paid", "preparing", "shipped", "awaiting_pickup", "delivered"].includes(statusBefore);
  if (!wasDecremented) return;

  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("card_id, quantity, cancelled_quantity, card_name, collection, card_number, finish")
    .eq("order_id", orderId);
  if (!items) return;
  const UUID_RE_LOCAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const it of items as any[]) {
    // Só devolve a quantidade que ainda não foi cancelada individualmente.
    const remaining = Math.max(0, (it.quantity ?? 0) - (it.cancelled_quantity ?? 0));
    if (remaining <= 0) continue;
    const cardId: string | null = it.card_id ?? null;

    if (typeof cardId === "string" && cardId.startsWith("panel:")) {
      const pid = cardId.slice("panel:".length);
      if (UUID_RE_LOCAL.test(pid)) {
        const { data: p } = await supabaseAdmin.from("panels").select("stock").eq("id", pid).maybeSingle();
        if (p) await supabaseAdmin.from("panels").update({ stock: (p.stock ?? 0) + remaining }).eq("id", pid);
      }
      continue;
    }
    if (typeof cardId === "string" && cardId.startsWith("sealed:")) {
      const sid = cardId.slice("sealed:".length);
      if (UUID_RE_LOCAL.test(sid)) {
        const { data: s } = await supabaseAdmin.from("sealed_products").select("stock").eq("id", sid).maybeSingle();
        if (s) await supabaseAdmin.from("sealed_products").update({ stock: (s.stock ?? 0) + remaining }).eq("id", sid);
      }
      continue;
    }
    if (typeof cardId === "string" && cardId.startsWith("accessory:")) {
      const aid = cardId.slice("accessory:".length);
      if (UUID_RE_LOCAL.test(aid)) {
        const { data: a } = await supabaseAdmin.from("accessories").select("stock").eq("id", aid).maybeSingle();
        if (a) await supabaseAdmin.from("accessories").update({ stock: (a.stock ?? 0) + remaining }).eq("id", aid);
      }
      continue;
    }
    if (typeof cardId === "string" && cardId.startsWith("videogame:")) {
      const vid = cardId.slice("videogame:".length);
      if (UUID_RE_LOCAL.test(vid)) {
        const { data: v } = await supabaseAdmin.from("videogames").select("stock").eq("id", vid).maybeSingle();
        if (v) await supabaseAdmin.from("videogames").update({ stock: (v.stock ?? 0) + remaining }).eq("id", vid);
      }
      continue;
    }
    if (!cardId || !UUID_RE_LOCAL.test(cardId)) continue;
    const { data: card } = await supabaseAdmin
      .from("cards")
      .select("stock")
      .eq("id", cardId)
      .maybeSingle();
    if (card) {
      await supabaseAdmin
        .from("cards")
        .update({ stock: (card.stock ?? 0) + remaining })
        .eq("id", cardId);
    }
  }

  // Marca como não-decrementado para evitar restauração dupla se a função for chamada novamente.
  await supabaseAdmin
    .from("orders")
    .update({ stock_decremented: false })
    .eq("id", orderId);
}

export async function getOrderById(orderId: string, fields: string) {
  const { data } = await supabaseAdmin
    .from("orders")
    .select(fields)
    .eq("id", orderId)
    .maybeSingle();
  return data as any;
}

export async function updateOrder(orderId: string, patch: Record<string, any>) {
  await supabaseAdmin
    .from("orders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", orderId);
}

export async function deleteStockReservations(orderId: string) {
  await supabaseAdmin.from("stock_reservations").delete().eq("order_id", orderId);
}

export type RefundMethod = "mercadopago" | "coupon" | "manual" | "none";

/**
 * Reembolsa o valor ainda não estornado de um pedido inteiro e marca todos os
 * itens restantes como cancelados. Idempotente o suficiente: só estorna a
 * diferença entre total_cents e refunded_cents.
 */
export async function refundEntireOrder(orderId: string, method: RefundMethod) {
  if (method === "none") return { refundCents: 0, couponCode: null as string | null, details: "Sem reembolso" };

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, email, total_cents, refunded_cents, mercadopago_payment_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Response("Pedido não encontrado", { status: 404 });

  const refundCents = Math.max(0, (order.total_cents ?? 0) - (order.refunded_cents ?? 0));
  if (refundCents <= 0) {
    return { refundCents: 0, couponCode: null as string | null, details: "Nada a reembolsar" };
  }

  let couponCode: string | null = null;
  let details = "";

  if (method === "mercadopago") {
    if (!order.mercadopago_payment_id) {
      throw new Response(
        "Este pedido não tem pagamento Mercado Pago vinculado. Use cupom ou reembolso manual.",
        { status: 400 },
      );
    }
    const { refundMercadoPagoPayment } = await import("@/lib/mercadopago.server");
    const r = await refundMercadoPagoPayment(order.mercadopago_payment_id, refundCents);
    details = `Mercado Pago refund #${r.id} (${r.status})`;
  } else if (method === "coupon") {
    const rand = () => Math.random().toString(36).slice(2, 7).toUpperCase();
    couponCode = `REEMB-${rand()}-${rand()}`;
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin.from("coupons").insert({
      code: couponCode,
      amount_cents: refundCents,
      user_id: order.user_id,
      max_uses: 1,
      active: true,
      expires_at: expires,
      notes: `Reembolso do pedido ${order.id.slice(0, 8)} (cancelamento total)`,
    });
    if (error) {
      console.error("[refundEntireOrder] erro ao criar cupom", error);
      throw new Response("Erro ao gerar cupom de reembolso.", { status: 500 });
    }
    details = `Cupom ${couponCode} (válido 1 ano)`;

    // Envia o e-mail do vale-presente assim que o cupom é gerado
    if (order.email) {
      const { sendTransactionalEmailSafe } = await import("@/lib/email/send.server");
      await sendTransactionalEmailSafe({
        templateName: "gift-voucher",
        recipientEmail: order.email,
        idempotencyKey: `refund-voucher:${couponCode}`,
        templateData: {
          recipientName: null,
          code: couponCode,
          amountCents: refundCents,
          expiresAt: expires,
        },
      });
    }
  } else {
    details = "Reembolso manual (a processar fora do sistema)";
  }

  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("id, quantity, cancelled_quantity, refund_cents")
    .eq("order_id", orderId);
  for (const it of (items ?? []) as any[]) {
    const remaining = Math.max(0, (it.quantity ?? 0) - (it.cancelled_quantity ?? 0));
    if (remaining <= 0) continue;
    await supabaseAdmin
      .from("order_items")
      .update({
        cancelled_quantity: it.quantity,
        cancelled_at: new Date().toISOString(),
        refund_method: method,
        refund_coupon_code: couponCode,
      })
      .eq("id", it.id);
  }

  await supabaseAdmin
    .from("orders")
    .update({
      refunded_cents: (order.refunded_cents ?? 0) + refundCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  return { refundCents, couponCode, details };
}

/** Itens ainda ativos (não cancelados) de um pedido — usado no e-mail de cancelamento total. */
export async function getActiveOrderItems(orderId: string) {
  const { data } = await supabaseAdmin
    .from("order_items")
    .select("card_name, quantity, cancelled_quantity")
    .eq("order_id", orderId);
  return ((data ?? []) as any[])
    .map((it) => ({
      name: it.card_name as string,
      quantity: Math.max(0, (it.quantity ?? 0) - (it.cancelled_quantity ?? 0)),
    }))
    .filter((it) => it.quantity > 0);
}
