import { describe, expect, it } from "vitest";
import { fulfillmentDedupeKey, matchesScheduleRange, modalityOfOrder, modalityOfServiceOrder, clientEmailSubject, EMAIL_RETRY_DELAYS_MS } from "./fulfillment-alerts";

describe("fulfillment alerts", () => {
  it("maps pilha event choice to Retirada em eventos", () => {
    expect(modalityOfServiceOrder("evento")).toBe("event");
  });
  it("maps checkout schedule kinds", () => {
    expect(modalityOfOrder({ shipping_method: "arrange", schedule_kind: "event" })).toBe("event");
    expect(modalityOfOrder({ shipping_method: "arrange", schedule_kind: "delivery" })).toBe("delivery");
    expect(modalityOfOrder({ shipping_method: "card_stack" })).toBe("none");
    expect(modalityOfOrder({ shipping_method: "superfrete" })).toBe("shipping");
  });
  it("same order + modality + time gives the same key (no duplicates)", () => {
    const a = fulfillmentDedupeKey({ targetType: "order", targetId: "x", action: "defined", modality: "pickup", scheduledAt: "2026-10-23T17:00:00.000Z" });
    const b = fulfillmentDedupeKey({ targetType: "order", targetId: "x", action: "defined", modality: "pickup", scheduledAt: "2026-10-23T17:00:00Z" });
    const c = fulfillmentDedupeKey({ targetType: "order", targetId: "x", action: "defined", modality: "pickup", scheduledAt: "2026-10-23T17:30:00Z" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it("retries email up to 3 times", () => {
    expect(EMAIL_RETRY_DELAYS_MS).toHaveLength(3);
  });
  it("uses Fortaleza day for today/tomorrow", () => {
    const now = new Date("2026-10-22T16:00:00Z"); // 13h Fortaleza
    expect(matchesScheduleRange("2026-10-23T02:00:00Z", "today", now)).toBe(true); // 23h dia 22
    expect(matchesScheduleRange("2026-10-23T13:00:00Z", "tomorrow", now)).toBe(true);
    expect(matchesScheduleRange("2026-10-30T13:00:00Z", "week", now)).toBe(false);
  });
  it("client subjects", () => {
    expect(clientEmailSubject("defined", "pickup")).toBe("Sua retirada foi confirmada");
    expect(clientEmailSubject("changed", "event")).toBe("Sua retirada foi alterada");
    expect(clientEmailSubject("cancelled", "pickup")).toBe("Seu agendamento foi cancelado");
  });
});
