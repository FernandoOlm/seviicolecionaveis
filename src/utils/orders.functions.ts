import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const adminUpdateOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      order_id: z.string().uuid(),
      status: z.enum([
        "pending",
        "paid",
        "preparing",
        "shipped",
        "awaiting_pickup",
        "delivered",
        "cancelled",
        "cancellation_requested",
      ]),
      tracking_code: z.string().trim().max(60).optional().nullable(),
      carrier: z.enum(["correios", "latam", "pickup"]).optional().nullable(),
      tracking_url: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? null : v),
        z.string().trim().max(500).url().optional().nullable(),
      ),
    }).parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { isAdmin, getOrderById, updateOrder, deleteStockReservations } =
      await import("@/lib/order-cancellation.server");
    const { sendTransactionalEmailSafe } = await import("@/lib/email/send.server");
    if (!(await isAdmin(context.userId))) throw new Response("Acesso negado", { status: 403 });
    const order = await getOrderById(data.order_id, "id, status, email, recipient_name, tracking_code, carrier, tracking_url");
    if (!order) throw new Response("Pedido não encontrado", { status: 404 });

    const trackingProvided = typeof data.tracking_code === "string";
    const newTracking = trackingProvided ? (data.tracking_code?.trim() || null) : undefined;
    const carrierProvided = data.carrier !== undefined;
    const newCarrier = carrierProvided ? (data.carrier ?? null) : undefined;
    const trackingUrlProvided = data.tracking_url !== undefined;
    const newTrackingUrl = trackingUrlProvided ? (data.tracking_url || null) : undefined;

    const statusChanged = order.status !== data.status;
    const trackingChanged = trackingProvided && newTracking !== (order.tracking_code ?? null);
    const carrierChanged = carrierProvided && newCarrier !== ((order as any).carrier ?? null);
    const trackingUrlChanged = trackingUrlProvided && newTrackingUrl !== ((order as any).tracking_url ?? null);

    if (!statusChanged && !trackingChanged && !carrierChanged && !trackingUrlChanged) return { ok: true };

    // Decrementar estoque sempre que o pedido transitar de um status "pré-pagamento"
    // (pending / cancellation_requested / cancelled) para qualquer status pós-pagamento
    // (paid / preparing / shipped / delivered). Antes, apenas a transição para "paid"
    // disparava o decremento, então mover direto para "preparing" deixava o estoque intacto.
    const PRE_PAID = ["pending", "cancellation_requested", "cancelled"];
    const POST_PAID = ["paid", "preparing", "shipped", "awaiting_pickup", "delivered"];
    if (statusChanged && PRE_PAID.includes(order.status) && POST_PAID.includes(data.status)) {
      const { markOrderPaid } = await import("@/lib/orders.server");
      await markOrderPaid(order.id);
      if (data.status === "paid") return { ok: true };
      // markOrderPaid deixou o pedido como "paid"; segue o fluxo para aplicar o status final.
    }

    if (statusChanged && data.status === "cancelled") {
      // Cancelamento manual pelo admin não devolve estoque — decisão do negócio.
      // Estoque só volta automaticamente quando o cliente não confirma pagamento (cron auto-cancel-unpaid).
      await deleteStockReservations(order.id);
    }

    const patch: Record<string, any> = {};
    if (statusChanged) patch.status = data.status;
    if (trackingChanged) patch.tracking_code = newTracking;
    if (carrierChanged) patch.carrier = newCarrier;
    if (trackingUrlChanged) patch.tracking_url = newTrackingUrl;
    await updateOrder(order.id, patch);

    if (order.email && statusChanged) {
      const effectiveCarrier = carrierProvided ? newCarrier : ((order as any).carrier ?? null);
      const effectiveTracking = trackingProvided ? newTracking : (order.tracking_code ?? null);
      const effectiveTrackingUrl = trackingUrlProvided ? newTrackingUrl : ((order as any).tracking_url ?? null);
      await sendTransactionalEmailSafe({
        templateName: "order-status-updated",
        recipientEmail: order.email,
        idempotencyKey: `order-status-${order.id}-${data.status}`,
        templateData: {
          recipientName: order.recipient_name?.split(/\s+/)[0],
          orderId: order.id,
          status: data.status,
          trackingCode: data.status === "shipped" ? effectiveTracking : null,
          carrier: data.status === "shipped" ? effectiveCarrier : null,
          trackingUrl: data.status === "shipped" ? effectiveTrackingUrl : null,
        },
      });
    }
    return { ok: true };
  });


export const requestOrderCancellation = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ order_id: z.string().uuid() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { getOrderById, updateOrder } = await import("@/lib/order-cancellation.server");
    const { sendTransactionalEmailSafe } = await import("@/lib/email/send.server");
    const order = await getOrderById(
      data.order_id,
      "id, user_id, status, email, recipient_name, total_cents",
    );
    if (!order) throw new Response("Pedido não encontrado", { status: 404 });
    if (order.user_id !== context.userId) {
      throw new Response("Acesso negado", { status: 403 });
    }
    if (!["pending", "paid"].includes(order.status)) {
      throw new Response("Este pedido não pode mais ser cancelado.", { status: 400 });
    }
    await updateOrder(order.id, {
      status: "cancellation_requested",
      pre_cancel_status: order.status,
    });
    // Notifica o admin por e-mail
    await sendTransactionalEmailSafe({
      templateName: "admin-cancellation-requested",
      recipientEmail: "seviicolecionaveis@gmail.com",
      idempotencyKey: `admin-cancel-req-${order.id}`,
      templateData: {
        orderId: order.id,
        recipientName: order.recipient_name,
        customerEmail: order.email,
        totalCents: order.total_cents,
        preCancelStatus: order.status,
      },
    });
    return { ok: true };
  });

export const approveOrderCancellation = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        order_id: z.string().uuid(),
        refund_method: z.enum(["mercadopago", "coupon", "manual", "none"]).default("none"),
        restore_stock: z.boolean().default(true),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const {
      isAdmin,
      getOrderById,
      updateOrder,
      deleteStockReservations,
      refundEntireOrder,
      restoreStockIfPaid,
      getActiveOrderItems,
    } = await import("@/lib/order-cancellation.server");
    const { sendTransactionalEmailSafe } = await import("@/lib/email/send.server");
    if (!(await isAdmin(context.userId))) throw new Response("Acesso negado", { status: 403 });
    const order = await getOrderById(
      data.order_id,
      "id, status, pre_cancel_status, email, recipient_name",
    );
    if (!order) throw new Response("Pedido não encontrado", { status: 404 });
    const cancelledItems = await getActiveOrderItems(order.id);
    let refund: { refundCents: number; couponCode: string | null; details: string } = {
      refundCents: 0,
      couponCode: null,
      details: "Sem reembolso",
    };
    let refundError: string | null = null;
    try {
      refund = await refundEntireOrder(order.id, data.refund_method);
    } catch (e: any) {
      // O cancelamento não pode ficar preso por uma falha de estorno.
      refundError =
        e instanceof Response ? await e.text().catch(() => "Falha no reembolso") : (e?.message ?? "Falha no reembolso");
      console.error("[approveOrderCancellation] falha no reembolso", refundError);
    }
    await deleteStockReservations(order.id);
    if (data.restore_stock) await restoreStockIfPaid(order.id, order.pre_cancel_status ?? order.status);
    await updateOrder(order.id, { status: "cancelled" });
    if (order.email) {
      await sendTransactionalEmailSafe({
        templateName: "order-status-updated",
        recipientEmail: order.email,
        idempotencyKey: `order-status-${order.id}-cancelled`,
        templateData: {
          recipientName: order.recipient_name?.split(/\s+/)[0],
          orderId: order.id,
          status: "cancelled",
          cancellation: {
            items: cancelledItems,
            refundCents: refund.refundCents,
            refundMethod: refundError ? "none" : data.refund_method,
            couponCode: refund.couponCode,
          },
        },
      });
    }

    return { ok: true, refundCents: refund.refundCents, couponCode: refund.couponCode, refundDetails: refund.details, refundError };
  });

export const rejectOrderCancellation = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ order_id: z.string().uuid() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { isAdmin, getOrderById, updateOrder } = await import("@/lib/order-cancellation.server");
    const { sendTransactionalEmailSafe } = await import("@/lib/email/send.server");
    if (!(await isAdmin(context.userId))) throw new Response("Acesso negado", { status: 403 });
    const order = await getOrderById(
      data.order_id,
      "id, pre_cancel_status, email, recipient_name",
    );
    if (!order) throw new Response("Pedido não encontrado", { status: 404 });
    const restored = order.pre_cancel_status ?? "pending";
    await updateOrder(order.id, {
      status: restored,
      pre_cancel_status: null,
    });
    if (order.email) {
      await sendTransactionalEmailSafe({
        templateName: "order-status-updated",
        recipientEmail: order.email,
        idempotencyKey: `order-status-${order.id}-reject-${restored}`,
        templateData: {
          recipientName: order.recipient_name?.split(/\s+/)[0],
          orderId: order.id,
          status: restored,
        },
      });
    }
    return { ok: true };
  });

export const adminCancelOrder = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        order_id: z.string().uuid(),
        refund_method: z.enum(["mercadopago", "coupon", "manual", "none"]).default("none"),
        restore_stock: z.boolean().default(true),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const {
      isAdmin,
      getOrderById,
      updateOrder,
      deleteStockReservations,
      refundEntireOrder,
      restoreStockIfPaid,
      getActiveOrderItems,
    } = await import("@/lib/order-cancellation.server");
    const { sendTransactionalEmailSafe } = await import("@/lib/email/send.server");
    if (!(await isAdmin(context.userId))) throw new Response("Acesso negado", { status: 403 });
    const order = await getOrderById(
      data.order_id,
      "id, status, email, recipient_name",
    );
    if (!order) throw new Response("Pedido não encontrado", { status: 404 });
    if (order.status === "cancelled") return { ok: true };
    const cancelledItems = await getActiveOrderItems(order.id);
    let refund: { refundCents: number; couponCode: string | null; details: string } = {
      refundCents: 0,
      couponCode: null,
      details: "Sem reembolso",
    };
    let refundError: string | null = null;
    try {
      refund = await refundEntireOrder(order.id, data.refund_method);
    } catch (e: any) {
      refundError =
        e instanceof Response ? await e.text().catch(() => "Falha no reembolso") : (e?.message ?? "Falha no reembolso");
      console.error("[adminCancelOrder] falha no reembolso", refundError);
    }
    await deleteStockReservations(order.id);
    if (data.restore_stock) await restoreStockIfPaid(order.id, order.status);
    await updateOrder(order.id, { status: "cancelled" });
    if (order.email) {
      await sendTransactionalEmailSafe({
        templateName: "order-status-updated",
        recipientEmail: order.email,
        idempotencyKey: `order-status-${order.id}-cancelled`,
        templateData: {
          recipientName: order.recipient_name?.split(/\s+/)[0],
          orderId: order.id,
          status: "cancelled",
          cancellation: {
            items: cancelledItems,
            refundCents: refund.refundCents,
            refundMethod: refundError ? "none" : data.refund_method,
            couponCode: refund.couponCode,
          },
        },
      });
    }

    return { ok: true, refundCents: refund.refundCents, couponCode: refund.couponCode, refundDetails: refund.details, refundError };
  });

export const adminPartialCancelItem = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      order_id: z.string().uuid(),
      order_item_id: z.string().uuid(),
      quantity: z.number().int().min(1).max(999),
      refund_method: z.enum(["mercadopago", "coupon", "manual"]),
      notes: z.string().trim().max(500).optional().nullable(),
    }).parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { isAdmin } = await import("@/lib/order-cancellation.server");
    if (!(await isAdmin(context.userId))) {
      throw new Response("Acesso negado", { status: 403 });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendTransactionalEmailSafe } = await import("@/lib/email/send.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, user_id, status, payment_method, mercadopago_payment_id, stripe_payment_intent, subtotal_cents, discount_cents, total_cents, refunded_cents, email, recipient_name",
      )
      .eq("id", data.order_id)
      .maybeSingle();
    if (!order) throw new Response("Pedido não encontrado", { status: 404 });

    const POST_PAID = ["paid", "preparing", "shipped", "awaiting_pickup", "delivered"];
    if (!POST_PAID.includes(order.status)) {
      throw new Response(
        "Só é possível cancelar itens em pedidos pagos. Para pedidos não pagos, cancele o pedido inteiro.",
        { status: 400 },
      );
    }

    const { data: item } = await supabaseAdmin
      .from("order_items")
      .select("id, order_id, card_id, card_name, quantity, cancelled_quantity, unit_price_cents, finish, card_number, collection")
      .eq("id", data.order_item_id)
      .maybeSingle();
    if (!item || item.order_id !== order.id) {
      throw new Response("Item não encontrado neste pedido", { status: 404 });
    }
    const remaining = (item.quantity ?? 0) - (item.cancelled_quantity ?? 0);
    if (data.quantity > remaining) {
      throw new Response(
        `Quantidade a cancelar (${data.quantity}) excede o disponível (${remaining}).`,
        { status: 400 },
      );
    }

    // Cálculo do reembolso — proporcional ao desconto aplicado no pedido.
    const baseCents = (item.unit_price_cents ?? 0) * data.quantity;
    const subtotal = order.subtotal_cents || 1;
    const discount = order.discount_cents ?? 0;
    const ratio = Math.max(0, Math.min(1, 1 - discount / subtotal));
    const refundCents = Math.round(baseCents * ratio);

    // Cancelamento manual pelo admin NÃO devolve estoque — decisão do negócio.
    // Estoque só é devolvido automaticamente quando o cliente não confirma pagamento (cron auto-cancel-unpaid).

    // Processa o reembolso conforme método escolhido.
    let couponCode: string | null = null;
    let refundDetails: string = "";
    if (data.refund_method === "mercadopago") {
      if (!order.mercadopago_payment_id) {
        throw new Response(
          "Este pedido não tem pagamento Mercado Pago vinculado. Use estorno manual ou cupom.",
          { status: 400 },
        );
      }
      const { refundMercadoPagoPayment } = await import("@/lib/mercadopago.server");
      const r = await refundMercadoPagoPayment(order.mercadopago_payment_id, refundCents);
      refundDetails = `Mercado Pago refund #${r.id} (${r.status})`;
    } else if (data.refund_method === "coupon") {
      // Gera código único
      const rand = () => Math.random().toString(36).slice(2, 7).toUpperCase();
      couponCode = `REEMB-${rand()}-${rand()}`;
      const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const { error: cErr } = await supabaseAdmin.from("coupons").insert({
        code: couponCode,
        amount_cents: refundCents,
        user_id: order.user_id,
        max_uses: 1,
        active: true,
        expires_at: expires,
        notes: `Reembolso parcial pedido ${order.id.slice(0, 8)} — item ${item.card_name} (x${data.quantity})`,
      });
      if (cErr) {
        console.error("[adminPartialCancelItem] erro ao criar cupom", cErr);
        throw new Response("Erro ao gerar cupom de reembolso.", { status: 500 });
      }
      refundDetails = `Cupom ${couponCode} (válido 1 ano)`;

      // Envia o e-mail do vale-presente assim que o cupom é gerado
      if (order.email) {
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
      refundDetails = "Reembolso manual (a processar fora do sistema)";
    }

    // Atualiza item
    const newCancelledQty = (item.cancelled_quantity ?? 0) + data.quantity;
    const fullyCancelled = newCancelledQty >= (item.quantity ?? 0);
    await supabaseAdmin
      .from("order_items")
      .update({
        cancelled_quantity: newCancelledQty,
        cancelled_at: fullyCancelled ? new Date().toISOString() : null,
        refund_method: data.refund_method,
        refund_cents: (item as any).refund_cents
          ? ((item as any).refund_cents as number) + refundCents
          : refundCents,
        refund_coupon_code: couponCode ?? (item as any).refund_coupon_code ?? null,
        refund_notes: data.notes ?? null,
      })
      .eq("id", item.id);

    // Atualiza total reembolsado do pedido
    await supabaseAdmin
      .from("orders")
      .update({
        refunded_cents: (order.refunded_cents ?? 0) + refundCents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    // Notifica o cliente
    if (order.email) {
      await sendTransactionalEmailSafe({
        templateName: "order-status-updated",
        recipientEmail: order.email,
        idempotencyKey: `order-partial-cancel-${item.id}-${newCancelledQty}`,
        templateData: {
          recipientName: order.recipient_name?.split(/\s+/)[0],
          orderId: order.id,
          status: order.status,
          partialCancellation: {
            itemName: item.card_name,
            quantity: data.quantity,
            refundCents,
            refundMethod: data.refund_method,
            couponCode,
            adminNote: data.notes ?? null,
          },
        },
      });
    }


    return { ok: true, refundCents, couponCode, refundDetails };
  });
