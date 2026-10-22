import { describe, expect, it } from "vitest";
import { manualTotals, stockShortages, validateManualItems, manualShippingMethod } from "./manual-order";

const items = [
  { kind: "catalog" as const, cardId: "a", name: "Pikachu", unitPriceCents: 1000, quantity: 2 },
  { kind: "custom" as const, name: "Sleeve", unitPriceCents: 500, quantity: 1 },
];

describe("manual order totals", () => {
  it("applies percent discount and surcharge", () => {
    const t = manualTotals(items, { discountType: "percent", discountValue: 10, surchargeCents: 300 }, 2000);
    expect(t).toEqual({ subtotal: 2500, discount: 250, surcharge: 300, shipping: 2000, total: 4550 });
  });
  it("caps fixed discount at subtotal", () => {
    const t = manualTotals(items, { discountType: "fixed", discountValue: 9999, surchargeCents: 0 });
    expect(t.total).toBe(0);
  });
});

describe("manual order stock", () => {
  it("flags catalog items above stock, ignoring custom items", () => {
    expect(stockShortages(items, { a: 1 })).toEqual([{ cardId: "a", name: "Pikachu", requested: 2, available: 1 }]);
    expect(stockShortages(items, { a: 2 })).toEqual([]);
  });
});

describe("manual order validation", () => {
  it("requires at least one item", () => {
    expect(validateManualItems([])).toMatch(/pelo menos um item/);
  });
  it("'Definir depois' keeps the order without a shipping mode", () => {
    expect(manualShippingMethod("later")).toBe("to_define");
    expect(manualShippingMethod("stack")).toBe("card_stack");
  });
});
