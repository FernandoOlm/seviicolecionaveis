import { describe, it, expect } from "vitest";
import { isSlotBookable, toIso, validateSchedule, SLOT_EXPIRED_MESSAGE, nextBookableDay, pickupReopenDeadline, shouldReopenPickup } from "./scheduling";

// 2026-10-29 é quinta; 2026-10-30 é sexta.
describe("antecedência mínima de 24h (horário de Fortaleza)", () => {
  it("entrega de quinta fecha na quarta às 19h", () => {
    const at = toIso("2026-10-29", "19:00");
    expect(isSlotBookable("delivery", at, new Date(toIso("2026-10-28", "18:59")))).toBe(true);
    expect(isSlotBookable("delivery", at, new Date(toIso("2026-10-28", "19:00")))).toBe(true);
    expect(isSlotBookable("delivery", at, new Date(toIso("2026-10-28", "19:01")))).toBe(false);
  });
  it("bloco de sexta 15:30 fecha na quinta às 15:30", () => {
    const at = toIso("2026-10-30", "15:30");
    expect(isSlotBookable("pickup", at, new Date(toIso("2026-10-29", "15:30")))).toBe(true);
    expect(validateSchedule("pickup", at, new Date(toIso("2026-10-29", "15:31")))).toBe(SLOT_EXPIRED_MESSAGE);
  });
  it("horário já passado é recusado", () => {
    expect(validateSchedule("pickup", toIso("2026-10-30", "14:00"), new Date(toIso("2026-10-30", "16:00")))).toBe(SLOT_EXPIRED_MESSAGE);
  });
  it("dia sem horários restantes é pulado", () => {
    // quinta 18:31: sexta só tem blocos a partir de 18:31 → nenhum fechado? 18:30 fecha; nenhum bloco >= 18:31
    expect(nextBookableDay("pickup", new Date(toIso("2026-10-29", "18:31")))).toBe("2026-11-02");
    expect(nextBookableDay("pickup", new Date(toIso("2026-10-29", "18:00")))).toBe("2026-10-30");
  });
});

describe("reabertura da retirada", () => {
  const scheduled = toIso("2026-10-30", "15:00");
  const base = { schedule_kind: "pickup", scheduled_at: scheduled, status: "awaiting_pickup", reschedule_required: false };
  it("prazo é 14h do dia seguinte", () => {
    expect(pickupReopenDeadline(scheduled).toISOString()).toBe(toIso("2026-10-31", "14:00"));
  });
  it("reabre após 14h do dia seguinte se não entregue", () => {
    expect(shouldReopenPickup(base, new Date(toIso("2026-10-31", "13:59")))).toBe(false);
    expect(shouldReopenPickup(base, new Date(toIso("2026-10-31", "14:00")))).toBe(true);
  });
  it("não reabre se entregue, entrega em mãos ou já reaberto", () => {
    const later = new Date(toIso("2026-11-02", "10:00"));
    expect(shouldReopenPickup({ ...base, status: "delivered" }, later)).toBe(false);
    expect(shouldReopenPickup({ ...base, schedule_kind: "delivery" }, later)).toBe(false);
    expect(shouldReopenPickup({ ...base, reschedule_required: true }, later)).toBe(false);
  });
});
