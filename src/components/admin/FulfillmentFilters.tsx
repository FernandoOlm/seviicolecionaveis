import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MODALITIES, MODALITY_LABELS, matchesScheduleRange, formatScheduleShort, type DateRange, type Modality } from "@/lib/fulfillment-alerts";

export interface FulfillmentFilterState {
  modality: "all" | Modality;
  onlyUnread: boolean;
  eventId: string;
  range: DateRange;
  from: string;
  to: string;
}
export const DEFAULT_FULFILLMENT_FILTER: FulfillmentFilterState = { modality: "all", onlyUnread: false, eventId: "", range: "all", from: "", to: "" };

export function matchesFulfillmentFilter(
  f: FulfillmentFilterState,
  row: { id: string; modality: Modality; eventId?: string | null; scheduledAt?: string | null },
  unreadTargets: Set<string>,
): boolean {
  if (f.modality !== "all" && row.modality !== f.modality) return false;
  if (f.onlyUnread && !unreadTargets.has(row.id)) return false;
  if (f.modality === "event" && f.eventId && row.eventId !== f.eventId) return false;
  return matchesScheduleRange(row.scheduledAt, f.range, new Date(), f.from || undefined, f.to || undefined);
}

export function ModalityBadge({ modality, scheduledAt, unread }: { modality: Modality; scheduledAt?: string | null; unread?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {unread && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Escolha nova não vista" />}
      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold">
        {MODALITY_LABELS[modality]}{scheduledAt ? ` · ${formatScheduleShort(scheduledAt)}` : ""}
      </span>
    </span>
  );
}

export function FulfillmentFilters({ value, onChange, count }: { value: FulfillmentFilterState; onChange: (v: FulfillmentFilterState) => void; count: number }) {
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    supabase.from("events").select("id, name").order("start_date", { ascending: false }).limit(100)
      .then(({ data }) => setEvents((data ?? []) as any));
  }, []);
  const set = (p: Partial<FulfillmentFilterState>) => onChange({ ...value, ...p });
  const sel = "rounded-md border border-border bg-background px-2 py-1 text-xs";
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-wrap items-center gap-3 text-xs">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Retirada/envio</p>
      <select className={sel} value={value.modality} onChange={(e) => set({ modality: e.target.value as any, eventId: "" })} aria-label="Modalidade">
        <option value="all">Todas</option>
        {MODALITIES.map((m) => <option key={m} value={m}>{MODALITY_LABELS[m]}</option>)}
      </select>
      {value.modality === "event" && (
        <select className={sel} value={value.eventId} onChange={(e) => set({ eventId: e.target.value })} aria-label="Evento">
          <option value="">Todos os eventos</option>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
      )}
      <select className={sel} value={value.range} onChange={(e) => set({ range: e.target.value as DateRange })} aria-label="Data do agendamento">
        <option value="all">Qualquer data</option>
        <option value="today">Hoje</option>
        <option value="tomorrow">Amanhã</option>
        <option value="week">Esta semana</option>
        <option value="custom">Intervalo...</option>
      </select>
      {value.range === "custom" && (
        <>
          <input type="date" className={sel} value={value.from} onChange={(e) => set({ from: e.target.value })} aria-label="De" />
          <input type="date" className={sel} value={value.to} onChange={(e) => set({ to: e.target.value })} aria-label="Até" />
        </>
      )}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" className="h-4 w-4 accent-foreground" checked={value.onlyUnread} onChange={(e) => set({ onlyUnread: e.target.checked })} />
        Escolhas novas/não vistas
      </label>
      <span className="ml-auto font-semibold">{count} resultado(s)</span>
    </div>
  );
}
