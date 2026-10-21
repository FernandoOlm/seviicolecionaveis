import { describe, expect, it } from "vitest";
import { ORDER_STATUSES, isPaidOrderStatus } from "./order-status";

describe("regular order lifecycle", () => {
  it("allows separated orders and preserves paid processing", () => {
    expect(ORDER_STATUSES).toContain("separated");
    expect(isPaidOrderStatus("separated")).toBe(true);
  });
  it("reuses the existing pickup status without duplicates", () => {
    expect(ORDER_STATUSES.filter(status => status === "awaiting_pickup")).toHaveLength(1);
    expect(isPaidOrderStatus("awaiting_pickup")).toBe(true);
  });
  it("allows orders with cards still to deliver and preserves paid processing", () => {
    expect(ORDER_STATUSES).toContain("cards_pending_delivery");
    expect(isPaidOrderStatus("cards_pending_delivery")).toBe(true);
  });
  it("does not treat pending or cancelled orders as paid", () => {
    expect(isPaidOrderStatus("pending")).toBe(false);
    expect(isPaidOrderStatus("cancelled")).toBe(false);
  });
});