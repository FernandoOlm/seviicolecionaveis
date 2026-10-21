// Regras de agendamento de Entrega em mãos e Retirada em mãos (horário de Aracaju, UTC-3).

export type ScheduleKind = "delivery" | "pickup";

export const HAND_DELIVERY_FEE_CENTS = 1500;
export const HAND_DELIVERY_PIX_KEY = "seviicolecionaveis@gmail.com";
export const STORE_WHATSAPP = "5579981509552";

const TZ_OFFSET_HOURS = -3; // America/Fortaleza (sem horário de verão)

/** Antecedência mínima para qualquer agendamento. */
export const MIN_LEAD_MS = 24 * 3_600_000;
export const SLOT_EXPIRED_MESSAGE = "Esse horário não está mais disponível. Escolha outra data.";

/** Horários (HH:MM) de cada tipo. Entrega: a partir das 19h. Retirada: 14h–19h em blocos de 30 min. */
export function slotsFor(kind: ScheduleKind): string[] {
  if (kind === "delivery") return ["19:00"];
  const out: string[] = [];
  for (let m = 14 * 60; m < 19 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

/** weekday: 0=domingo … 6=sábado */
export function isAllowedWeekday(kind: ScheduleKind, weekday: number): boolean {
  if (kind === "delivery") return weekday === 4; // quintas
  return weekday >= 1 && weekday <= 5; // seg–sex
}

/** Monta o instante UTC (ISO) a partir de data local (YYYY-MM-DD) e horário (HH:MM) de Aracaju. */
export function toIso(dateYmd: string, time: string): string {
  const [y, mo, d] = dateYmd.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h - TZ_OFFSET_HOURS, mi)).toISOString();
}

/** Converte instante para partes locais de Aracaju. */
export function localParts(iso: string) {
  const t = new Date(new Date(iso).getTime() + TZ_OFFSET_HOURS * 3_600_000);
  return {
    ymd: t.toISOString().slice(0, 10),
    time: t.toISOString().slice(11, 16),
    weekday: t.getUTCDay(),
  };
}

/** Valida um agendamento; retorna mensagem de erro ou null. */
export function validateSchedule(kind: ScheduleKind, iso: string, now: Date = new Date()): string | null {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "Data de agendamento inválida.";
  const p = localParts(iso);
  if (!isAllowedWeekday(kind, p.weekday)) {
    return kind === "delivery"
      ? "Entrega em mãos só acontece às quintas-feiras."
      : "Retirada em mãos só de segunda a sexta.";
  }
  if (!slotsFor(kind).includes(p.time)) return "Horário indisponível.";
  if (ts - now.getTime() < MIN_LEAD_MS) return SLOT_EXPIRED_MESSAGE;
  return null;
}

/** Horário ainda pode ser agendado (dia permitido e 24h+ de antecedência). */
export function isSlotBookable(kind: ScheduleKind, iso: string, now: Date = new Date()): boolean {
  return validateSchedule(kind, iso, now) === null;
}

/** Dia (YYYY-MM-DD, Fortaleza) tem pelo menos um horário agendável. */
export function isDayBookable(kind: ScheduleKind, dateYmd: string, now: Date = new Date()): boolean {
  return slotsFor(kind).some((s) => isSlotBookable(kind, toIso(dateYmd, s), now));
}

/** Data de hoje em Fortaleza (YYYY-MM-DD). */
export function todayYmd(now: Date = new Date()): string {
  return localParts(now.toISOString()).ymd;
}

export function addDaysYmd(dateYmd: string, days: number): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Próximo dia agendável a partir de hoje (Fortaleza). */
export function nextBookableDay(kind: ScheduleKind, now: Date = new Date()): string | null {
  let day = todayYmd(now);
  for (let i = 0; i < 60; i++, day = addDaysYmd(day, 1)) if (isDayBookable(kind, day, now)) return day;
  return null;
}

/** Retirada: limite para o admin marcar "Entregue" — 14h (Fortaleza) do dia seguinte ao agendado. */
export function pickupReopenDeadline(scheduledIso: string): Date {
  return new Date(toIso(addDaysYmd(localParts(scheduledIso).ymd, 1), "14:00"));
}

/** Retirada agendada não concluída a tempo deve reabrir. */
export function shouldReopenPickup(
  o: { schedule_kind: string | null; scheduled_at: string | null; status: string; reschedule_required?: boolean | null },
  now: Date = new Date(),
): boolean {
  if (o.schedule_kind !== "pickup" || !o.scheduled_at || o.reschedule_required) return false;
  if (["delivered", "cancelled", "pending", "cancellation_requested"].includes(o.status)) return false;
  return now.getTime() >= pickupReopenDeadline(o.scheduled_at).getTime();
}

export function formatSchedule(kind: ScheduleKind | string | null, iso: string): string {
  const p = localParts(iso);
  const [y, m, d] = p.ymd.split("-");
  const days = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const when = `${days[p.weekday]}, ${d}/${m}/${y}`;
  return kind === "delivery" ? `${when}, a partir das 19h` : `${when} às ${p.time}`;
}
