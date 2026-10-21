/** Regular orders only; service orders have their own lifecycle. */
export const ORDER_STATUSES = [
  "pending", "paid", "preparing", "separated", "shipped", "awaiting_pickup",
  "cards_pending_delivery", "delivered", "cancelled",
] as const;

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pedido recebido",
  paid: "Pago",
  preparing: "Em preparação",
  separated: "Separado",
  shipped: "Enviado",
  awaiting_pickup: "Pronto para retirada",
  cards_pending_delivery: "Faltam cartas a serem entregues",
  delivered: "Entregue",
  cancelled: "Cancelado",
  cancellation_requested: "Cancelamento solicitado",
};

export const PAID_ORDER_STATUSES: readonly string[] = [
  "paid", "preparing", "separated", "shipped", "awaiting_pickup",
  "cards_pending_delivery", "delivered",
];

export function isPaidOrderStatus(status: string): boolean {
  return PAID_ORDER_STATUSES.includes(status);
}