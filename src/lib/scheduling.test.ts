import { describe, it, expect } from "vitest";
import { slotsFor, toIso, validateSchedule, HAND_DELIVERY_FEE_CENTS } from "./scheduling";

const now = new Date("2026-10-01T12:00:00Z");

describe("agendamento", () => {
  it("taxa de entrega em mãos é R$15", () => {
    expect(HAND_DELIVERY_FEE_CENTS).toBe(1500);
  });
  it("retirada: blocos de 30 min das 14h às 19h", () => {
    const s = slotsFor("pickup");
    expect(s[0]).toBe("14:00");
    expect(s[s.length - 1]).toBe("18:30");
    expect(s).toHaveLength(10);
  });
  it("entrega só às quintas", () => {
    expect(validateSchedule("delivery", toIso("2026-10-08", "19:00"), now)).toBeNull(); // quinta
    expect(validateSchedule("delivery", toIso("2026-10-07", "19:00"), now)).not.toBeNull(); // quarta
  });
  it("retirada só seg–sex", () => {
    expect(validateSchedule("pickup", toIso("2026-10-05", "14:30"), now)).toBeNull(); // segunda
    expect(validateSchedule("pickup", toIso("2026-10-10", "14:30"), now)).not.toBeNull(); // sábado
    expect(validateSchedule("pickup", toIso("2026-10-05", "19:00"), now)).not.toBeNull();
  });
});
