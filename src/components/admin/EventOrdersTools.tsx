import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { eventDays, eventSlotsForDay, formatYmd, isEventDayClosed, type PickupEvent } from "@/lib/events";
import { toIso, MIN_LEAD_MS } from "@/lib/scheduling";
import { slotCounts } from "@/lib/event-hub";
import { OUT_OF_WINDOW_WARNING } from "@/lib/admin-shipping-edit";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { addOrdersToEventFn, searchEventCandidatesFn } from "@/lib/event-hub.functions";

type Candidate = Awaited<ReturnType<typeof searchEventCandidatesFn>>[number];
const brl = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

/** Dia + horário em blocos de 1h, com contagem informativa e aviso fora do prazo. */
export function EventSlotChooser({ event, orders, value, onChange }: {
  event: PickupEvent; orders: Array<{ scheduledAt: string | null }>; value: string | null; onChange: (iso: string) => void;
}) {
  const days = eventDays(event);
  const [ymd, setYmd] = useState(days[0]);
  const counts = useMemo(() => slotCounts(orders, ymd), [orders, ymd]);
  const outside = value ? new Date(value).getTime() - Date.now() < MIN_LEAD_MS || isEventDayClosed(event, ymd) : false;
  return (
    <div className="space-y-2">
      {days.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {days.map((d) => (
            <button key={d} type="button" onClick={() => setYmd(d)}
              className={`rounded-md border px-2 py-1 text-xs ${d === ymd ? "border-foreground bg-foreground text-background" : "border-border"}`}>{formatYmd(d)}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {eventSlotsForDay(event, ymd).map((t) => {
          const iso = toIso(ymd, t);
          return (
            <button key={t} type="button" onClick={() => onChange(iso)}
              className={`rounded-md border px-2 py-1.5 text-xs ${value === iso ? "border-foreground bg-foreground text-background" : "border-border hover:bg-secondary"}`}>
              {t}<span className="block text-[10px] opacity-70">{counts[t] ?? 0} pedido(s)</span>
            </button>
          );
        })}
      </div>
      {outside && <p className="rounded-md bg-amber-100 px-2 py-1.5 text-xs font-semibold text-amber-900">{OUT_OF_WINDOW_WARNING}</p>}
    </div>
  );
}

export function AddEventOrderPanel({ event, orders, onDone, onClose }: {
  event: PickupEvent; orders: Array<{ scheduledAt: string | null }>; onDone: () => void; onClose: () => void;
}) {
  const search = useServerFn(searchEventCandidatesFn);
  const add = useServerFn(addOrdersToEventFn);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Map<string, Candidate>>(new Map());
  const [includeStack, setIncludeStack] = useState(false);
  const [at, setAt] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().replace(/^#/, "").length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      search({ data: { eventId: event.id, query: q } }).then(setResults).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q, event.id, search]);

  const list = [...picked.values()];
  const anyStack = list.some((c) => c.stackId);
  const replacing = list.filter((c) => c.hasSchedule);
  const fees = list.filter((c) => c.feeWarning);
  const toggle = (c: Candidate) => setPicked((m) => { const n = new Map(m); n.has(c.id) ? n.delete(c.id) : n.set(c.id, c); return n; });

  const submit = async () => {
    if (!at || !list.length || busy) return;
    setBusy(true);
    try {
      const r = await add({ data: { eventId: event.id, orderIds: list.map((c) => c.id), includeStack, at, notifyClient: notify } });
      toast.success(`${r.added} pedido(s) adicionado(s) ao evento.${r.skipped ? ` ${r.skipped} já estavam no evento ou não podiam entrar.` : ""}`);
      onDone();
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível adicionar."); }
    finally { setBusy(false); }
  };

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-3 space-y-3 print:hidden">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider">Adicionar pedido ao evento</p>
        <button type="button" onClick={onClose} className="text-xs hover:underline">Cancelar</button>
      </div>
      {step === "pick" ? (
        <>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, nº do pedido (#AB12...), e-mail ou telefone"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          {results.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {results.map((c) => (
                <label key={c.id} className={`flex gap-2 px-2.5 py-2 text-xs ${c.alreadyInEvent ? "opacity-50" : "cursor-pointer hover:bg-secondary"}`}>
                  <input type="checkbox" className="mt-0.5 accent-foreground" disabled={c.alreadyInEvent} checked={picked.has(c.id)} onChange={() => toggle(c)} />
                  <span className="flex-1 min-w-0">
                    <span className="font-mono font-semibold">#{c.code}</span> · {c.customer ?? "Cliente"} · {brl(c.totalCents)}
                    <span className="block text-muted-foreground truncate">{c.items || "—"}</span>
                    <span className="block text-muted-foreground">{ORDER_STATUS_LABELS[c.status as keyof typeof ORDER_STATUS_LABELS] ?? c.status} · {c.modality}</span>
                    {c.alreadyInEvent && <span className="font-semibold">Já está neste evento</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          {list.length > 0 && (
            <>
              <p className="text-xs">{list.length} pedido(s) selecionado(s).</p>
              {anyStack && (
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-foreground" checked={includeStack} onChange={(e) => setIncludeStack(e.target.checked)} /> Incluir todos os pedidos desta pilha</label>
              )}
              <EventSlotChooser event={event} orders={orders} value={at} onChange={setAt} />
              <button type="button" disabled={!at} onClick={() => setStep("confirm")} className="rounded-md bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-40">Continuar</button>
            </>
          )}
        </>
      ) : (
        <div className="space-y-3 text-xs">
          <div className="rounded-md border border-border divide-y divide-border">
            {list.map((c) => (
              <div key={c.id} className="grid grid-cols-2 gap-2 p-2">
                <div><p className="text-[10px] uppercase text-muted-foreground">Atual · #{c.code}</p><p>{c.modality}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Novo</p><p>Retirada em eventos — {event.name} — {at && new Date(at).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p></div>
              </div>
            ))}
          </div>
          {includeStack && <p className="text-muted-foreground">Os outros pedidos da mesma pilha também entram no evento.</p>}
          {replacing.length > 0 && <p className="rounded-md bg-amber-100 p-2 text-amber-900">O agendamento atual será substituído. A loja recebe um aviso para remover o evento antigo do calendário.</p>}
          {fees.length > 0 && <p className="rounded-md bg-amber-100 p-2 text-amber-900">Atenção: {fees.map((c) => `#${c.code}`).join(", ")} tem frete ou taxa vinculado à modalidade anterior. Verifique se é preciso devolver ou ajustar o valor.</p>}
          <p className="text-muted-foreground">Pedidos na Pilha de Cartas mantêm o mesmo prazo de 30 dias.</p>
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-foreground" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Enviar e-mail de confirmação ao cliente</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep("pick")} className="rounded-md border border-border px-3 py-2 font-semibold">Voltar</button>
            <button type="button" onClick={submit} disabled={busy} className="rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-40">{busy ? "Adicionando..." : "Confirmar inclusão"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
