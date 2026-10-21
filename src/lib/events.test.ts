import { describe, expect, it } from "vitest";
import {
  eventDays,
  eventEndIso,
  eventReopenDeadline,
  eventSlotsForDay,
  eventTimeRangeLabel,
  isEventBookable,
  isEventDayClosed,
  shouldReopenEventOrder,
  timesForDay,
  validateEventSchedule,
  type PickupEvent,
} from "./events";

const base: PickupEvent = {
  id: "ev1",
  name: "Encontro TCG",
  description: null,
  start_date: "2026-11-20", // sexta
  end_date: "2026-11-21",
  start_time: "14:00",
  end_time: "18:00",
  per_day_times: null,
  active: true,
};

describe("events", () => {
  it("lista dias do evento, inclusive", () => {
    expect(eventDays(base)).toEqual(["2026-11-20", "2026-11-21"]);
  });

  it("gera blocos de 1h dentro do intervalo", () => {
    expect(eventSlotsForDay(base, "2026-11-20")).toEqual(["14:00", "15:00", "16:00", "17:00"]);
  });

  it("respeita horários diferentes por dia", () => {
    const e = { ...base, per_day_times: { "2026-11-21": { start: "10:00", end: "12:00" } } };
    expect(timesForDay(e, "2026-11-21")).toEqual({ start: "10:00", end: "12:00" });
    expect(eventSlotsForDay(e, "2026-11-21")).toEqual(["10:00", "11:00"]);
    expect(eventSlotsForDay(e, "2026-11-20")).toEqual(["14:00", "15:00", "16:00", "17:00"]);
  });

  it("fecha cada dia 24h antes do início daquele dia", () => {
    // Dia 20/11 14h Fortaleza = 17h UTC. Fecha em 19/11 17h UTC.
    expect(isEventDayClosed(base, "2026-11-20", new Date("2026-11-19T16:59:00Z"))).toBe(false);
    expect(isEventDayClosed(base, "2026-11-20", new Date("2026-11-19T17:00:00Z"))).toBe(true);
    // Dia 21/11 ainda aberto no mesmo instante.
    expect(isEventDayClosed(base, "2026-11-21", new Date("2026-11-19T17:00:00Z"))).toBe(false);
  });

  it("valida agendamento: data, horário e antecedência", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    expect(validateEventSchedule(base, "2026-11-20", "15:00", now)).toBeNull();
    expect(validateEventSchedule(base, "2026-11-22", "15:00", now)).toBe("Data fora do período do evento.");
    expect(validateEventSchedule(base, "2026-11-20", "18:00", now)).toBe("Horário indisponível.");
    expect(validateEventSchedule({ ...base, active: false }, "2026-11-20", "15:00", now)).toBe(
      "Este evento não está mais disponível.",
    );
  });

  it("evento sem horário agendável não é reservável", () => {
    expect(isEventBookable(base, new Date("2026-11-18T12:00:00Z"))).toBe(true);
    expect(isEventBookable(base, new Date("2026-11-22T12:00:00Z"))).toBe(false);
    expect(isEventBookable({ ...base, active: false }, new Date("2026-11-18T12:00:00Z"))).toBe(false);
  });

  it("reabre às 10h do dia seguinte ao fim do evento", () => {
    // Fim: 21/11 18h Fortaleza = 21h UTC. Reabre 22/11 10h Fortaleza = 13h UTC.
    expect(eventEndIso(base)).toBe("2026-11-21T21:00:00.000Z");
    expect(eventReopenDeadline(base).toISOString()).toBe("2026-11-22T13:00:00.000Z");
    const order = { schedule_kind: "event", status: "awaiting_pickup", reschedule_required: false };
    expect(shouldReopenEventOrder(order, base, new Date("2026-11-22T12:59:00Z"))).toBe(false);
    expect(shouldReopenEventOrder(order, base, new Date("2026-11-22T13:00:00Z"))).toBe(true);
    expect(shouldReopenEventOrder({ ...order, status: "delivered" }, base, new Date("2026-11-23T13:00:00Z"))).toBe(false);
    expect(shouldReopenEventOrder({ ...order, schedule_kind: "pickup" }, base, new Date("2026-11-23T13:00:00Z"))).toBe(false);
  });

  it("rótulo de intervalo de horário", () => {
    expect(eventTimeRangeLabel(base)).toBe("14h às 18h");
    expect(eventTimeRangeLabel({ ...base, start_time: "14:30", end_time: "18:30" })).toBe("14h30 às 18h30");
  });
});
