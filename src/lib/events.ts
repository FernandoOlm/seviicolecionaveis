// Regras de "Retirada em eventos" (horário de Fortaleza, UTC-3). Browser-safe.

import { addDaysYmd, localParts, MIN_LEAD_MS, SLOT_EXPIRED_MESSAGE, toIso } from "./scheduling";

export interface PickupEvent {
  id: string;
  name: string;
  description: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  per_day_times: Record<string, { start: string; end: string }> | null;
  active: boolean;
}

export const EVENT_CLOSED_MESSAGE = "Agendamentos encerrados para este evento.";
export const NO_EVENTS_MESSAGE =
  "No momento não temos eventos programados. Fique de olho nos nossos canais para novidades.";

const hhmm = (t: string) => t.slice(0, 5);

/** Todos os dias do evento (YYYY-MM-DD), inclusive. */
export function eventDays(e: PickupEvent): string[] {
  const out: string[] = [];
  for (let d = e.start_date; d <= e.end_date && out.length < 62; d = addDaysYmd(d, 1)) out.push(d);
  return out;
}

/** Horário de um dia específico (respeita horários diferentes por dia). */
export function timesForDay(e: PickupEvent, ymd: string): { start: string; end: string } {
  const custom = e.per_day_times?.[ymd];
  return {
    start: hhmm(custom?.start ?? e.start_time),
    end: hhmm(custom?.end ?? e.end_time),
  };
}

/** Blocos de 1 hora dentro do intervalo do dia. Ex: 14h–18h → 14:00, 15:00, 16:00, 17:00. */
export function eventSlotsForDay(e: PickupEvent, ymd: string): string[] {
  const { start, end } = timesForDay(e, ymd);
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const out: string[] = [];
  for (let m = sh * 60 + sm; m + 60 <= eh * 60 + em; m += 60) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

/** Instante de início do dia do evento (UTC ISO). */
export function eventDayStartIso(e: PickupEvent, ymd: string): string {
  return toIso(ymd, timesForDay(e, ymd).start);
}

/** Instante de término do evento inteiro (último dia, horário de término). */
export function eventEndIso(e: PickupEvent): string {
  return toIso(e.end_date, timesForDay(e, e.end_date).end);
}

/** Reabertura: 10h (Fortaleza) do dia seguinte ao término do evento inteiro. */
export function eventReopenDeadline(e: PickupEvent): Date {
  return new Date(toIso(addDaysYmd(e.end_date, 1), "10:00"));
}

/** O dia do evento fecha 24h antes do horário de início daquele dia. */
export function isEventDayClosed(e: PickupEvent, ymd: string, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(eventDayStartIso(e, ymd)).getTime() - MIN_LEAD_MS;
}

/** Valida um agendamento de evento; retorna mensagem de erro ou null. */
export function validateEventSchedule(
  e: PickupEvent,
  ymd: string,
  slot: string,
  now: Date = new Date(),
): string | null {
  if (!e.active) return "Este evento não está mais disponível.";
  if (!eventDays(e).includes(ymd)) return "Data fora do período do evento.";
  if (!eventSlotsForDay(e, ymd).includes(slot)) return "Horário indisponível.";
  if (isEventDayClosed(e, ymd, now)) return SLOT_EXPIRED_MESSAGE;
  return null;
}

/** Evento tem pelo menos um dia/horário agendável. */
export function isEventBookable(e: PickupEvent, now: Date = new Date()): boolean {
  return e.active && eventDays(e).some((d) => !isEventDayClosed(e, d, now) && eventSlotsForDay(e, d).length > 0);
}

/** Pedido de retirada em evento não concluído deve reabrir às 10h do dia seguinte ao fim do evento. */
export function shouldReopenEventOrder(
  o: { schedule_kind: string | null; status: string; reschedule_required?: boolean | null },
  e: PickupEvent,
  now: Date = new Date(),
): boolean {
  if (o.schedule_kind !== "event" || o.reschedule_required) return false;
  if (["delivered", "cancelled", "pending", "cancellation_requested"].includes(o.status)) return false;
  return now.getTime() >= eventReopenDeadline(e).getTime();
}

/** Resumo curto do evento para tooltips/cards: "14h às 18h". */
export function eventTimeRangeLabel(e: PickupEvent, ymd?: string): string {
  const t = ymd ? timesForDay(e, ymd) : { start: hhmm(e.start_time), end: hhmm(e.end_time) };
  const fmt = (v: string) => (v.endsWith(":00") ? `${Number(v.slice(0, 2))}h` : v.replace(":", "h"));
  return `${fmt(t.start)} às ${fmt(t.end)}`;
}

/** Formata data YMD para dd/mm/aaaa. */
export function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/** Data local (Fortaleza) de um instante ISO. */
export function ymdOfIso(iso: string): string {
  return localParts(iso).ymd;
}
