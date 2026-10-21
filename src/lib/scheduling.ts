// Regras de agendamento de Entrega em mãos e Retirada em mãos (horário de Aracaju, UTC-3).

export type ScheduleKind = "delivery" | "pickup";

export const HAND_DELIVERY_FEE_CENTS = 1500;
export const HAND_DELIVERY_PIX_KEY = "seviicolecionaveis@gmail.com";
export const STORE_WHATSAPP = "5579981509552";

const TZ_OFFSET_HOURS = -3; // America/Maceio (sem horário de verão)

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
  if (ts <= now.getTime()) return "Escolha uma data futura.";
  const p = localParts(iso);
  if (!isAllowedWeekday(kind, p.weekday)) {
    return kind === "delivery"
      ? "Entrega em mãos só acontece às quintas-feiras."
      : "Retirada em mãos só de segunda a sexta.";
  }
  if (!slotsFor(kind).includes(p.time)) return "Horário indisponível.";
  return null;
}

export function formatSchedule(kind: ScheduleKind | string | null, iso: string): string {
  const p = localParts(iso);
  const [y, m, d] = p.ymd.split("-");
  const days = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const when = `${days[p.weekday]}, ${d}/${m}/${y}`;
  return kind === "delivery" ? `${when}, a partir das 19h` : `${when} às ${p.time}`;
}
