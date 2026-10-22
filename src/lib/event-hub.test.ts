import { describe, expect, it } from "vitest";
import { canAddToEvent, isEligibleForEvent, normalizeOrderQuery, restorePatch, slotCounts } from "./event-hub";

const now = new Date("2026-10-22T16:00:00Z");
describe("event hub", () => {
  it("blocks inactive or finished events", () => {
    expect(canAddToEvent({ active: false, end_date: "2026-10-30" }, now)).toBe(false);
    expect(canAddToEvent({ active: true, end_date: "2026-10-21" }, now)).toBe(false);
    expect(canAddToEvent({ active: true, end_date: "2026-10-22" }, now)).toBe(true);
  });
  it("only undelivered, uncancelled orders are eligible", () => {
    expect(isEligibleForEvent("delivered")).toBe(false);
    expect(isEligibleForEvent("cancelled")).toBe(false);
    expect(isEligibleForEvent("paid")).toBe(true);
  });
  it("accepts order ids with #", () => expect(normalizeOrderQuery(" #AB12 ")).toBe("AB12"));
  it("counts orders per slot in Fortaleza time", () => {
    const c = slotCounts([{ scheduledAt: "2026-10-24T17:00:00Z" }, { scheduledAt: "2026-10-24T17:00:00Z" }, { scheduledAt: "2026-10-25T17:00:00Z" }], "2026-10-24");
    expect(c).toEqual({ "14:00": 2 });
  });
  it("removing restores previous modality, else Pilha or Definir depois", () => {
    const prev = { shipping_method: "arrange", schedule_kind: "pickup", scheduled_at: "x", event_id: null, notes: "n", hand_delivery_fee_status: null };
    expect(restorePatch(prev, false)).toBe(prev);
    expect(restorePatch(null, true).shipping_method).toBe("card_stack");
    expect(restorePatch(null, false).shipping_method).toBe("to_define");
  });
});
