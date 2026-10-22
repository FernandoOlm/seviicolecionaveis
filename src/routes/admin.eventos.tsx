import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  countEventOrders,
  createEvent,
  deleteEvent,
  flagOutOfRangeEventOrders,
  listAllEvents,
  listEventOrders,
  updateEvent,
} from "@/lib/events.functions";
import { notifyEventOrders } from "@/lib/event-notify.functions";
import { AddEventOrderPanel, EventSlotChooser } from "@/components/admin/EventOrdersTools";
import { canAddToEvent, EVENT_BLOCKED_MESSAGE } from "@/lib/event-hub";
import { markEventOrderDeliveredFn, removeOrderFromEventFn, rescheduleEventOrderFn } from "@/lib/event-hub.functions";
import { eventDays, eventTimeRangeLabel, formatYmd, type PickupEvent } from "@/lib/events";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { localParts } from "@/lib/scheduling";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/eventos")({
  head: () => ({
    meta: [
      { title: "Eventos · Sevii Admin" },
      { name: "description", content: "Cadastre e gerencie os eventos com retirada de pedidos da Sevii Colecionáveis." },
      { property: "og:title", content: "Eventos · Sevii Admin" },
      { property: "og:description", content: "Hub de eventos para retirada de pedidos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EventosAdminPage,
});

type EventForm = {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  active: boolean;
  customTimes: boolean;
  per_day_times: Record<string, { start: string; end: string }>;
};

const emptyForm: EventForm = {
  name: "",
  description: "",
  start_date: "",
  end_date: "",
  start_time: "14:00",
  end_time: "18:00",
  active: true,
  customTimes: false,
  per_day_times: {},
};

function toForm(e: PickupEvent): EventForm {
  return {
    name: e.name,
    description: e.description ?? "",
    start_date: e.start_date,
    end_date: e.end_date,
    start_time: e.start_time,
    end_time: e.end_time,
    active: e.active,
    customTimes: !!e.per_day_times && Object.keys(e.per_day_times).length > 0,
    per_day_times: e.per_day_times ?? {},
  };
}

function formDays(f: EventForm): string[] {
  if (!f.start_date || !f.end_date || f.end_date < f.start_date) return [];
  const out: string[] = [];
  let d = f.start_date;
  for (let i = 0; i < 62 && d <= f.end_date; i++) {
    out.push(d);
    const [y, m, dd] = d.split("-").map(Number);
    d = new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
  }
  return out;
}

type EventOrder = Awaited<ReturnType<typeof listEventOrders>>[number];

function EventosAdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<PickupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"lista" | "calendario">("lista");
  const [calMonth, setCalMonth] = useState<Date>(() => new Date());
  const [editing, setEditing] = useState<PickupEvent | null>(null);
  const [form, setForm] = useState<EventForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<PickupEvent | null>(null);
  const [orders, setOrders] = useState<EventOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const listAll = useServerFn(listAllEvents);
  const createFn = useServerFn(createEvent);
  const updateFn = useServerFn(updateEvent);
  const deleteFn = useServerFn(deleteEvent);
  const countFn = useServerFn(countEventOrders);
  const listOrdersFn = useServerFn(listEventOrders);
  const flagFn = useServerFn(flagOutOfRangeEventOrders);
  const notifyFn = useServerFn(notifyEventOrders);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<{ id: string; at: string | null } | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const rescheduleFn = useServerFn(rescheduleEventOrderFn);
  const removeFn = useServerFn(removeOrderFromEventFn);
  const deliveredFn = useServerFn(markEventOrderDeliveredFn);
  const reloadOrders = async () => {
    if (!selected) return;
    setOrders(await listOrdersFn({ data: { eventId: selected.id, includeFinished: true } }));
  };
  const rowAction = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setRowBusy(id);
    try { await fn(); toast.success(ok); await reloadOrders(); }
    catch (e: any) { toast.error(e?.message ?? "Não foi possível concluir."); }
    finally { setRowBusy(null); }
  };

  const load = async () => {
    setLoading(true);
    try {
      setEvents(await listAll());
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao carregar eventos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const openOrders = async (e: PickupEvent) => {
    setSelected(e);
    setOrdersLoading(true);
    try {
      setOrders(await listOrdersFn({ data: { eventId: e.id, includeFinished: true } }));
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao carregar pedidos.");
    } finally {
      setOrdersLoading(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [events, search]);
  const future = filtered.filter((e) => e.end_date >= today);
  const past = filtered.filter((e) => e.end_date < today);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, PickupEvent[]>();
    for (const e of filtered) for (const d of eventDays(e)) map.set(d, [...(map.get(d) ?? []), e]);
    return map;
  }, [filtered]);

  const save = async () => {
    if (!form) return;
    if (!form.name.trim() || !form.start_date || !form.end_date) {
      toast.error("Preencha nome e datas do evento.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        start_date: form.start_date,
        end_date: form.end_date,
        start_time: form.start_time,
        end_time: form.end_time,
        per_day_times: form.customTimes ? form.per_day_times : null,
        active: form.active,
      };
      let saved: PickupEvent;
      if (editing) {
        const old = editing;
        saved = await updateFn({ data: { id: editing.id, data: payload } });
        toast.success("Evento atualizado.");
        const scheduleChanged =
          old.start_date !== saved.start_date ||
          old.end_date !== saved.end_date ||
          old.start_time !== saved.start_time ||
          old.end_time !== saved.end_time ||
          JSON.stringify(old.per_day_times) !== JSON.stringify(saved.per_day_times);
        if (scheduleChanged) {
          const { count } = await countFn({ data: { eventId: saved.id } });
          if (count > 0) {
            const { flagged } = await flagFn({ data: { eventId: saved.id } });
            const notify = window.confirm(
              `${count} pedido(s) vinculados a este evento.${flagged > 0 ? ` ${flagged} ficaram fora do novo horário e foram marcados como "Reagendamento necessário".` : ""} Deseja avisar os clientes por e-mail?`,
            );
            if (notify) {
              const r = await notifyFn({ data: { eventId: saved.id, kind: "changed" } });
              toast.success(`${r.sent} cliente(s) avisados por e-mail.`);
            }
          }
        }
      } else {
        saved = await createFn({ data: payload });
        toast.success("Evento criado.");
      }
      setForm(null);
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar evento.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (e: PickupEvent) => {
    if (e.active) {
      const { count } = await countFn({ data: { eventId: e.id } });
      const msg =
        count > 0
          ? `Este evento tem ${count} pedido(s) com retirada agendada. Desativar esconde o evento dos clientes. Deseja avisar os clientes por e-mail? (OK = desativar e avisar, Cancelar = voltar)`
          : "Desativar este evento? Ele some da escolha dos clientes.";
      if (count > 0) {
        if (!window.confirm(msg)) return;
        await notifyFn({ data: { eventId: e.id, kind: "deactivated" } }).catch(() => {});
      } else if (!window.confirm(msg)) {
        return;
      }
    }
    try {
      await updateFn({
        data: {
          id: e.id,
          data: {
            name: e.name,
            description: e.description,
            start_date: e.start_date,
            end_date: e.end_date,
            start_time: e.start_time,
            end_time: e.end_time,
            per_day_times: e.per_day_times,
            active: !e.active,
          },
        },
      });
      toast.success(e.active ? "Evento desativado." : "Evento reativado.");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao atualizar evento.");
    }
  };

  const remove = async (e: PickupEvent) => {
    const { count } = await countFn({ data: { eventId: e.id } });
    const msg =
      count > 0
        ? `Excluir "${e.name}"? ${count} pedido(s) estão vinculados e serão desvinculados. Deseja avisar os clientes por e-mail antes? (OK = excluir e avisar, Cancelar = voltar)`
        : `Excluir "${e.name}"? Essa ação não pode ser desfeita.`;
    if (!window.confirm(msg)) return;
    try {
      if (count > 0) await notifyFn({ data: { eventId: e.id, kind: "cancelled" } }).catch(() => {});
      await deleteFn({ data: { id: e.id } });
      toast.success("Evento excluído.");
      if (selected?.id === e.id) setSelected(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao excluir evento.");
    }
  };

  if (authLoading || !isAdmin) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando...</div>;
  }

  const eventCard = (e: PickupEvent) => (
    <div key={e.id} className={cn("rounded-lg border border-border bg-card p-4", !e.active && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm">
            {e.name} {!e.active && <span className="text-xs text-muted-foreground">(inativo)</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatYmd(e.start_date)}
            {e.end_date !== e.start_date ? ` a ${formatYmd(e.end_date)}` : ""} · {eventTimeRangeLabel(e)}
          </p>
          {e.description && <p className="text-xs text-muted-foreground mt-0.5">{e.description}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => openOrders(e)} className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-secondary">
            Pedidos
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(e);
              setForm(toForm(e));
            }}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-secondary"
          >
            Editar
          </button>
          <button type="button" onClick={() => toggleActive(e)} className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-secondary">
            {e.active ? "Desativar" : "Reativar"}
          </button>
          <button type="button" onClick={() => remove(e)} className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
            Excluir
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Eventos</h1>
          <p className="text-sm text-muted-foreground">Eventos com retirada de pedidos (aparecem no checkout e na Pilha de Cartas).</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setView(view === "lista" ? "calendario" : "lista")}
            className="rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary"
          >
            {view === "lista" ? "📅 Calendário" : "☰ Lista"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setForm({ ...emptyForm });
            }}
            className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            + Novo evento
          </button>
        </div>
      </div>

      <input
        className="mb-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        placeholder="Buscar evento pelo nome..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : view === "calendario" ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <Calendar
            mode="single"
            locale={ptBR}
            month={calMonth}
            onMonthChange={setCalMonth}
            modifiers={{ eventDay: (d: Date) => eventsByDay.has(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`) }}
            modifiersClassNames={{ eventDay: "bg-primary/15 text-primary font-bold rounded-md" }}
            className="pointer-events-auto"
          />
          <div className="mt-3 space-y-1">
            {[...eventsByDay.entries()]
              .filter(([d]) => d.slice(0, 7) === `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}`)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([d, evs]) => (
                <p key={d} className="text-xs">
                  <span className="font-semibold">{formatYmd(d)}:</span>{" "}
                  {evs.map((e) => `${e.name} (${eventTimeRangeLabel(e, d)})`).join(" · ")}
                </p>
              ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Próximos eventos</h2>
            <div className="space-y-2">{future.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum evento futuro.</p> : future.map(eventCard)}</div>
          </section>
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Histórico</h2>
            <div className="space-y-2">{past.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum evento passado.</p> : past.map(eventCard)}</div>
          </section>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editing ? "Editar evento" : "Novo evento"}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold">Nome *</label>
                <input className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Encontro Pokémon TCG - Praça X" />
              </div>
              <div>
                <label className="text-xs font-semibold">Descrição (opcional)</label>
                <textarea className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Local, referências, observações..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold">Data *</label>
                  <input type="date" className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value, end_date: form.end_date && form.end_date >= e.target.value ? form.end_date : e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold">Data final (se mais de um dia)</label>
                  <input type="date" className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm" value={form.end_date} min={form.start_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold">Início *</label>
                  <input type="time" className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold">Término *</label>
                  <input type="time" className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                </div>
              </div>
              {formDays(form).length > 1 && (
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input type="checkbox" checked={form.customTimes} onChange={(e) => setForm({ ...form, customTimes: e.target.checked })} />
                  Definir horários diferentes por dia
                </label>
              )}
              {form.customTimes &&
                formDays(form).map((d) => {
                  const t = form.per_day_times[d] ?? { start: form.start_time, end: form.end_time };
                  return (
                    <div key={d} className="flex items-center gap-2 text-xs">
                      <span className="w-24 font-semibold">{formatYmd(d)}</span>
                      <input
                        type="time"
                        className="rounded-md border border-border px-2 py-1"
                        value={t.start}
                        onChange={(e) => setForm({ ...form, per_day_times: { ...form.per_day_times, [d]: { ...t, start: e.target.value } } })}
                      />
                      <span>às</span>
                      <input
                        type="time"
                        className="rounded-md border border-border px-2 py-1"
                        value={t.end}
                        onChange={(e) => setForm({ ...form, per_day_times: { ...form.per_day_times, [d]: { ...t, end: e.target.value } } })}
                      />
                    </div>
                  );
                })}
              <label className="flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Ativo (visível para os clientes)
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setForm(null)} className="rounded-md border border-border px-4 py-2 text-xs font-semibold">
                  Cancelar
                </button>
                <button type="button" disabled={saving} onClick={save} className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-background p-5 shadow-xl print:shadow-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4 print:hidden">
              <div>
                <h2 className="text-lg font-bold">{selected.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {formatYmd(selected.start_date)}
                  {selected.end_date !== selected.start_date ? ` a ${formatYmd(selected.end_date)}` : ""} · {eventTimeRangeLabel(selected)}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => (canAddToEvent(selected) ? setAdding(true) : toast.error(EVENT_BLOCKED_MESSAGE))}
                  className="rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90">
                  + Adicionar pedido
                </button>
                <button type="button" onClick={() => window.print()} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                  🖨️ Imprimir
                </button>
                <button type="button" onClick={() => setSelected(null)} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                  Fechar
                </button>
              </div>
            </div>
            <div className="hidden print:block mb-3">
              <h2 className="text-lg font-bold">{selected.name}</h2>
              <p className="text-xs">
                {formatYmd(selected.start_date)}
                {selected.end_date !== selected.start_date ? ` a ${formatYmd(selected.end_date)}` : ""} · {eventTimeRangeLabel(selected)}
              </p>
            </div>
            <p className="mb-3 text-xs font-semibold">
              {orders.length} pedido(s) · {orders.reduce((a, o) => a + o.itemCount, 0)} item(ns)
            </p>
            {adding && (
              <AddEventOrderPanel event={selected} orders={orders} onClose={() => setAdding(false)}
                onDone={async () => { setAdding(false); await reloadOrders(); }} />
            )}
            {ordersLoading ? (
              <p className="text-sm text-muted-foreground">Carregando pedidos...</p>
            ) : orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pedido vinculado a este evento.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1.5 pr-2">Pedido</th>
                    <th className="py-1.5 pr-2">Cliente</th>
                    <th className="py-1.5 pr-2">Retirada</th>
                    <th className="py-1.5 pr-2">Status</th>
                    <th className="py-1.5 pr-2 print:hidden">Ações</th>
                    <th className="hidden py-1.5 pr-2 print:table-cell">Entregue</th>
                  </tr>
                </thead>
                <tbody>
                  {[...orders].sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "")).map((o) => (
                    <Fragment key={o.id}>
                    <tr className="border-b border-border/50">
                      <td className="py-1.5 pr-2 font-mono">
                        <Link to="/admin/orders/$orderId" params={{ orderId: o.id }} className="underline">
                          #{o.code}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-2">{o.recipientName ?? "—"}</td>
                      <td className="py-1.5 pr-2">
                        {o.scheduledAt
                          ? `${formatYmd(localParts(o.scheduledAt).ymd)} às ${localParts(o.scheduledAt).time}`
                          : "—"}
                        {o.manual && <span className="ml-1 rounded bg-secondary px-1 font-semibold">Adicionado manualmente</span>}
                        {o.rescheduleRequired && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">Reagendamento necessário</span>}
                      </td>
                      <td className="py-1.5 pr-2">{ORDER_STATUS_LABELS[o.status as keyof typeof ORDER_STATUS_LABELS] ?? o.status}</td>
                      <td className="py-1.5 pr-2 print:hidden">
                        {!["delivered", "cancelled", "refunded"].includes(o.status) && (
                          <div className="flex flex-wrap gap-1">
                            <button type="button" disabled={rowBusy === o.id} onClick={() => setMoving({ id: o.id, at: o.scheduledAt })} className="rounded border border-border px-1.5 py-0.5 hover:bg-secondary">Alterar horário</button>
                            <button type="button" disabled={rowBusy === o.id}
                              onClick={() => window.confirm(`Remover #${o.code} do evento? O pedido volta para a modalidade anterior.`) && rowAction(o.id, () => removeFn({ data: { eventId: selected.id, orderId: o.id } }), "Pedido removido do evento.")}
                              className="rounded border border-border px-1.5 py-0.5 hover:bg-secondary">Remover do evento</button>
                            <button type="button" disabled={rowBusy === o.id}
                              onClick={() => window.confirm(`Marcar #${o.code} como Entregue?`) && rowAction(o.id, () => deliveredFn({ data: { eventId: selected.id, orderId: o.id } }), "Pedido marcado como entregue.")}
                              className="rounded bg-foreground px-1.5 py-0.5 text-background">Entregue</button>
                          </div>
                        )}
                      </td>
                      <td className="hidden py-1.5 pr-2 print:table-cell"><span className="inline-block h-4 w-4 border border-foreground" /></td>
                    </tr>
                    {moving?.id === o.id && (
                      <tr className="print:hidden"><td colSpan={6} className="py-2">
                        <EventSlotChooser event={selected} orders={orders} value={moving.at} onChange={(at) => setMoving({ id: o.id, at })} />
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => setMoving(null)} className="rounded border border-border px-2 py-1">Cancelar</button>
                          <button type="button" disabled={!moving.at || rowBusy === o.id}
                            onClick={() => moving.at && rowAction(o.id, () => rescheduleFn({ data: { eventId: selected.id, orderId: o.id, at: moving.at!, notifyClient: true } }), "Horário alterado.").then(() => setMoving(null))}
                            className="rounded bg-foreground px-2 py-1 text-background">Salvar horário</button>
                        </div>
                      </td></tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
