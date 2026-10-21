import { useMemo, useState } from "react";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { isAllowedWeekday, slotsFor, toIso, type ScheduleKind } from "@/lib/scheduling";

interface Props {
  kind: ScheduleKind;
  value: string | null; // ISO
  onChange: (iso: string | null) => void;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Mini calendário à esquerda + horários disponíveis à direita (estilo agendamento do Google). */
export function ScheduleSlotPicker({ kind, value, onChange }: Props) {
  const [day, setDay] = useState<Date | undefined>(undefined);
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const startMonth = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);

  const slots = day ? slotsFor(kind) : [];
  const now = Date.now();

  return (
    <div className="flex flex-col sm:flex-row gap-4 rounded-md border border-border bg-background p-3">
      <Calendar
        mode="single"
        locale={ptBR}
        selected={day}
        onSelect={(d) => {
          setDay(d ?? undefined);
          onChange(null);
        }}
        startMonth={startMonth}
        disabled={[{ before: today }, (d: Date) => !isAllowedWeekday(kind, d.getDay())]}
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
                const past = new Date(iso).getTime() <= now;
                const active = value === iso;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={past}
                    onClick={() => onChange(iso)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-secondary",
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
  );
}
