import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createManualOrderFn, searchManualCatalogFn, searchManualCustomersFn } from "@/lib/manual-order.functions";
import {
  MANUAL_PAYMENT_METHODS, MANUAL_SOURCES, manualTotals, validateManualItems,
  type ManualItem, type ManualPaymentMethod, type ManualShippingMode, type ManualSource,
} from "@/lib/manual-order";
import {
  ADMIN_SHIPPING_MODE_LABELS, PICKUP_POINT_LABELS, adminShippingWarnings, validateAdminShippingInput,
  type AdminShippingInput, type PickupPoint,
} from "@/lib/admin-shipping-edit";
import { HAND_DELIVERY_FEE_CENTS, slotsFor, toIso } from "@/lib/scheduling";
import { eventDays, eventSlotsForDay, formatYmd, type PickupEvent } from "@/lib/events";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/order-status";

export const Route = createFileRoute("/admin/pedido-manual")({
  head: () => ({
    meta: [
      { title: "Novo pedido manual · Sevii Admin" },
      { name: "description", content: "Registre vendas combinadas fora do site da Sevii Colecionáveis." },
      { property: "og:title", content: "Novo pedido manual · Sevii Admin" },
      { property: "og:description", content: "Registre vendas combinadas fora do site." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ManualOrderPage,
});

const inp = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm";
const brl = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const toCents = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const MODES: ManualShippingMode[] = ["stack", "pickup", "event", "delivery", "tracked", "later"];
const MODE_LABEL = (m: ManualShippingMode) => m === "later" ? "Definir depois" : m === "stack" ? "Pilha de Cartas" : ADMIN_SHIPPING_MODE_LABELS[m];

type Customer = { userId: string; name: string; email: string; phone: string; activeStack: { startedAt: string; expiresAt: string } | null; address: any };
type Row = ManualItem & { key: string; detail?: string; stock?: number; priceText: string };
const emptyAddr = { cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-border bg-card p-4 space-y-3">
    <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>{children}
  </section>;
}

function ManualOrderPage() {
  const nav = useNavigate();
  const searchCustomers = useServerFn(searchManualCustomersFn);
  const searchCatalog = useServerFn(searchManualCatalogFn);
  const create = useServerFn(createManualOrderFn);

  // Cliente
  const [custQ, setCustQ] = useState("");
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [nc, setNc] = useState({ name: "", email: "", phone: "" });
  const [ncAddr, setNcAddr] = useState({ ...emptyAddr });

  // Itens
  const [catQ, setCatQ] = useState("");
  const [catResults, setCatResults] = useState<any[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [discType, setDiscType] = useState<"fixed" | "percent">("fixed");
  const [discText, setDiscText] = useState("");
  const [discReason, setDiscReason] = useState("");
  const [surText, setSurText] = useState("");
  const [surReason, setSurReason] = useState("");
  const [decrementStock, setDecrementStock] = useState(true);

  // Envio
  const [mode, setMode] = useState<ManualShippingMode>("later");
  const [events, setEvents] = useState<PickupEvent[]>([]);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [pickupPoint, setPickupPoint] = useState<PickupPoint | "">("");
  const [eventId, setEventId] = useState("");
  const [addr, setAddr] = useState({ ...emptyAddr });
  const [deliveryInfo, setDeliveryInfo] = useState("");
  const [feeStatus, setFeeStatus] = useState<"pending" | "confirmed">("pending");
  const [shipText, setShipText] = useState("");

  // Pagamento / origem
  const [payStatus, setPayStatus] = useState<"pending" | "paid">("paid");
  const [payMethod, setPayMethod] = useState<ManualPaymentMethod>("manual_pix");
  const [paidAt, setPaidAt] = useState("");
  const [payNote, setPayNote] = useState("");
  const [status, setStatus] = useState<string>("paid");
  const [source, setSource] = useState<ManualSource>("whatsapp");
  const [internal, setInternal] = useState("");
  const [sendEmail, setSendEmail] = useState(true);

  const [busy, setBusy] = useState(false);
  const [shortages, setShortages] = useState<any[] | null>(null);

  useEffect(() => {
    (supabase as any).from("events").select("*").order("start_date").then(({ data }: any) =>
      setEvents((data ?? []).map((e: any) => ({ ...e, start_time: String(e.start_time).slice(0, 5), end_time: String(e.end_time).slice(0, 5) }))));
  }, []);

  useEffect(() => {
    if (custQ.trim().length < 2) { setCustResults([]); return; }
    const t = setTimeout(() => searchCustomers({ data: { q: custQ } }).then((r) => setCustResults(r as any)).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [custQ]);

  useEffect(() => {
    if (catQ.trim().length < 2) { setCatResults([]); return; }
    const t = setTimeout(() => searchCatalog({ data: { q: catQ } }).then(setCatResults).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [catQ]);

  useEffect(() => { setStatus(payStatus === "paid" ? "paid" : "pending"); }, [payStatus]);

  function pickCustomer(c: Customer) {
    setCustomer(c); setIsNew(false); setCustQ(""); setCustResults([]);
    if (c.address) setAddr({ ...emptyAddr, ...c.address });
    if (c.activeStack) setMode("stack");
  }

  function addCatalog(p: any) {
    setRows((r) => [...r, { key: crypto.randomUUID(), kind: "catalog", cardId: p.cardId, name: p.name, detail: p.detail, stock: p.stock,
      unitPriceCents: p.priceCents, priceText: (p.priceCents / 100).toFixed(2).replace(".", ","), quantity: 1 }]);
    setCatQ(""); setCatResults([]);
  }
  function addCustom() {
    setRows((r) => [...r, { key: crypto.randomUUID(), kind: "custom", cardId: null, name: "", unitPriceCents: 0, priceText: "", quantity: 1 }]);
  }
  const upd = (key: string, patch: Partial<Row>) => setRows((r) => r.map((x) => x.key === key ? { ...x, ...patch } : x));

  const ev = events.find((e) => e.id === eventId) ?? null;
  const at = date && (mode === "delivery" || slot) ? toIso(date, mode === "delivery" ? "19:00" : slot) : null;
  const shippingCents = mode === "tracked" ? toCents(shipText) : 0;
  const shipPayload: AdminShippingInput | null = mode === "later" ? null : {
    mode, at: ["pickup", "event", "delivery"].includes(mode) ? at : null,
    pickupPoint: mode === "pickup" ? (pickupPoint || null) : null,
    eventId: mode === "event" ? eventId || null : null,
    address: mode === "delivery" || mode === "tracked" ? addr : null,
    deliveryInfo: mode === "delivery" ? deliveryInfo : null,
    feeStatus: mode === "delivery" ? feeStatus : null,
    shippingCents: mode === "tracked" ? shippingCents : null,
  };
  const shipError = shipPayload ? validateAdminShippingInput(shipPayload) : null;
  const warnings = useMemo(() => shipPayload ? adminShippingWarnings(shipPayload, ev) : [], [JSON.stringify(shipPayload), ev]);

  const adjustments = {
    discountType: discType, discountValue: discType === "percent" ? Number(discText.replace(",", ".")) || 0 : toCents(discText),
    discountReason: discReason, surchargeCents: toCents(surText), surchargeReason: surReason,
  };
  const items: ManualItem[] = rows.map(({ kind, cardId, name, unitPriceCents, quantity }) => ({ kind, cardId, name, unitPriceCents, quantity }));
  const totals = manualTotals(items, adjustments, shippingCents);
  const lowStock = rows.filter((r) => r.kind === "catalog" && r.stock != null && r.quantity > r.stock);

  const customerError = !customer && !isNew ? "Escolha ou cadastre o cliente."
    : isNew && (!nc.name.trim() || !nc.email.trim()) ? "Informe nome e e-mail do novo cliente." : null;
  const formError = customerError ?? validateManualItems(items) ?? shipError;

  async function submit(confirmStockOverride = false) {
    if (formError) { toast.error(formError); return; }
    setBusy(true);
    try {
      const r: any = await create({ data: {
        customer: customer
          ? { userId: customer.userId, name: customer.name || customer.email, email: customer.email, phone: customer.phone, address: customer.address }
          : { userId: null, name: nc.name, email: nc.email, phone: nc.phone, address: ncAddr },
        items, adjustments, decrementStock, confirmStockOverride,
        shipping: shipPayload ?? { mode: "later" },
        payment: { status: payStatus, method: payMethod, paidAt: paidAt ? new Date(paidAt).toISOString() : null, note: payNote },
        initialStatus: status as any, source, internalNotes: internal, sendEmail,
      } as any });
      if (r.needsStockConfirmation) { setShortages(r.shortages); return; }
      if (!r.ok) { toast.error(r.error); return; }
      setShortages(null);
      toast.success("Pedido manual criado.");
      nav({ to: "/admin/orders/$orderId", params: { orderId: r.orderId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o pedido.");
    } finally { setBusy(false); }
  }

  const A = (s: typeof addr, set: (v: typeof addr) => void, k: keyof typeof addr, ph: string) =>
    <input className={inp} placeholder={ph} value={s[k]} onChange={(e) => set({ ...s, [k]: e.target.value })} />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4">
          <Link to="/admin" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para pedidos
          </Link>
          <span className="text-sm font-bold uppercase tracking-widest">Novo pedido manual</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4 min-w-0">
          <Section title="1. Cliente">
            {customer ? (
              <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{customer.name || "(sem nome)"}</p>
                  <p className="text-xs text-muted-foreground break-all">{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setCustomer(null)}>Trocar</Button>
              </div>
            ) : !isNew ? (
              <div className="space-y-2">
                <input className={inp} placeholder="Buscar por nome, e-mail ou telefone…" value={custQ} onChange={(e) => setCustQ(e.target.value)} />
                {custResults.length > 0 && <div className="rounded-md border border-border divide-y divide-border max-h-64 overflow-y-auto">
                  {custResults.map((c) => (
                    <button key={c.userId} type="button" onClick={() => pickCustomer(c)} className="block w-full text-left px-3 py-2 text-sm hover:bg-secondary">
                      <span className="font-medium">{c.name || "(sem nome)"}</span>
                      <span className="block text-xs text-muted-foreground break-all">{c.email}{c.phone ? ` · ${c.phone}` : ""}{c.activeStack ? " · Pilha ativa" : ""}</span>
                    </button>
                  ))}
                </div>}
                <Button variant="outline" size="sm" onClick={() => setIsNew(true)}><Plus className="h-4 w-4" />Cadastrar novo cliente</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-3">
                  <input className={inp} placeholder="Nome" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
                  <input className={inp} placeholder="E-mail" type="email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
                  <input className={inp} placeholder="Telefone/WhatsApp" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
                </div>
                <p className="text-xs text-muted-foreground">Endereço (opcional)</p>
                <div className="grid gap-2 grid-cols-3">{A(ncAddr, setNcAddr, "cep", "CEP")}{A(ncAddr, setNcAddr, "street", "Rua")}{A(ncAddr, setNcAddr, "number", "Número")}</div>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">{A(ncAddr, setNcAddr, "complement", "Complemento")}{A(ncAddr, setNcAddr, "neighborhood", "Bairro")}{A(ncAddr, setNcAddr, "city", "Cidade")}{A(ncAddr, setNcAddr, "state", "UF")}</div>
                <Button variant="ghost" size="sm" onClick={() => setIsNew(false)}>Buscar cliente existente</Button>
              </div>
            )}
            {customer?.activeStack && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm space-y-2">
                <p>Este cliente tem uma Pilha de Cartas ativa até {new Date(customer.activeStack.expiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" })}.</p>
                {mode !== "stack"
                  ? <Button size="sm" variant="outline" onClick={() => setMode("stack")}>Adicionar este pedido à pilha</Button>
                  : <p className="text-xs text-muted-foreground">O pedido será adicionado a essa pilha. O prazo atual não muda.</p>}
              </div>
            )}
          </Section>

          <Section title="2. Itens do pedido">
            <div className="relative">
              <input className={inp} placeholder="Buscar carta ou produto lacrado…" value={catQ} onChange={(e) => setCatQ(e.target.value)} />
              {catResults.length > 0 && <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg divide-y divide-border max-h-72 overflow-y-auto">
                {catResults.map((p) => (
                  <button key={p.cardId} type="button" onClick={() => addCatalog(p)} className="flex w-full items-center gap-3 text-left px-3 py-2 text-sm hover:bg-secondary">
                    {p.image ? <img src={p.image} alt="" className="h-10 w-7 object-cover rounded" /> : <span className="h-10 w-7 rounded bg-secondary" />}
                    <span className="min-w-0 flex-1"><span className="font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground truncate">{p.detail} · estoque {p.stock}</span></span>
                    <span className="text-xs tabular-nums">{brl(p.priceCents)}</span>
                  </button>
                ))}
              </div>}
            </div>
            {rows.length === 0 && <p className="text-xs text-muted-foreground">Nenhum item adicionado.</p>}
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.key} className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[1fr_110px_80px_auto] items-center">
                  <div className="min-w-0">
                    {r.kind === "custom"
                      ? <input className={inp} placeholder="Nome do item avulso" value={r.name} onChange={(e) => upd(r.key, { name: e.target.value })} />
                      : <><p className="text-sm font-medium truncate">{r.name}</p><p className="text-xs text-muted-foreground truncate">{r.detail} · estoque {r.stock}</p></>}
                  </div>
                  <input className={inp} inputMode="decimal" placeholder="Preço (R$)" value={r.priceText}
                    onChange={(e) => upd(r.key, { priceText: e.target.value, unitPriceCents: toCents(e.target.value) })} />
                  <input className={inp} type="number" min={1} value={r.quantity} onChange={(e) => upd(r.key, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
                  <Button variant="ghost" size="icon" aria-label="Remover item" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addCustom}><Plus className="h-4 w-4" />Item avulso</Button>
            <p className="text-xs text-muted-foreground">Alterar o preço aqui não muda o preço do catálogo.</p>
            <div className="grid gap-2 sm:grid-cols-[130px_1fr_2fr]">
              <select className={inp} value={discType} onChange={(e) => setDiscType(e.target.value as any)}>
                <option value="fixed">Desconto (R$)</option><option value="percent">Desconto (%)</option>
              </select>
              <input className={inp} inputMode="decimal" placeholder={discType === "percent" ? "%" : "R$"} value={discText} onChange={(e) => setDiscText(e.target.value)} />
              <input className={inp} placeholder="Motivo do desconto" value={discReason} onChange={(e) => setDiscReason(e.target.value)} />
            </div>
            <div className="grid gap-2 sm:grid-cols-[130px_1fr_2fr]">
              <span className="text-sm self-center">Acréscimo (R$)</span>
              <input className={inp} inputMode="decimal" placeholder="R$" value={surText} onChange={(e) => setSurText(e.target.value)} />
              <input className={inp} placeholder="Motivo do acréscimo" value={surReason} onChange={(e) => setSurReason(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={decrementStock} onChange={(e) => setDecrementStock(e.target.checked)} />Baixar do estoque</label>
            {decrementStock && lowStock.length > 0 && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
              Estoque insuficiente: {lowStock.map((r) => `${r.name} (pedido ${r.quantity}, estoque ${r.stock})`).join("; ")}
            </p>}
          </Section>

          <Section title="3. Envio / retirada">
            <div className="grid gap-1.5 sm:grid-cols-2">
              {MODES.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="mode" checked={mode === m} onChange={() => { setMode(m); setSlot(""); }} />{MODE_LABEL(m)}
                </label>
              ))}
            </div>
            {mode === "pickup" && <div className="grid gap-2 sm:grid-cols-3">
              <select className={inp} value={pickupPoint} onChange={(e) => setPickupPoint(e.target.value as PickupPoint)}>
                <option value="">Local da retirada…</option>
                {(Object.keys(PICKUP_POINT_LABELS) as PickupPoint[]).map((k) => <option key={k} value={k}>{PICKUP_POINT_LABELS[k]}</option>)}
              </select>
              <input type="date" className={inp} value={date} onChange={(e) => setDate(e.target.value)} />
              <select className={inp} value={slot} onChange={(e) => setSlot(e.target.value)}>
                <option value="">Horário…</option>{slotsFor("pickup").map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>}
            {mode === "event" && <div className="grid gap-2 sm:grid-cols-3">
              <select className={inp} value={eventId} onChange={(e) => { setEventId(e.target.value); setDate(""); setSlot(""); }}>
                <option value="">Evento…</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.name} — {formatYmd(e.start_date)}{e.active ? "" : " (inativo)"}</option>)}
              </select>
              {ev && <select className={inp} value={date} onChange={(e) => { setDate(e.target.value); setSlot(""); }}>
                <option value="">Dia…</option>{eventDays(ev).map((d) => <option key={d} value={d}>{formatYmd(d)}</option>)}
              </select>}
              {ev && date && <select className={inp} value={slot} onChange={(e) => setSlot(e.target.value)}>
                <option value="">Horário…</option>{eventSlotsForDay(ev, date).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>}
            </div>}
            {mode === "delivery" && <div className="space-y-2">
              <label className="block text-xs text-muted-foreground">Quinta-feira da entrega (a partir das 19h) · taxa de {brl(HAND_DELIVERY_FEE_CENTS)} via Pix, por fora</label>
              <input type="date" className={inp} value={date} onChange={(e) => setDate(e.target.value)} />
              <div className="grid grid-cols-3 gap-2">{A(addr, setAddr, "street", "Rua")}{A(addr, setAddr, "number", "Número")}{A(addr, setAddr, "complement", "Complemento")}</div>
              <div className="grid grid-cols-3 gap-2">{A(addr, setAddr, "neighborhood", "Bairro")}{A(addr, setAddr, "city", "Cidade")}{A(addr, setAddr, "state", "UF")}</div>
              <textarea className={inp} placeholder="Informações adicionais" value={deliveryInfo} onChange={(e) => setDeliveryInfo(e.target.value)} />
              <select className={inp} value={feeStatus} onChange={(e) => setFeeStatus(e.target.value as any)}>
                <option value="pending">Pix de R$ 15 — Pendente</option><option value="confirmed">Pix de R$ 15 — Pago</option>
              </select>
            </div>}
            {mode === "tracked" && <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">{A(addr, setAddr, "cep", "CEP")}{A(addr, setAddr, "street", "Rua")}{A(addr, setAddr, "number", "Número")}</div>
              <div className="grid grid-cols-2 gap-2">{A(addr, setAddr, "complement", "Complemento")}{A(addr, setAddr, "neighborhood", "Bairro")}</div>
              <div className="grid grid-cols-2 gap-2">{A(addr, setAddr, "city", "Cidade")}{A(addr, setAddr, "state", "UF")}</div>
              <input className={inp} inputMode="decimal" placeholder="Valor do frete (R$)" value={shipText} onChange={(e) => setShipText(e.target.value)} />
            </div>}
            {mode === "later" && <p className="text-xs text-muted-foreground">O pedido fica sem modalidade até ser editado em "Editar envio/retirada".</p>}
            {warnings.map((w) => <p key={w} className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">{w}</p>)}
            {shipError && <p className="text-xs text-destructive">{shipError}</p>}
          </Section>

          <Section title="4. Pagamento e status">
            <div className="grid gap-2 sm:grid-cols-3">
              <select className={inp} value={payStatus} onChange={(e) => setPayStatus(e.target.value as any)}>
                <option value="paid">Pagamento: Pago</option><option value="pending">Pagamento: Pendente</option>
              </select>
              <select className={inp} value={payMethod} onChange={(e) => setPayMethod(e.target.value as ManualPaymentMethod)}>
                {(Object.keys(MANUAL_PAYMENT_METHODS) as ManualPaymentMethod[]).map((k) => <option key={k} value={k}>{MANUAL_PAYMENT_METHODS[k]}</option>)}
              </select>
              <select className={inp} value={status} onChange={(e) => setStatus(e.target.value)}>
                {ORDER_STATUSES.map((s) => <option key={s} value={s}>Status: {ORDER_STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
              <input type="datetime-local" className={inp} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} aria-label="Data do pagamento" />
              <input className={inp} placeholder="Observação do pagamento (ex: comprovante recebido no WhatsApp)" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
            </div>
          </Section>

          <Section title="5. Origem e observações">
            <select className={inp} value={source} onChange={(e) => setSource(e.target.value as ManualSource)}>
              {(Object.keys(MANUAL_SOURCES) as ManualSource[]).map((k) => <option key={k} value={k}>Origem: {MANUAL_SOURCES[k]}</option>)}
            </select>
            <textarea className={inp} rows={3} placeholder="Observações internas (visível só para o admin)" value={internal} onChange={(e) => setInternal(e.target.value)} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />Enviar e-mail de confirmação ao cliente</label>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-4 h-fit rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Resumo</h2>
          <p className="truncate">{customer ? (customer.name || customer.email) : isNew ? (nc.name || "Novo cliente") : "Sem cliente"}</p>
          <p className="text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? "item" : "itens"} · {MODE_LABEL(mode)}</p>
          <div className="border-t border-border pt-2 space-y-1 tabular-nums">
            <div className="flex justify-between"><span>Subtotal</span><span>{brl(totals.subtotal)}</span></div>
            {totals.discount > 0 && <div className="flex justify-between"><span>Desconto</span><span>- {brl(totals.discount)}</span></div>}
            {totals.surcharge > 0 && <div className="flex justify-between"><span>Acréscimo</span><span>{brl(totals.surcharge)}</span></div>}
            {totals.shipping > 0 && <div className="flex justify-between"><span>Frete</span><span>{brl(totals.shipping)}</span></div>}
            <div className="flex justify-between font-bold text-base border-t border-border pt-1"><span>Total</span><span>{brl(totals.total)}</span></div>
            {mode === "delivery" && <p className="text-xs text-muted-foreground">+ taxa de entrega de {brl(HAND_DELIVERY_FEE_CENTS)} por fora</p>}
          </div>
          <p className="text-xs text-muted-foreground">{payStatus === "paid" ? "Pago" : "Pagamento pendente"} · {MANUAL_PAYMENT_METHODS[payMethod]} · {ORDER_STATUS_LABELS[status]}</p>
          {formError && <p className="text-xs text-destructive">{formError}</p>}
          <Button className="w-full" disabled={busy || !!formError} onClick={() => submit(false)}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Criar pedido
          </Button>
        </aside>
      </main>

      <Dialog open={!!shortages} onOpenChange={(v) => !busy && !v && setShortages(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estoque insuficiente</DialogTitle>
            <DialogDescription>Os itens abaixo têm menos estoque do que o pedido. Deseja continuar mesmo assim?</DialogDescription>
          </DialogHeader>
          <ul className="text-sm space-y-1">
            {(shortages ?? []).map((s) => <li key={s.cardId}>{s.name}: pedido {s.requested}, estoque {s.available}</li>)}
          </ul>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setShortages(null)}>Voltar</Button>
            <Button disabled={busy} onClick={() => submit(true)}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Continuar mesmo assim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
