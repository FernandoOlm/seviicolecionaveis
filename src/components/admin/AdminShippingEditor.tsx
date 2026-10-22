import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminEditOrderShippingFn } from "@/lib/admin-shipping-edit.functions";
import {
  ADMIN_SHIPPING_MODE_LABELS, PICKUP_POINT_LABELS, adminShippingWarnings, currentShippingMode,
  validateAdminShippingInput, type AdminShippingInput, type AdminShippingMode, type PickupPoint,
} from "@/lib/admin-shipping-edit";
import { formatSchedule, slotsFor, toIso, localParts } from "@/lib/scheduling";
import { eventDays, eventSlotsForDay, formatYmd, type PickupEvent } from "@/lib/events";

const MODES: AdminShippingMode[] = ["pickup", "event", "delivery", "tracked", "stack"];
const input = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm";

export function AdminShippingEditor({ order, onSaved }: { order: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<PickupEvent[]>([]);
  const cur = currentShippingMode(order);
  const [mode, setMode] = useState<AdminShippingMode>(cur ?? "pickup");
  const initLocal = order.scheduled_at ? localParts(order.scheduled_at) : null;
  const [date, setDate] = useState(initLocal?.ymd ?? "");
  const [slot, setSlot] = useState(initLocal?.time ?? "");
  const [pickupPoint, setPickupPoint] = useState<PickupPoint | "">(
    order.notes?.includes("Retirada em mãos: Aeroporto") ? "aeroporto" : order.notes?.includes("Retirada em mãos: Aruana") ? "aruana" : "",
  );
  const [eventId, setEventId] = useState<string>(order.event_id ?? "");
  const [addr, setAddr] = useState({
    cep: order.cep ?? "", street: order.street ?? "", number: order.number ?? "", complement: order.complement ?? "",
    neighborhood: order.neighborhood ?? "", city: order.city ?? "", state: order.state ?? "",
  });
  const [deliveryInfo, setDeliveryInfo] = useState("");
  const [feeStatus, setFeeStatus] = useState<"pending" | "confirmed">(order.hand_delivery_fee_status === "confirmed" ? "confirmed" : "pending");
  const [shippingReais, setShippingReais] = useState(order.shipping_cost_cents ? String(order.shipping_cost_cents / 100) : "");
  const [notifyClient, setNotifyClient] = useState(true);
  const [applyToStack, setApplyToStack] = useState(false);
  const save = useServerFn(adminEditOrderShippingFn);

  useEffect(() => {
    if (!open) return;
    (supabase as any).from("events").select("*").order("start_date").then(({ data }: any) =>
      setEvents((data ?? []).map((e: any) => ({
        ...e, start_time: String(e.start_time).slice(0, 5), end_time: String(e.end_time).slice(0, 5),
      }))),
    );
  }, [open]);

  const ev = events.find((e) => e.id === eventId) ?? null;
  const at = date && (mode === "delivery" || slot) ? toIso(date, mode === "delivery" ? "19:00" : slot) : null;
  const payload: AdminShippingInput = {
    mode, at: ["pickup", "event", "delivery"].includes(mode) ? at : null,
    pickupPoint: mode === "pickup" ? (pickupPoint || null) : null,
    eventId: mode === "event" ? eventId || null : null,
    address: mode === "delivery" || mode === "tracked" ? addr : null,
    deliveryInfo: mode === "delivery" ? deliveryInfo : null,
    feeStatus: mode === "delivery" ? feeStatus : null,
    shippingCents: mode === "tracked" && shippingReais.trim() ? Math.round(Number(shippingReais.replace(",", ".")) * 100) : null,
  };
  const error = validateAdminShippingInput(payload);
  const warnings = useMemo(() => adminShippingWarnings(payload, ev), [JSON.stringify(payload), ev]);

  const currentText = cur
    ? `${ADMIN_SHIPPING_MODE_LABELS[cur].replace("Manter na ", "")}${order.scheduled_at ? ` — ${formatSchedule(order.schedule_kind, order.scheduled_at)}` : ""}`
    : order.shipping_method;
  const newText = `${ADMIN_SHIPPING_MODE_LABELS[mode].replace("Manter na ", "")}${mode === "event" && ev ? ` (${ev.name})` : ""}${payload.at ? ` — ${formatSchedule(mode === "delivery" ? "delivery" : "pickup", payload.at)}` : ""}`;

  async function submit() {
    setBusy(true);
    try {
      const r = await save({ data: { orderId: order.id, ...payload, notifyClient, applyToStack } as any });
      toast.success(r.updated > 1 ? `Envio/retirada atualizado em ${r.updated} pedidos.` : "Envio/retirada atualizado.");
      setOpen(false); setStep("edit"); onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally { setBusy(false); }
  }

  const A = (k: keyof typeof addr, ph: string) => (
    <input className={input} placeholder={ph} value={addr[k]} onChange={(e) => setAddr({ ...addr, [k]: e.target.value })} />
  );

  return <>
    <Button variant="outline" size="sm" onClick={() => { setStep("edit"); setOpen(true); }}>Editar envio/retirada</Button>
    <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar envio/retirada</DialogTitle>
          <DialogDescription>Registre aqui a mudança combinada com o cliente.</DialogDescription>
        </DialogHeader>

        {step === "edit" ? <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-1.5">
            {MODES.map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === m} onChange={() => { setMode(m); setSlot(""); }} />
                {ADMIN_SHIPPING_MODE_LABELS[m]}
              </label>
            ))}
          </div>

          {mode === "pickup" && <div className="space-y-2">
            <select className={input} value={pickupPoint} onChange={(e) => setPickupPoint(e.target.value as PickupPoint)}>
              <option value="">Local da retirada…</option>
              {(Object.keys(PICKUP_POINT_LABELS) as PickupPoint[]).map((k) => <option key={k} value={k}>{PICKUP_POINT_LABELS[k]}</option>)}
            </select>
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
            <select className={input} value={slot} onChange={(e) => setSlot(e.target.value)}>
              <option value="">Horário…</option>
              {slotsFor("pickup").map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>}

          {mode === "event" && <div className="space-y-2">
            <select className={input} value={eventId} onChange={(e) => { setEventId(e.target.value); setDate(""); setSlot(""); }}>
              <option value="">Evento…</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name} — {formatYmd(e.start_date)}{e.active ? "" : " (inativo)"}</option>)}
            </select>
            {ev && <select className={input} value={date} onChange={(e) => { setDate(e.target.value); setSlot(""); }}>
              <option value="">Dia…</option>
              {eventDays(ev).map((d) => <option key={d} value={d}>{formatYmd(d)}</option>)}
            </select>}
            {ev && date && <select className={input} value={slot} onChange={(e) => setSlot(e.target.value)}>
              <option value="">Horário…</option>
              {eventSlotsForDay(ev, date).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>}
          </div>}

          {mode === "delivery" && <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">Quinta-feira da entrega (a partir das 19h)</label>
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="grid grid-cols-3 gap-2">{A("street", "Rua")}{A("number", "Número")}{A("complement", "Complemento")}</div>
            <div className="grid grid-cols-3 gap-2">{A("neighborhood", "Bairro")}{A("city", "Cidade")}{A("state", "UF")}</div>
            <textarea className={input} placeholder="Informações adicionais" value={deliveryInfo} onChange={(e) => setDeliveryInfo(e.target.value)} />
            <select className={input} value={feeStatus} onChange={(e) => setFeeStatus(e.target.value as any)}>
              <option value="pending">Pix de R$ 15 — Pendente</option>
              <option value="confirmed">Pix de R$ 15 — Pago</option>
            </select>
          </div>}

          {mode === "tracked" && <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">{A("cep", "CEP")}{A("street", "Rua")}{A("number", "Número")}</div>
            <div className="grid grid-cols-2 gap-2">{A("complement", "Complemento")}{A("neighborhood", "Bairro")}</div>
            <div className="grid grid-cols-2 gap-2">{A("city", "Cidade")}{A("state", "UF")}</div>
            <input className={input} inputMode="decimal" placeholder="Valor do frete (R$)" value={shippingReais} onChange={(e) => setShippingReais(e.target.value)} />
          </div>}

          {warnings.map((w) => <p key={w} className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">{w}</p>)}

          <label className="flex items-center gap-2"><input type="checkbox" checked={notifyClient} onChange={(e) => setNotifyClient(e.target.checked)} />Enviar e-mail de confirmação ao cliente</label>
          {order.shipping_method === "card_stack" && <label className="flex items-center gap-2"><input type="checkbox" checked={applyToStack} onChange={(e) => setApplyToStack(e.target.checked)} />Aplicar a todos os pedidos desta pilha</label>}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div> : <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-3"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Atual</p>{currentText}</div>
            <div className="rounded-md border border-primary p-3"><p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">Novo</p>{newText}</div>
          </div>
          {warnings.map((w) => <p key={w} className="text-xs font-semibold text-destructive">{w} — confirmar mesmo assim?</p>)}
          {applyToStack && <p className="text-xs text-muted-foreground">Será aplicado a todos os pedidos desta pilha. O prazo de 30 dias não muda.</p>}
        </div>}

        <DialogFooter>
          {step === "edit"
            ? <><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button disabled={!!error} onClick={() => setStep("review")}>Revisar</Button></>
            : <><Button variant="outline" disabled={busy} onClick={() => setStep("edit")}>Voltar</Button>
                <Button disabled={busy} onClick={submit}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar alteração</Button></>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
