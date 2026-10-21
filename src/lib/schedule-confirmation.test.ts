import { describe, it, expect } from "vitest";
import { scheduleConfirmationData, type ScheduledOrder } from "./schedule-confirmation";

const order: ScheduledOrder = {
  id: "12345678-abcd", email: "cliente@example.com", recipient_name: "Cliente",
  scheduled_at: "2026-10-29T22:00:00.000Z", schedule_kind: "delivery",
  street: "Rua A", number: "10", city: "Aracaju", state: "SE",
};
describe("confirmação de agendamento", () => {
  it("inclui serviço, data e horário, endereço e número do pedido", () => {
    const data = scheduleConfirmationData(order);
    expect(data?.service).toBe("Entrega em mãos");
    expect(data?.when).toContain("29/10/2026");
    expect(data?.when).toContain("19h");
    expect(data?.address).toBe("Rua A, 10 · Aracaju/SE");
    expect(data?.orderId).toBe(order.id);
  });
  it("gera criação rápida do Calendar com data UTC e fuso de Aracaju", () => {
    const data = scheduleConfirmationData(order);
    const url = new URL(data?.calendarUrl ?? "https://invalid.example");
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261029T220000Z/20261029T230000Z");
    expect(url.searchParams.get("ctz")).toBe("America/Maceio");
    expect(url.searchParams.get("details")).toContain("Pedido #12345678");
    expect(url.searchParams.get("location")).toBe("Rua A, 10 · Aracaju/SE");
  });
  it("retirada usa o ponto escolhido e bloco de 30 minutos", () => {
    const data = scheduleConfirmationData({ ...order, schedule_kind: "pickup", scheduled_at: "2026-10-30T17:30:00Z", notes: "Retirada em mãos: Aruana — sexta, 30/10/2026 às 14:30." });
    expect(data?.address).toBe("Aruana");
    expect(data?.service).toBe("Retirada em mãos");
    expect(new URL(data?.calendarUrl ?? "https://invalid.example").searchParams.get("dates")).toBe("20261030T173000Z/20261030T180000Z");
  });
  it("não gera confirmação para opções sem agendamento", () => {
    expect(scheduleConfirmationData({ ...order, scheduled_at: null })).toBeNull();
    expect(scheduleConfirmationData({ ...order, schedule_kind: "evento" })).toBeNull();
  });
});