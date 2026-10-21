import { formatSchedule, type ScheduleKind } from "./scheduling";

export const SCHEDULE_EMAIL_SETTING = "schedule_confirmation_email";

export interface ScheduledOrder {
  id: string;
  email: string | null;
  recipient_name: string | null;
  scheduled_at: string | null;
  schedule_kind: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  hand_delivery_fee_status?: string | null;
}

export function scheduleConfirmationData(order: ScheduledOrder) {
  if (!order.scheduled_at || !["delivery", "pickup"].includes(order.schedule_kind ?? "")) return null;
  const kind = order.schedule_kind as ScheduleKind;
  const start = new Date(order.scheduled_at);
  if (Number.isNaN(start.getTime())) return null;
  const service = kind === "delivery" ? "Entrega em mãos" : "Retirada em mãos";
  const shortId = `#${order.id.slice(0, 8).toUpperCase()}`;
  // O ponto de retirada foi persistido nas observações; não usar o endereço residencial.
  const pickupLine = order.notes?.split("\n").find((line) => line.startsWith("Retirada em mãos: ")) ?? "";
  const scheduleSeparator = pickupLine.lastIndexOf(" — ");
  const pickupAddress = scheduleSeparator >= 0 ? pickupLine.slice("Retirada em mãos: ".length, scheduleSeparator) : "";
  const address = kind === "pickup" ? pickupAddress : [
    [order.street, order.number].filter(Boolean).join(", "),
    order.complement, order.neighborhood,
    [order.city, order.state].filter(Boolean).join("/"),
  ].filter(Boolean).join(" · ");
  const when = formatSchedule(kind, order.scheduled_at);
  const description = [
    `Pedido ${shortId}`, `Cliente: ${order.recipient_name ?? "Cliente"}`,
    `Serviço: ${service}`, `Agendamento: ${when}`, address ? `Endereço: ${address}` : "",
    order.notes ?? "", `https://seviicolecionaveis.com.br/admin/orders/${order.id}`,
  ].filter(Boolean).join("\n");
  const compact = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  // Bloco de 30 minutos para retirada; entrega usa marco inicial, sem prometer chegada.
  const end = new Date(start.getTime() + (kind === "pickup" ? 30 : 60) * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE", text: `${service} · Pedido ${shortId} · ${order.recipient_name ?? "Cliente"}`,
    dates: `${compact(start)}/${compact(end)}`, ctz: "America/Maceio", details: description,
    location: address,
  });
  return {
    orderId: order.id, recipientName: order.recipient_name ?? "Cliente", service, when, address,
    delivery: kind === "delivery",
    deliveryFeePending: kind === "delivery" && order.hand_delivery_fee_status !== "paid",
    calendarUrl: `https://calendar.google.com/calendar/render?${params.toString()}`,
  };
}