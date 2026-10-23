import { PAID_ORDER_STATUSES } from "@/lib/order-status";

export interface AdminOrderStatusInput {
  order_id: string;
  status: string;
  tracking_code?: string | null;
  carrier?: "correios" | "latam" | "pickup" | null;
  tracking_url?: string | null;
}

/** Shared admin status/tracking rules used by the panel and the MCP integration. */
export async function applyAdminOrderStatus(userId: string, data: AdminOrderStatusInput) {
    const { isAdmin, getOrderById, updateOrder, deleteStockReservations } =
      await import("@/lib/order-cancellation.server");
    const { sendTransactionalEmailSafe } = await import("@/lib/email/send.server");
    if (!(await isAdmin(userId))) throw new Response("Acesso negado", { status: 403 });
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
    const POST_PAID = PAID_ORDER_STATUSES;
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
}
