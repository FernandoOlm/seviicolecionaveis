import { describe, expect, it } from "vitest";
import { ORDER_STATUSES, isPaidOrderStatus, canBuyerConfirmReceipt } from "./order-status";

describe("regular order lifecycle", () => {
  it("allows buyer confirmation when ready for pickup", () => {
    expect(canBuyerConfirmReceipt("awaiting_pickup")).toBe(true);
  });
  it("allows buyer confirmation after shipment", () => {
    expect(canBuyerConfirmReceipt("shipped")).toBe(true);
  });
  it("rejects confirmation while cards are still to be delivered", () => {
    expect(canBuyerConfirmReceipt("cards_pending_delivery")).toBe(false);
  });
  it("rejects confirmation of already delivered orders", () => {
    expect(canBuyerConfirmReceipt("delivered")).toBe(false);
  });
  it("rejects confirmation of cancelled or cancellation-requested orders", () => {
    expect(canBuyerConfirmReceipt("cancelled")).toBe(false);
    expect(canBuyerConfirmReceipt("cancellation_requested")).toBe(false);
  });
  it("rejects confirmation before shipment or pickup readiness", () => {
    for (const status of ["pending", "paid", "preparing", "separated", "unknown"]) expect(canBuyerConfirmReceipt(status)).toBe(false);
  });
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