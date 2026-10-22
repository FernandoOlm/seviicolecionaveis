import { describe, expect, it } from "vitest";
import { adminShippingWarnings, canAdminEditShipping, OUT_OF_WINDOW_WARNING, rebuildShippingNotes, validateAdminShippingInput } from "./admin-shipping-edit";
import { toIso } from "./scheduling";

const now = new Date(toIso("2026-10-22", "12:00"));

describe("admin shipping edit", () => {
  it("delivered orders are locked", () => {
    expect(canAdminEditShipping({ status: "delivered", shipping_method: "card_stack", schedule_kind: null })).toBe(false);
  });
  it("card stack, event and pickup orders are editable; tracked shipping is not", () => {
    expect(canAdminEditShipping({ status: "paid", shipping_method: "card_stack", schedule_kind: null })).toBe(true);
    expect(canAdminEditShipping({ status: "paid", shipping_method: "arrange", schedule_kind: "event" })).toBe(true);
    expect(canAdminEditShipping({ status: "paid", shipping_method: "arrange", schedule_kind: "pickup" })).toBe(true);
    expect(canAdminEditShipping({ status: "paid", shipping_method: "fixed", schedule_kind: null })).toBe(false);
  });
  it("hand delivery requires payment status", () => {
    expect(validateAdminShippingInput({ mode: "delivery", at: toIso("2026-10-29", "19:00"), address: { street: "R", number: "1", city: "Aracaju" } })).toMatch(/pagamento/);
  });
  it("tracked shipping requires shipping cost", () => {
    expect(validateAdminShippingInput({ mode: "tracked", address: { cep: "49000", street: "R", number: "1", city: "Aracaju" } })).toMatch(/frete/);
  });
  it("pickup within 24h warns but is not a validation error", () => {
    const i = { mode: "pickup" as const, pickupPoint: "aruana" as const, at: toIso("2026-10-22", "15:00") };
    expect(validateAdminShippingInput(i)).toBeNull();
    expect(adminShippingWarnings(i, null, now)).toContain(OUT_OF_WINDOW_WARNING);
  });
  it("notes replace old schedule line and keep other notes", () => {
    const n = rebuildShippingNotes("Retirada em mãos: Aruana — x.\nObs do cliente", { mode: "pickup", pickupPoint: "aeroporto", at: toIso("2026-10-26", "14:00") });
    expect(n?.split("\n")[0]).toMatch(/^Retirada em mãos: Aeroporto/);
    expect(n).toContain("Obs do cliente");
    expect(n).not.toContain("Aruana — x.");
  });
});
