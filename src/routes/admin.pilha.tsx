import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImageOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { adminUpdateServiceOrder, adminRestoreItemToStack, adminCheckServiceOrderPayment } from "@/lib/service-orders-admin.functions";
import {
  adminGetPilhaData,
  adminAdjustStackItem,
  adminAddOrderToStack,
  adminCreateManualServiceOrder,
  adminBulkDeleteStackItems,
  type AdminServiceOrder,
  type AdminStack,
  type AdminStackItem,
} from "@/lib/admin-pilha.functions";


export const Route = createFileRoute("/admin/pilha")({
  head: () => ({ meta: [{ title: "Pilha de Cartas — Sevii Admin" }] }),
  component: AdminPilhaPage,
});

const METHOD_LABEL: Record<string, string> = {
  correios: "Envio Correios",
  app: "Envio por App",
  arte_em_cards: "Retirada Arte em Cards",
  evento: "Retirada em Evento",
  presencial: "Retirada Presencial",
};

const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Aguardando pagamento",
  paid: "Pago",
  preparing: "Em preparação",
  dispatched: "Despachado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_STYLE: Record<string, string> = {
  awaiting_payment: "bg-amber-100 text-amber-800",
  paid: "bg-orange-100 text-orange-800",
  preparing: "bg-purple-100 text-purple-800",
  dispatched: "bg-blue-100 text-blue-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-zinc-200 text-zinc-700",
};

const STATUS_OPTIONS = ["paid", "preparing", "dispatched", "delivered", "cancelled"] as const;
const ALL_OS_STATUSES = ["awaiting_payment", "paid", "preparing", "dispatched", "delivered", "cancelled"] as const;
const DEFAULT_OS_STATUSES: readonly string[] = ["paid", "preparing", "dispatched", "delivered"];

const fmtMoney = (cents: number) =>
  `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const daysBetween = (a: Date, b: Date) =>
  Math.ceil((b.getTime() - a.getTime()) / 86_400_000);

function Thumb({ item }: { item: AdminStackItem }) {
  if (!item.card_image) {
    return (
      <div className="h-16 w-12 rounded-md bg-muted grid place-items-center text-muted-foreground">
        <ImageOff className="h-4 w-4" />
      </div>
    );
  }
  return (
    <img
      src={item.card_image}
      alt={item.card_name}
      loading="lazy"
      className="h-16 w-12 object-cover rounded-md border border-border bg-muted"
    />
  );
}

function ItemRow({
  item,
  onAdjust,
  onRemove,
  onRestore,
}: {
  item: AdminStackItem;
  onAdjust?: (newQty: number) => void | Promise<void>;
  onRemove?: () => void | Promise<void>;
  onRestore?: () => void | Promise<void>;
}) {
  const meta = [item.collection, item.card_number, item.finish, item.language, item.condition]
    .filter(Boolean)
    .join(" · ");
  const editable = Boolean(onAdjust || onRemove || onRestore);
  return (
    <li className="flex gap-3 py-2">
      <Thumb item={item} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">
          {item.quantity}× {item.card_name}
        </p>
        {meta && <p className="text-xs text-muted-foreground truncate">{meta}</p>}
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {item.auction_name
            ? <>🔨 Leilão: {item.auction_name}{item.auction_date ? ` · ${new Date(item.auction_date + "T00:00:00").toLocaleDateString("pt-BR")}` : ""}</>
            : item.order_id
              ? <>Pedido <span className="font-mono">#{item.order_id.slice(0, 8)}</span></>
              : null}
          {item.unit_price_cents > 0 && (
            <> · {fmtMoney(item.unit_price_cents)} un.</>
          )}
        </p>
        {editable && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {onAdjust && item.quantity > 1 && (
              <button
                onClick={() => onAdjust(item.quantity - 1)}
                className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-semibold hover:bg-secondary"
                title="Cliente retirou 1"
              >
                −1 (retirou)
              </button>
            )}
            {onAdjust && (
              <button
                onClick={() => {
                  const v = window.prompt(
                    `Nova quantidade para "${item.card_name}" (0 remove):`,
                    String(item.quantity),
                  );
                  if (v == null) return;
                  const n = parseInt(v, 10);
                  if (!Number.isFinite(n) || n < 0) return;
                  onAdjust(n);
                }}
                className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-semibold hover:bg-secondary"
              >
                Editar qtd
              </button>
            )}
            {onRemove && (
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Remover "${item.card_name}" (${item.quantity}×) da pilha? Esta ação não pode ser desfeita.`,
                    )
                  )
                    onRemove();
                }}
                className="rounded-md border border-destructive/40 text-destructive bg-background px-2 py-0.5 text-[11px] font-semibold hover:bg-destructive/10"
              >
                Excluir
              </button>
            )}
            {onRestore && (
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Devolver "${item.card_name}" (${item.quantity}×) para a pilha do cliente? O item sairá desta ordem de serviço.`,
                    )
                  )
                    onRestore();
                }}
                className="rounded-md border border-primary/40 text-primary bg-background px-2 py-0.5 text-[11px] font-semibold hover:bg-primary/10"
              >
                ↩ Devolver à pilha
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function AdminPilhaPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"orders" | "stacks">("orders");
  const [data, setData] = useState<{ serviceOrders: AdminServiceOrder[]; stacks: AdminStack[]; exampleOrderId: string | null }>({
    serviceOrders: [],
    stacks: [],
    exampleOrderId: null,
  });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const update = useServerFn(adminUpdateServiceOrder);
  const restoreItem = useServerFn(adminRestoreItemToStack);
  const checkPayment = useServerFn(adminCheckServiceOrderPayment);
  const [checkingPayment, setCheckingPayment] = useState<string | null>(null);
  const fetchData = useServerFn(adminGetPilhaData);
  const adjustStackItem = useServerFn(adminAdjustStackItem);
  const addOrderToStack = useServerFn(adminAddOrderToStack);
  const createManualOS = useServerFn(adminCreateManualServiceOrder);
  const bulkDeleteStackItems = useServerFn(adminBulkDeleteStackItems);
  const [orderInput, setOrderInput] = useState("");
  const [addingOrder, setAddingOrder] = useState(false);
  const [stackSelected, setStackSelected] = useState<Record<string, Set<string>>>({});
  const [stackMethod, setStackMethod] = useState<Record<string, "correios" | "app" | "arte_em_cards" | "presencial" | "evento">>({});
  const [stackStatus, setStackStatus] = useState<Record<string, "paid" | "preparing" | "dispatched" | "delivered">>({});
  const [stackBusy, setStackBusy] = useState<string | null>(null);
  const [selectedOSStatuses, setSelectedOSStatuses] = useState<string[]>(() => {
    if (typeof window === "undefined") return [...DEFAULT_OS_STATUSES];
    const raw = localStorage.getItem("admin-pilha-os-filter-v1");
    if (!raw) return [...DEFAULT_OS_STATUSES];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [...DEFAULT_OS_STATUSES];
  });
  const [showEmptyStacks, setShowEmptyStacks] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("admin-pilha-show-empty") === "1";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("admin-pilha-os-filter-v1", JSON.stringify(selectedOSStatuses));
    }
  }, [selectedOSStatuses]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("admin-pilha-show-empty", showEmptyStacks ? "1" : "0");
    }
  }, [showEmptyStacks]);

  const toggleOSStatus = (s: string) =>
    setSelectedOSStatuses((curr) => (curr.includes(s) ? curr.filter((x) => x !== s) : [...curr, s]));

  const filteredServiceOrders = useMemo(
    () => data.serviceOrders.filter((o) => selectedOSStatuses.includes(o.status)),
    [data.serviceOrders, selectedOSStatuses],
  );
  const visibleStacks = useMemo(
    () => (showEmptyStacks ? data.stacks : data.stacks.filter((s) => s.items.length > 0)),
    [data.stacks, showEmptyStacks],
  );
  const hiddenEmptyCount = data.stacks.length - data.stacks.filter((s) => s.items.length > 0).length;

  function toggleStackItem(stackId: string, itemId: string) {
    setStackSelected((prev) => {
      const cur = new Set(prev[stackId] ?? []);
      if (cur.has(itemId)) cur.delete(itemId);
      else cur.add(itemId);
      return { ...prev, [stackId]: cur };
    });
  }

  function toggleAllStackItems(stackId: string, ids: string[]) {
    setStackSelected((prev) => {
      const cur = prev[stackId] ?? new Set<string>();
      const allOn = ids.every((id) => cur.has(id));
      return { ...prev, [stackId]: allOn ? new Set() : new Set(ids) };
    });
  }

  async function handleCreateManualOS(stackId: string, allIds: string[]) {
    const selected = stackSelected[stackId];
    const ids = selected && selected.size > 0 ? Array.from(selected) : allIds;
    if (ids.length === 0) {
      toast.error("Nenhum item selecionado.");
      return;
    }
    const method = stackMethod[stackId] ?? "presencial";
    const status = stackStatus[stackId] ?? "delivered";
    const label =
      status === "delivered" ? "marcar como entregue" : status === "dispatched" ? "marcar como despachado" : "marcar como pago";
    if (!window.confirm(`Criar OS manual (${METHOD_LABEL[method]}) e ${label} para ${ids.length} item(ns)?`)) return;
    setStackBusy(stackId);
    try {
      const res = await createManualOS({ data: { stackId, itemIds: ids, method, status } });
      toast.success(`OS #${res.code} criada.`);
      setStackSelected((p) => ({ ...p, [stackId]: new Set() }));
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao criar OS.");
    } finally {
      setStackBusy(null);
    }
  }

  async function handleBulkDelete(stackId: string) {
    const selected = stackSelected[stackId];
    const ids = selected ? Array.from(selected) : [];
    if (ids.length === 0) {
      toast.error("Selecione ao menos 1 item para excluir.");
      return;
    }
    if (
      !window.confirm(
        `Excluir definitivamente ${ids.length} item(ns) da pilha? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setStackBusy(stackId);
    try {
      const res = await bulkDeleteStackItems({ data: { stackId, itemIds: ids } });
      toast.success(`${res.deleted} item(ns) excluído(s) da pilha.`);
      setStackSelected((p) => ({ ...p, [stackId]: new Set() }));
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir itens.");
    } finally {
      setStackBusy(null);
    }
  }


  async function handleAddOrder() {
    const v = orderInput.trim();
    if (v.length < 4) {
      toast.error("Informe pelo menos 4 caracteres do ID do pedido.");
      return;
    }
    setAddingOrder(true);
    try {
      const res = await addOrderToStack({ data: { orderIdOrPrefix: v } });
      toast.success(`${res.addedCount} item(ns) adicionado(s) à pilha.`);
      setOrderInput("");
      await load();
      setTab("stacks");
      setExpanded((prev) => new Set(prev).add(res.stackId));
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao adicionar pedido à pilha.");
    } finally {
      setAddingOrder(false);
    }
  }

  async function handleAdjustItem(itemId: string, newQuantity: number, name: string) {
    try {
      const res = await adjustStackItem({ data: { itemId, newQuantity } });
      toast.success(res.removed ? `"${name}" removida da pilha.` : "Quantidade atualizada.");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao atualizar item.");
    }
  }

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchData();
      setData(res);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const ch = supabase
      .channel("admin-service-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "card_stacks" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "card_stack_items" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [isAdmin]);

  const pendingCount = useMemo(
    () => data.serviceOrders.filter((o) => o.status === "paid").length,
    [data.serviceOrders],
  );

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function patch(id: string, body: {
    serviceOrderId: string;
    status?: "paid" | "preparing" | "dispatched" | "delivered" | "cancelled";
    carrier?: "correios" | "latam" | "pickup" | null;
    trackingCode?: string | null;
    trackingUrl?: string | null;
  }) {
    try {
      await update({ data: body });
      toast.success("Atualizado.");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao atualizar.");
    }
  }

  if (authLoading)
    return <div className="min-h-screen grid place-items-center text-sm">Carregando...</div>;
  if (!isAdmin)
    return <div className="min-h-screen grid place-items-center text-sm">Acesso negado.</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4">
          <Link to="/admin" className="text-sm font-bold uppercase tracking-widest">
            ← Admin · Pilha de Cartas
          </Link>
          {pendingCount > 0 && (
            <span className="rounded-full bg-orange-500 text-white px-3 py-1 text-xs font-semibold">
              {pendingCount} OS para preparar
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => setTab("orders")}
            className={`px-3 py-1.5 rounded-full font-semibold ${
              tab === "orders" ? "bg-foreground text-background" : "bg-secondary"
            }`}
          >
            Ordens de Serviço ({filteredServiceOrders.length}
            {filteredServiceOrders.length !== data.serviceOrders.length ? `/${data.serviceOrders.length}` : ""})
          </button>
          <button
            onClick={() => setTab("stacks")}
            className={`px-3 py-1.5 rounded-full font-semibold ${
              tab === "stacks" ? "bg-foreground text-background" : "bg-secondary"
            }`}
          >
            Pilhas Ativas ({visibleStacks.length}
            {visibleStacks.length !== data.stacks.length ? `/${data.stacks.length}` : ""})
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-widest mb-1">
            Adicionar pedido anterior à pilha
          </p>
          <p className="text-[11px] text-muted-foreground mb-3">
            Cole o ID do pedido (UUID completo ou os primeiros 8+ caracteres). O pedido precisa estar
            pago. Os itens serão lançados na pilha ativa do cliente — se não houver, uma nova será
            criada com 30 dias.
            {data.exampleOrderId && (
              <>
                {" "}Exemplo: <span className="font-mono font-semibold text-foreground">{data.exampleOrderId}</span>
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={orderInput}
              onChange={(e) => setOrderInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddOrder();
              }}
              placeholder={data.exampleOrderId ? `ex.: ${data.exampleOrderId.slice(0, 8)} ou UUID completo` : "ex.: 3f2a1b9c ou UUID completo"}
              className="flex-1 min-w-[220px] rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
              disabled={addingOrder}
            />
            <button
              onClick={handleAddOrder}
              disabled={addingOrder || orderInput.trim().length < 4}
              className="rounded-md bg-foreground text-background px-4 py-2 text-xs font-semibold uppercase tracking-wide disabled:opacity-40"
            >
              {addingOrder ? "Adicionando..." : "Adicionar à pilha"}
            </button>
          </div>
        </div>



        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : tab === "orders" ? (
          <>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Filtrar por status
                </p>
                <div className="flex gap-2 text-[10px]">
                  <button
                    onClick={() => setSelectedOSStatuses([...ALL_OS_STATUSES])}
                    className="text-foreground hover:underline font-semibold"
                  >
                    Todos
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    onClick={() => setSelectedOSStatuses([])}
                    className="text-foreground hover:underline font-semibold"
                  >
                    Nenhum
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {ALL_OS_STATUSES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedOSStatuses.includes(s)}
                      onChange={() => toggleOSStatus(s)}
                      className="h-4 w-4 rounded border-border accent-foreground"
                    />
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[s] ?? "bg-secondary"}`}>
                      {STATUS_LABEL[s] ?? s}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {filteredServiceOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {data.serviceOrders.length === 0
                  ? "Nenhuma ordem de serviço."
                  : "Nenhuma ordem de serviço corresponde aos filtros."}
              </p>
            ) : (
            <div className="space-y-4">
              {filteredServiceOrders.map((o) => {
                const open = expanded.has(o.id);
                const totalCards = o.items.reduce((s, i) => s + i.quantity, 0);
                return (
                  <div key={o.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs text-muted-foreground font-mono">OS #{o.code}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[o.status] ?? "bg-secondary"}`}>
                              {STATUS_LABEL[o.status] ?? o.status}
                            </span>
                          </div>
                          <p className="text-sm font-semibold mt-1">
                            {o.customer_name ?? o.recipient_name ?? "Cliente"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {o.customer_email ?? ""} · {METHOD_LABEL[o.method] ?? o.method}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(o.created_at).toLocaleString("pt-BR")} · {fmtMoney(o.amount_cents)} · {totalCards} carta(s)
                          </p>
                          {o.arte_em_cards_code && (
                            <p className="text-xs text-green-700 font-semibold mt-1">
                              Código Arte em Cards: {o.arte_em_cards_code}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <select
                            value={o.status}
                            onChange={(e) =>
                              patch(o.id, { serviceOrderId: o.id, status: e.target.value as any })
                            }
                            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold"
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                          {o.status === "awaiting_payment" && (
                            <button
                              type="button"
                              disabled={checkingPayment === o.id}
                              onClick={async () => {
                                setCheckingPayment(o.id);
                                try {
                                  const res = await checkPayment({ data: { serviceOrderId: o.id } });
                                  if (res.status === "approved") {
                                    toast.success(res.message);
                                    await load();
                                  } else {
                                    toast.message(res.message);
                                  }
                                } catch (e: any) {
                                  toast.error(e?.message ?? "Erro ao consultar pagamento.");
                                } finally {
                                  setCheckingPayment(null);
                                }
                              }}
                              className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-1 text-[11px] font-semibold hover:bg-amber-100 disabled:opacity-50"
                            >
                              {checkingPayment === o.id ? "Consultando..." : "Verificar pagamento"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Thumbnails preview row */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        {o.items.slice(0, 8).map((it) => (
                          <div key={it.id} className="relative">
                            <Thumb item={it} />
                            {it.quantity > 1 && (
                              <span className="absolute -top-1 -right-1 bg-foreground text-background text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 grid place-items-center">
                                ×{it.quantity}
                              </span>
                            )}
                          </div>
                        ))}
                        {o.items.length > 8 && (
                          <div className="h-16 w-12 rounded-md bg-secondary grid place-items-center text-xs font-bold">
                            +{o.items.length - 8}
                          </div>
                        )}
                      </div>

                      {o.method === "correios" &&
                        (o.status === "paid" || o.status === "preparing" || o.status === "dispatched") && (
                          <TrackingForm
                            order={o}
                            onSave={(carrier, code, url) =>
                              patch(o.id, {
                                serviceOrderId: o.id,
                                status: "dispatched",
                                carrier,
                                trackingCode: code,
                                trackingUrl: url,
                              })
                            }
                          />
                        )}

                      <button
                        onClick={() => toggle(o.id)}
                        className="mt-2 text-xs font-semibold text-foreground/80 hover:underline"
                      >
                        {open ? "Ocultar detalhes" : `Ver todas as ${o.items.length} carta(s) e endereço`}
                      </button>
                    </div>

                    {open && (
                      <div className="border-t border-border bg-secondary/30 px-5 py-4 grid md:grid-cols-2 gap-6">
                        {o.method !== "arte_em_cards" && o.recipient_name && (
                          <div>
                            <p className="text-xs uppercase font-semibold text-muted-foreground mb-1">
                              {o.method === "app" ? "Contato" : "Endereço"}
                            </p>
                            <p className="text-sm">{o.recipient_name}</p>
                            {o.phone && <p className="text-xs">{o.phone}</p>}
                            {o.method === "correios" && (
                              <>
                                <p className="text-xs">
                                  {o.street}, {o.number}
                                  {o.complement ? ` — ${o.complement}` : ""}
                                </p>
                                <p className="text-xs">
                                  {o.neighborhood} · {o.city}/{o.state}
                                </p>
                                <p className="text-xs">CEP: {o.cep}</p>
                              </>
                            )}
                          </div>
                        )}
                        <div>
                          <p className="text-xs uppercase font-semibold text-muted-foreground mb-1">
                            Itens ({o.items.length})
                          </p>
                          <ul className="divide-y divide-border">
                            {o.items.map((it) => (
                              <ItemRow
                                key={it.id}
                                item={it}
                                onRestore={async () => {
                                  try {
                                    await restoreItem({ data: { itemId: it.id } });
                                    toast.success("Item devolvido à pilha do cliente.");
                                    await load();
                                  } catch (e: any) {
                                    toast.error(e?.message ?? "Falha ao devolver item.");
                                  }
                                }}
                              />
                            ))}
                          </ul>
                        </div>
                        {o.notes && (
                          <p className="md:col-span-2 text-xs italic text-muted-foreground">
                            Obs: {o.notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </>
        ) : visibleStacks.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              {data.stacks.length === 0
                ? "Nenhuma pilha ativa."
                : "Nenhuma pilha com cartas no momento."}
            </p>
            {hiddenEmptyCount > 0 && (
              <label className="mt-2 inline-flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showEmptyStacks}
                  onChange={(e) => setShowEmptyStacks(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-foreground"
                />
                Mostrar pilhas vazias ({hiddenEmptyCount})
              </label>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {hiddenEmptyCount > 0 && (
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none rounded-lg border border-border bg-card px-3 py-2">
                <input
                  type="checkbox"
                  checked={showEmptyStacks}
                  onChange={(e) => setShowEmptyStacks(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-foreground"
                />
                Mostrar pilhas vazias ({hiddenEmptyCount} oculta{hiddenEmptyCount === 1 ? "" : "s"})
              </label>
            )}
            {visibleStacks.map((s) => {
              const now = new Date();
              const exp = new Date(s.expires_at);
              const days = daysBetween(now, exp);
              const crit = days <= 2;
              const warn = days <= 7;
              const totalCards = s.items.reduce((a, i) => a + i.quantity, 0);
              const open = expanded.has(s.id);
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border bg-card overflow-hidden ${
                    crit ? "border-red-400" : warn ? "border-orange-400" : "border-border"
                  }`}
                >
                  <div className="p-5">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-muted-foreground">
                          Pilha {s.id.slice(0, 8)}
                        </p>
                        <p className="text-base font-semibold">
                          {s.customer_name ?? "Cliente sem nome"}
                        </p>
                        {s.customer_email && (
                          <p className="text-xs text-muted-foreground">{s.customer_email}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Iniciada {new Date(s.started_at).toLocaleDateString("pt-BR")} · Vence{" "}
                          {exp.toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div
                        className={`text-right text-sm font-bold ${
                          crit ? "text-red-600" : warn ? "text-orange-600" : ""
                        }`}
                      >
                        {days > 0 ? `${days} dia${days === 1 ? "" : "s"} restantes` : "Vencida"}
                        <div className="text-xs font-normal text-muted-foreground">
                          {totalCards} carta(s) · {s.items.length} linha(s)
                        </div>
                      </div>
                    </div>

                    {/* Thumbnails preview */}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {s.items.slice(0, 10).map((it) => (
                        <div key={it.id} className="relative">
                          <Thumb item={it} />
                          {it.quantity > 1 && (
                            <span className="absolute -top-1 -right-1 bg-foreground text-background text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 grid place-items-center">
                              ×{it.quantity}
                            </span>
                          )}
                        </div>
                      ))}
                      {s.items.length > 10 && (
                        <div className="h-16 w-12 rounded-md bg-secondary grid place-items-center text-xs font-bold">
                          +{s.items.length - 10}
                        </div>
                      )}
                      {s.items.length === 0 && (
                        <p className="text-xs text-muted-foreground">Nenhuma carta armazenada.</p>
                      )}
                    </div>

                    {s.items.length > 0 && (
                      <button
                        onClick={() => toggle(s.id)}
                        className="mt-3 text-xs font-semibold hover:underline"
                      >
                        {open ? "Ocultar lista" : "Ver lista completa"}
                      </button>
                    )}
                  </div>
                  {open && s.items.length > 0 && (
                    <div className="border-t border-border bg-secondary/30 px-5 py-3 space-y-3">
                      {(() => {
                        const ids = s.items.map((i) => i.id);
                        const sel = stackSelected[s.id] ?? new Set<string>();
                        const allOn = ids.length > 0 && ids.every((id) => sel.has(id));
                        return (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                              <input
                                type="checkbox"
                                checked={allOn}
                                onChange={() => toggleAllStackItems(s.id, ids)}
                              />
                              Selecionar todas ({sel.size}/{ids.length})
                            </label>
                            {sel.size > 0 && (
                              <button
                                disabled={stackBusy === s.id}
                                onClick={() => handleBulkDelete(s.id)}
                                className="rounded-md border border-destructive/40 text-destructive bg-background px-3 py-1 text-xs font-semibold hover:bg-destructive/10 disabled:opacity-40"
                              >
                                Excluir {sel.size} selecionado{sel.size > 1 ? "s" : ""} da pilha
                              </button>
                            )}
                          </div>
                        );
                      })()}
                      <ul className="divide-y divide-border">
                        {s.items.map((it) => {
                          const sel = stackSelected[s.id]?.has(it.id) ?? false;
                          return (
                            <li key={it.id} className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={sel}
                                onChange={() => toggleStackItem(s.id, it.id)}
                                className="mt-4"
                              />
                              <div className="flex-1">
                                <ItemRow
                                  item={it}
                                  onAdjust={(q) => handleAdjustItem(it.id, q, it.card_name)}
                                  onRemove={() => handleAdjustItem(it.id, 0, it.card_name)}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      <div className="rounded-md border border-border bg-background p-3">
                        <p className="text-[11px] uppercase font-bold tracking-widest mb-2">
                          Criar OS manual (WhatsApp / atendimento)
                        </p>
                        <p className="text-[11px] text-muted-foreground mb-2">
                          Se nenhum item estiver selecionado, todos serão incluídos.
                        </p>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="text-xs">
                            <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                              Método
                            </span>
                            <select
                              value={stackMethod[s.id] ?? "presencial"}
                              onChange={(e) =>
                                setStackMethod((p) => ({ ...p, [s.id]: e.target.value as any }))
                              }
                              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                            >
                              <option value="presencial">Retirada Presencial</option>
                              <option value="arte_em_cards">Retirada Arte em Cards</option>
                              <option value="app">Envio por App</option>
                              <option value="correios">Envio Correios</option>
                            </select>
                          </label>
                          <label className="text-xs">
                            <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                              Status
                            </span>
                            <select
                              value={stackStatus[s.id] ?? "delivered"}
                              onChange={(e) =>
                                setStackStatus((p) => ({ ...p, [s.id]: e.target.value as any }))
                              }
                              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                            >
                              <option value="delivered">Entregue</option>
                              <option value="dispatched">Despachado</option>
                              <option value="preparing">Em preparação</option>
                              <option value="paid">Pago</option>
                            </select>
                          </label>
                          <button
                            disabled={stackBusy === s.id}
                            onClick={() =>
                              handleCreateManualOS(
                                s.id,
                                s.items.map((i) => i.id),
                              )
                            }
                            className="rounded-md bg-foreground text-background px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                          >
                            {stackBusy === s.id ? "Criando..." : "Criar OS"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function TrackingForm({
  order,
  onSave,
}: {
  order: AdminServiceOrder;
  onSave: (
    carrier: "correios" | "latam" | "pickup",
    code: string | null,
    url: string | null,
  ) => void;
}) {
  const [carrier, setCarrier] = useState<"correios" | "latam">(
    order.carrier === "latam" ? "latam" : "correios",
  );
  const [code, setCode] = useState<string>(order.tracking_code ?? "");
  const [url, setUrl] = useState<string>(order.tracking_url ?? "");

  return (
    <div className="mt-2 rounded-md border border-border p-3 bg-secondary/40 flex flex-wrap items-end gap-2">
      <label className="text-xs">
        <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
          Transportadora
        </span>
        <select
          value={carrier}
          onChange={(e) => setCarrier(e.target.value as any)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="correios">Correios</option>
          <option value="latam">LATAM Cargo</option>
        </select>
      </label>
      <label className="text-xs flex-1 min-w-[160px]">
        <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
          Código de rastreio
        </span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          placeholder="BR123..."
        />
      </label>
      {carrier === "latam" && (
        <label className="text-xs flex-1 min-w-[200px]">
          <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
            URL rastreio
          </span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
            placeholder="https://..."
          />
        </label>
      )}
      <button
        onClick={() =>
          onSave(
            carrier,
            code.trim() || null,
            carrier === "latam"
              ? url.trim() || null
              : "https://rastreamento.correios.com.br/app/index.php",
          )
        }
        className="rounded-md bg-foreground text-background px-3 py-1.5 text-xs font-semibold"
      >
        Salvar e despachar
      </button>
    </div>
  );
}
