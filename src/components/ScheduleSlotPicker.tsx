import { useEffect, useMemo, useState } from "react";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { isAllowedWeekday, isDayBookable, isSlotBookable, nextBookableDay, slotsFor, toIso, type ScheduleKind } from "@/lib/scheduling";

interface Props {
  kind: ScheduleKind;
  value: string | null; // ISO
  onChange: (iso: string | null) => void;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Mini calendário + horários. Regras (24h de antecedência, fuso de Fortaleza) vêm de @/lib/scheduling. */
export function ScheduleSlotPicker({ kind, value, onChange }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const first = useMemo(() => nextBookableDay(kind, now), [kind, now]);
  const [day, setDay] = useState<Date | undefined>(undefined);
  const [month, setMonth] = useState<Date | undefined>(undefined);
  useEffect(() => {
    if (!month && first) setMonth(fromYmd(first));
  }, [first, month]);

  // Se o horário escolhido expirar com a tela aberta, limpa a seleção.
  useEffect(() => {
    if (value && !isSlotBookable(kind, value, now)) onChange(null);
  }, [now, value, kind, onChange]);

  const firstDate = first ? fromYmd(first) : new Date();
  const slots = day ? slotsFor(kind) : [];

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
          startMonth={new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)}
          disabled={[
            { before: firstDate },
            (d: Date) => !isAllowedWeekday(kind, d.getDay()) || !isDayBookable(kind, ymd(d), now),
          ]}
          className={cn("p-0 pointer-events-auto")}
        />
        <div className="flex-1 min-w-[140px]">
          {!day ? (
            <p className="text-xs text-muted-foreground">
              {kind === "delivery" ? "Escolha uma quinta-feira." : "Escolha um dia útil (segunda a sexta)."}
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold mb-2 capitalize">
                {day.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-1 gap-1.5 max-h-64 overflow-y-auto">
                {slots.map((s) => {
                  const iso = toIso(ymd(day), s);
                  const closed = !isSlotBookable(kind, iso, now);
                  const active = value === iso;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={closed}
                      title={closed ? "Indisponível (menos de 24h de antecedência)" : undefined}
                      onClick={() => onChange(iso)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:line-through disabled:cursor-not-allowed",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary",
                      )}
                    >
                      {kind === "delivery" ? "A partir das 19h" : s}
                    </button>
                  );
                })}
              </div>
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
