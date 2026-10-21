import { useEffect, useMemo, useState } from "react";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  eventDays,
  eventSlotsForDay,
  eventTimeRangeLabel,
  isEventDayClosed,
  NO_EVENTS_MESSAGE,
  EVENT_CLOSED_MESSAGE,
  type PickupEvent,
} from "@/lib/events";
import { toIso } from "@/lib/scheduling";

export interface EventSelection {
  eventId: string;
  ymd: string;
  slot: string;
  iso: string;
}

interface Props {
  events: PickupEvent[];
  value: EventSelection | null;
  onChange: (sel: EventSelection | null) => void;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Calendário de retirada em eventos: só dias com evento ativo são clicáveis; blocos de 1h; fecha 24h antes. */
export function EventSlotPicker({ events, value, onChange }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, PickupEvent[]>();
    for (const e of events) for (const d of eventDays(e)) map.set(d, [...(map.get(d) ?? []), e]);
    return map;
  }, [events]);

  const firstOpenDay = useMemo(() => {
    const days = [...byDay.keys()].sort();
    return days.find((d) => (byDay.get(d) ?? []).some((e) => !isEventDayClosed(e, d, now))) ?? null;
  }, [byDay, now]);

  const [day, setDay] = useState<Date | undefined>(undefined);
  const [month, setMonth] = useState<Date | undefined>(undefined);
  useEffect(() => {
    if (!month && firstOpenDay) setMonth(fromYmd(firstOpenDay));
  }, [firstOpenDay, month]);

  const dayKey = day ? ymd(day) : null;
  const dayEvents = dayKey ? (byDay.get(dayKey) ?? []) : [];
  const openEvents = dayEvents.filter((e) => !isEventDayClosed(e, dayKey!, now));
  const selectedEvent = value ? events.find((e) => e.id === value.eventId) ?? null : null;
  const activeEvent = selectedEvent && dayKey && eventDays(selectedEvent).includes(dayKey) ? selectedEvent : openEvents[0] ?? null;

  if (events.length === 0 || !firstOpenDay) {
    return (
      <p className="rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
        {NO_EVENTS_MESSAGE}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-4 rounded-md border border-border bg-background p-3">
        <Calendar
          mode="single"
          locale={ptBR}
          selected={day}
          onSelect={(d) => {
            setDay(d ?? undefined);
            onChange(null);
          }}
          month={month}
          onMonthChange={setMonth}
          startMonth={fromYmd(firstOpenDay)}
          disabled={[(d: Date) => !byDay.has(ymd(d))]}
          modifiers={{ eventDay: (d: Date) => byDay.has(ymd(d)) }}
          modifiersClassNames={{ eventDay: "bg-primary/15 text-primary font-bold rounded-md" }}
          className={cn("p-0 pointer-events-auto")}
        />
        <div className="flex-1 min-w-[160px]">
          {!day ? (
            <p className="text-xs text-muted-foreground">Escolha um dia com evento (destacado em azul).</p>
          ) : dayEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum evento neste dia.</p>
          ) : (
            <>
              <p className="text-xs font-semibold mb-2 capitalize">
                {day.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </p>
              <div className="space-y-2">
                {dayEvents.map((e) => {
                  const closed = isEventDayClosed(e, dayKey!, now);
                  const active = activeEvent?.id === e.id;
                  return (
                    <div key={e.id} className="rounded-md border border-border p-2">
                      <button
                        type="button"
                        disabled={closed}
                        onClick={() => onChange(null)}
                        className={cn(
                          "w-full text-left disabled:opacity-50",
                          active && !closed ? "text-primary" : "",
                        )}
                      >
                        <p className="text-sm font-semibold">{e.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {eventTimeRangeLabel(e, dayKey!)}
                          {e.description ? ` · ${e.description}` : ""}
                        </p>
                        {closed && <p className="text-[11px] text-amber-700 mt-0.5">{EVENT_CLOSED_MESSAGE}</p>}
                      </button>
                      {!closed && dayEvents.filter((x) => !isEventDayClosed(x, dayKey!, now)).length > 1 && (
                        <label className="mt-1 flex items-center gap-2 text-xs">
                          <input
                            type="radio"
                            name="event-day-choice"
                            checked={active}
                            onChange={() => onChange(null)}
                            readOnly
                          />
                          Retirar neste evento
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
              {activeEvent && !isEventDayClosed(activeEvent, dayKey!, now) && (
                <div className="mt-3">
                  <p className="text-xs font-semibold mb-1.5">Horário de retirada em {activeEvent.name}:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-1 gap-1.5 max-h-56 overflow-y-auto">
                    {eventSlotsForDay(activeEvent, dayKey!).map((s) => {
                      const iso = toIso(dayKey!, s);
                      const sel = value?.eventId === activeEvent.id && value?.ymd === dayKey && value?.slot === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onChange({ eventId: activeEvent.id, ymd: dayKey!, slot: s, iso })}
                          className={cn(
                            "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                            sel ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary",
                          )}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Agendamentos podem ser feitos com no mínimo 24h de antecedência.
      </p>
    </div>
  );
}
