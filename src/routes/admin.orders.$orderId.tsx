import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  approveOrderCancellation,
  rejectOrderCancellation,
  adminCancelOrder,
  adminUpdateOrderStatus,
  adminPartialCancelItem,
} from "@/utils/orders.functions";
import { adminAddOrderItemsToStack } from "@/lib/admin-pilha.functions";
import { ItemFacetFilter } from "@/components/admin/ItemFacetFilter";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Gavel, ImageOff, Layers, MessageCircle, X } from "lucide-react";
import { AdminTrackingEditor, type TrackingInfo } from "@/components/admin/AdminTrackingEditor";
import { useCardMetaMap } from "@/hooks/useCardMetaMap";
import { sortByCardGroup } from "@/lib/sortCards";

export const Route = createFileRoute("/admin/orders/$orderId")({
  head: () => ({ meta: [{ title: "Pedido — Sevii Admin" }] }),
  component: AdminOrderDetailPage,
});

const STATUSES = [
  "pending",
  "paid",
  "preparing",
  "shipped",
  "awaiting_pickup",
  "delivered",
  "cancelled",
] as const;

const STATUS_LABEL: Record<string, string> = {
  pending: "Pedido recebido",
  paid: "Pago",
  preparing: "Em preparação",
  shipped: "Enviado",
  awaiting_pickup: "Aguardando retirada na Arte em Cards",
  delivered: "Entregue",
  cancelled: "Cancelado",
  cancellation_requested: "Cancelamento solicitado",
};

const SHIPPING_METHOD_LABEL: Record<string, string> = {
  fixed: "Frete fixo",
  superfrete: "SuperFrete",
  arte_em_cards: "Retirada na Arte em Cards",
  card_stack: "Pilha de Cartas",
  presencial: "Retirada presencial",
  combinar: "Envio a combinar",
  delivery_app: "Aplicativo de entrega",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  pix: "Pix",
  mercadopago_card: "Cartão de crédito (Mercado Pago)",
  mercadopago_pix: "Pix (Mercado Pago)",
  stripe: "Cartão de crédito",
};

const fmtBRL = (cents: number) =>
  `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

function AdminOrderDetailPage() {
  const { orderId } = Route.useParams();
  const { isAdmin, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [coupon, setCoupon] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelItem, setCancelItem] = useState<any | null>(null);
  const [fullCancel, setFullCancel] = useState<"cancel" | "approve" | null>(null);
  const [stackedItemIds, setStackedItemIds] = useState<Set<string>>(new Set());
  const [selectedForStack, setSelectedForStack] = useState<Record<string, number>>({});
  const [sendingToStack, setSendingToStack] = useState(false);
  const addItemsToStackFn = useServerFn(adminAddOrderItemsToStack);

  useEffect(() => {
    if (!authLoading && !isAdmin) nav({ to: "/" });
  }, [authLoading, isAdmin, nav]);

  const load = async () => {
    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", orderId)
      .maybeSingle();
    setOrder(data);
    if (data?.coupon_code) {
      const { data: c } = await supabase
        .from("coupons")
        .select("code, percent, amount_cents, user_id, notes")
        .ilike("code", data.coupon_code)
        .maybeSingle();
      setCoupon(c);
    } else {
      setCoupon(null);
    }
    const itemIds = (data?.order_items ?? []).map((it: any) => it.id);
    if (itemIds.length) {
      const { data: stackRows } = await supabase
        .from("card_stack_items")
        .select("order_item_id")
        .in("order_item_id", itemIds);
      setStackedItemIds(new Set((stackRows ?? []).map((r: any) => r.order_item_id)));
    } else {
      setStackedItemIds(new Set());
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isAdmin) return;
    load();
    const channel = supabase
      .channel(`admin-order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, orderId]);

  const updateStatus = async (status: string) => {
    try {
      await adminUpdateOrderStatus({ data: { order_id: orderId, status: status as any } });
      toast.success("Status atualizado.");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atualizar status.");
    }
  };

  const saveTracking = async (info: TrackingInfo) => {
    try {
      await adminUpdateOrderStatus({ data: { order_id: orderId, status: "shipped", ...info } });
      toast.success("Rastreio salvo.");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar rastreio.");
    }
  };

  const handleApproveCancel = () => setFullCancel("approve");

  const handleRejectCancel = async () => {
    if (!confirm("Recusar o cancelamento? O pedido voltará ao status anterior.")) return;
    try {
      await rejectOrderCancellation({ data: { order_id: orderId } });
      toast.success("Cancelamento recusado.");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao recusar cancelamento.");
    }
  };

  const handleAdminCancel = () => setFullCancel("cancel");

  const toggleStackItem = (it: any, checked: boolean) => {
    setSelectedForStack((prev) => {
      const next = { ...prev };
      if (checked) {
        const avail = (it.quantity ?? 0) - (it.cancelled_quantity ?? 0);
        next[it.id] = Math.max(1, avail);
      } else {
        delete next[it.id];
      }
      return next;
    });
  };

  const updateStackQty = (itemId: string, qty: number, max: number) => {
    setSelectedForStack((prev) => ({
      ...prev,
      [itemId]: Math.max(1, Math.min(max, qty || 1)),
    }));
  };

  const sendSelectedToStack = async () => {
    const entries = Object.entries(selectedForStack);
    if (entries.length === 0) {
      toast.error("Selecione ao menos 1 item.");
      return;
    }
    if (!confirm(`Enviar ${entries.length} item(ns) para a Pilha do cliente?`)) return;
    setSendingToStack(true);
    try {
      const res = await addItemsToStackFn({
        data: {
          orderId,
          items: entries.map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
        },
      });
      toast.success(`${res.addedCount} item(ns) enviado(s) para a Pilha.`);
      setSelectedForStack({});
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar para a Pilha.");
    } finally {
      setSendingToStack(false);
    }
  };

  const orderItemsRaw: any[] = order?.order_items ?? [];
  const itemMetaMap = useCardMetaMap(orderItemsRaw.map((it: any) => it.card_id));

  // Filtros por características das cartas deste pedido (vazio = sem filtro)
  const [selectedFinishes, setSelectedFinishes] = useState<string[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);


  if (authLoading || !isAdmin || loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!order) {
    return (
      <div className="min-h-screen grid place-items-center px-4 text-center">
        <div>
          <p className="text-sm text-muted-foreground">Pedido não encontrado.</p>
          <Link to="/admin" className="mt-3 inline-block text-sm font-semibold underline">← Voltar para pedidos</Link>
        </div>
      </div>
    );
  }

  const allItems: any[] = sortByCardGroup(orderItemsRaw, (it: any) => {
    const m = itemMetaMap.get(it.card_id);
    return {
      category: m?.category ?? null,
      pokemonType: m?.pokemonType ?? null,
      trainerSubcategory: m?.trainerSubcategory ?? null,
      name: it.card_name,
    };
  });

  const itemFinish = (it: any) =>
    it.finish === "Liga" && it.liga_subcategory ? `Liga · ${it.liga_subcategory}` : (it.finish ?? "");

  const finishOptions: string[] = [];
  const collectionOptions: string[] = [];
  const conditionOptions: string[] = [];
  for (const it of allItems) {
    const f = itemFinish(it);
    if (f && !finishOptions.includes(f)) finishOptions.push(f);
    if (it.collection && !collectionOptions.includes(it.collection)) collectionOptions.push(it.collection);
    if (it.condition && !conditionOptions.includes(it.condition)) conditionOptions.push(it.condition);
  }
  finishOptions.sort((a, b) => a.localeCompare(b));
  collectionOptions.sort((a, b) => a.localeCompare(b));
  conditionOptions.sort((a, b) => a.localeCompare(b));

  const hasItemFilters =
    selectedFinishes.length > 0 || selectedCollections.length > 0 || selectedConditions.length > 0;

  const items: any[] = hasItemFilters
    ? allItems.filter(
        (it) =>
          (selectedFinishes.length === 0 || selectedFinishes.includes(itemFinish(it))) &&
          (selectedCollections.length === 0 || selectedCollections.includes(it.collection ?? "")) &&
          (selectedConditions.length === 0 || selectedConditions.includes(it.condition ?? "")),
      )
    : allItems;

  const subtotalCents = order.subtotal_cents ?? 0;
  const shippingCents = order.shipping_cost_cents ?? 0;
  const totalCents = order.total_cents ?? 0;
  const paymentLabel = PAYMENT_METHOD_LABEL[order.payment_method] ?? order.payment_method ?? "—";
  const shippingLabel = SHIPPING_METHOD_LABEL[order.shipping_method] ?? order.shipping_method ?? "—";

  const isGiftCoupon = coupon && coupon.amount_cents != null && coupon.user_id;
  const isPercentCoupon = coupon && coupon.percent != null;
  const couponLabel = isGiftCoupon
    ? "Vale-presente"
    : isPercentCoupon
      ? `Cupom de desconto (${coupon.percent}%)`
      : "Cupom de desconto";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-4">
          <Link
            to={order?.origin === "auction" ? "/admin/pedidos-leilao" : "/admin"}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {order?.origin === "auction" ? "Voltar para pedidos de leilão" : "Voltar para pedidos"}
          </Link>
          <Link to="/" className="text-sm font-bold uppercase tracking-widest">Sevii · Admin</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        {/* Cabeçalho */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-mono text-muted-foreground">#{order.id.slice(0, 8).toUpperCase()}</p>
                {order.origin === "auction" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary">
                    <Gavel className="h-3 w-3" /> Pedido de Leilão
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold">{order.recipient_name}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span>{new Date(order.created_at).toLocaleString("pt-BR")}</span>
                {order.phone && (
                  <a
                    href={`https://wa.me/55${order.phone.replace(/\D/g, "").replace(/^55/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp ({order.phone})
                  </a>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</label>
              <select
                value={order.status}
                onChange={(e) => updateStatus(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                {order.status === "cancellation_requested" && (
                  <option value="cancellation_requested" disabled>{STATUS_LABEL.cancellation_requested}</option>
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Solicitação de cancelamento */}
        {order.status === "cancellation_requested" && (
          <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-orange-900">
              <strong>Cliente solicitou cancelamento.</strong> Status anterior:{" "}
              {STATUS_LABEL[order.pre_cancel_status] ?? order.pre_cancel_status ?? "—"}
            </p>
            <div className="flex gap-2">
              <button onClick={handleRejectCancel} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                Recusar
              </button>
              <button onClick={handleApproveCancel} className="rounded-md bg-red-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-red-700">
                Aprovar cancelamento
              </button>
            </div>
          </div>
        )}

        {/* Rastreio */}
        {(order.status === "shipped" || order.status === "delivered" || order.status === "preparing") && (
          <AdminTrackingEditor order={order} onSave={saveTracking} />
        )}

        <div className="grid md:grid-cols-3 gap-4">
          {/* Cliente */}
          <Card title="Cliente">
            <Field label="Nome" value={order.recipient_name} />
            <Field label="E-mail" value={order.email} />
            <Field label="Telefone" value={order.phone || "—"} />
            <Field label="CPF" value={order.cpf || "—"} />
          </Card>

          {/* Endereço */}
          <Card title="Endereço de entrega">
            <p className="text-sm">{order.street}, {order.number}{order.complement ? ` — ${order.complement}` : ""}</p>
            <p className="text-sm">{order.neighborhood}</p>
            <p className="text-sm">{order.city} / {order.state}</p>
            <p className="text-xs text-muted-foreground mt-1">CEP: {order.cep}</p>
          </Card>

          {/* Pagamento e envio */}
          <Card title="Pagamento & envio">
            <Field label="Pagamento" value={paymentLabel} />
            <Field label="Método de envio" value={shippingLabel} />
            {order.tracking_code && <Field label="Rastreio" value={order.tracking_code} mono />}
            {order.arte_em_cards_code && <Field label="Código Arte em Cards" value={order.arte_em_cards_code} mono />}
            {order.mercadopago_payment_id && (
              <Field label="ID Mercado Pago" value={order.mercadopago_payment_id} mono />
            )}
          </Card>
        </div>

        {/* Itens */}
        {(() => {
          const stackEligible = ["paid", "preparing", "shipped", "awaiting_pickup", "delivered"].includes(order.status);
          const selectedCount = Object.keys(selectedForStack).length;
          return (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xs font-bold uppercase tracking-widest">
                  Itens vendidos ({items.length}
                  {hasItemFilters ? ` de ${allItems.length}` : ""})
                </h2>
                <div className="flex items-center gap-3">
                  <PickingSummary items={items} />
                  {stackEligible && selectedCount > 0 && (
                    <button
                      onClick={sendSelectedToStack}
                      disabled={sendingToStack}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      {sendingToStack ? "Enviando..." : `Enviar ${selectedCount} para Pilha`}
                    </button>
                  )}
                </div>
              </div>
              <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-2 bg-secondary/30">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Filtrar itens
                </span>
                <ItemFacetFilter
                  label="Acabamento"
                  options={finishOptions}
                  selected={selectedFinishes}
                  onChange={setSelectedFinishes}
                />
                <ItemFacetFilter
                  label="Coleção"
                  options={collectionOptions}
                  selected={selectedCollections}
                  onChange={setSelectedCollections}
                />
                <ItemFacetFilter
                  label="Condição"
                  options={conditionOptions}
                  selected={selectedConditions}
                  onChange={setSelectedConditions}
                />
                {hasItemFilters && (
                  <button
                    onClick={() => {
                      setSelectedFinishes([]);
                      setSelectedCollections([]);
                      setSelectedConditions([]);
                    }}
                    className="text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>

              <ul className="divide-y divide-border">
                {items.map((it) => {
                  const cancelledQty = it.cancelled_quantity ?? 0;
                  const activeQty = (it.quantity ?? 0) - cancelledQty;
                  const lineTotal = (it.unit_price_cents ?? 0) * (it.quantity ?? 0);
                  const refundCents = it.refund_cents ?? 0;
                  const canCancel =
                    activeQty > 0 &&
                    ["paid", "preparing", "shipped", "awaiting_pickup", "delivered"].includes(order.status);
                  const inStack = stackedItemIds.has(it.id);
                  const canStack = stackEligible && !inStack && activeQty > 0;
                  const selectedQty = selectedForStack[it.id];
                  const isSelected = selectedQty != null;
                  return (
                    <li key={it.id} className="flex items-start gap-4 p-4">
                      {canStack ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleStackItem(it, e.target.checked)}
                          className="mt-2 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                          title="Selecionar para enviar à Pilha"
                        />
                      ) : (
                        <div className="w-4 shrink-0" />
                      )}
                      <div className="h-24 w-[68px] shrink-0 rounded-md overflow-hidden bg-secondary border border-border grid place-items-center">
                        {it.card_image ? (
                          <img src={it.card_image} alt={it.card_name} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <ImageOff className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">
                          {it.card_name}
                          {it.card_number && <span className="text-muted-foreground font-normal"> · {it.card_number}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[it.collection, it.finish === "Liga" && it.liga_subcategory ? `Liga · ${it.liga_subcategory}` : it.finish, it.language, it.condition].filter(Boolean).join(" · ")}
                        </p>
                        <p className="text-xs mt-2">
                          <span className="text-muted-foreground">Qtd:</span>{" "}
                          <span className="font-semibold">{it.quantity}</span>{" "}
                          <span className="text-muted-foreground">×</span>{" "}
                          <span className="font-semibold tabular-nums">{fmtBRL(it.unit_price_cents)}</span>
                        </p>
                        {cancelledQty > 0 && (
                          <p className="text-xs mt-1 text-orange-700 font-semibold">
                            {cancelledQty}× cancelado{refundCents > 0 ? ` · reembolso ${fmtBRL(refundCents)}` : ""}
                            {it.refund_method ? ` (${it.refund_method === "mercadopago" ? "estorno MP" : it.refund_method === "coupon" ? "cupom" : "manual"})` : ""}
                            {it.refund_coupon_code ? ` · ${it.refund_coupon_code}` : ""}
                          </p>
                        )}
                        {inStack && (
                          <p className="text-xs mt-1 inline-flex items-center gap-1 text-primary font-semibold">
                            <Layers className="h-3 w-3" /> Já está na Pilha do cliente
                          </p>
                        )}
                        {isSelected && (
                          <div className="mt-2 flex items-center gap-2">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                              Qtd p/ Pilha
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={activeQty}
                              value={selectedQty}
                              onChange={(e) => updateStackQty(it.id, parseInt(e.target.value), activeQty)}
                              className="w-16 rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold"
                            />
                            <span className="text-[11px] text-muted-foreground">de {activeQty}</span>
                          </div>
                        )}
                        <PickedByControl item={it} onChanged={load} />
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Subtotal</p>
                          <p className="text-base font-bold tabular-nums">{fmtBRL(lineTotal)}</p>
                        </div>
                        {canCancel && (
                          <button
                            onClick={() => setCancelItem(it)}
                            className="text-[11px] text-destructive hover:underline font-semibold inline-flex items-center gap-1"
                            title="Cancelar este item (sem estoque, etc.)"
                          >
                            <X className="h-3 w-3" /> Cancelar item
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })()}




        {/* Totais */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3">Resumo financeiro</h2>
          <dl className="space-y-1.5 text-sm">
            <Row label="Subtotal dos itens" value={fmtBRL(subtotalCents)} />
            <Row
              label={`Frete${order.shipping_method ? ` (${shippingLabel})` : ""}`}
              value={shippingCents > 0 ? fmtBRL(shippingCents) : (order.shipping_method === "combinar" || order.shipping_method === "delivery_app" ? "a combinar" : "grátis")}
            />
            {order.bundle_discount_cents > 0 && (
              <Row label="Desconto de combo" value={`− ${fmtBRL(order.bundle_discount_cents)}`} tone="discount" />
            )}
            {order.coupon_discount_cents > 0 && (
              <Row
                label={`${couponLabel}${order.coupon_code ? ` (${order.coupon_code})` : ""}`}
                value={`− ${fmtBRL(order.coupon_discount_cents)}`}
                tone="discount"
              />
            )}
            {order.points_discount_cents > 0 && (
              <Row label="Desconto de pontos" value={`− ${fmtBRL(order.points_discount_cents)}`} tone="discount" />
            )}
            {order.pix_discount_cents > 0 && (
              <Row label="Desconto Pix (5%)" value={`− ${fmtBRL(order.pix_discount_cents)}`} tone="discount" />
            )}
            {/* Fallback para pedidos antigos sem separação */}
            {order.discount_cents > 0 && order.bundle_discount_cents === 0 && order.coupon_discount_cents === 0 && order.points_discount_cents === 0 && order.pix_discount_cents === 0 && (
              <Row
                label={`Desconto${order.coupon_code ? ` (${order.coupon_code})` : ""}`}
                value={`− ${fmtBRL(order.discount_cents)}`}
                tone="discount"
              />
            )}
            <div className="border-t border-border pt-2 mt-2">
              <Row label="Total pago" value={fmtBRL(totalCents)} tone="total" />
            </div>
            {(order.refunded_cents ?? 0) > 0 && (
              <Row
                label="Reembolsado ao cliente"
                value={`− ${fmtBRL(order.refunded_cents)}`}
                tone="discount"
              />
            )}
          </dl>
        </div>


        {/* Observações */}
        {order.notes && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-2">Observações do cliente</h2>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground italic">{order.notes}</p>
          </div>
        )}

        {/* Ação de cancelar */}
        {order.status !== "cancelled" && order.status !== "cancellation_requested" && (
          <div className="flex justify-end">
            <button
              onClick={handleAdminCancel}
              className="text-xs text-destructive hover:underline font-semibold"
            >
              Cancelar pedido
            </button>
          </div>
        )}
      </main>

      {fullCancel && (
        <FullCancelDialog
          order={order}
          mode={fullCancel}
          onClose={() => setFullCancel(null)}
          onDone={async () => {
            setFullCancel(null);
            await load();
          }}
        />
      )}

      {cancelItem && (
        <PartialCancelDialog
          item={cancelItem}
          order={order}
          onClose={() => setCancelItem(null)}
          onDone={async () => {
            setCancelItem(null);
            await load();
          }}
        />
      )}
    </div>
  );
}


function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="text-sm">
      <span className="text-xs text-muted-foreground">{label}: </span>
      <span className={mono ? "font-mono text-xs" : "font-medium"}>{value}</span>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "discount" | "total" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={tone === "total" ? "font-bold text-base" : "text-muted-foreground"}>{label}</dt>
      <dd
        className={
          tone === "total"
            ? "font-bold text-base tabular-nums"
            : tone === "discount"
              ? "text-green-700 font-semibold tabular-nums"
              : "tabular-nums font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function PartialCancelDialog({
  item,
  order,
  onClose,
  onDone,
}: {
  item: any;
  order: any;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const cancelledQty = item.cancelled_quantity ?? 0;
  const remaining = (item.quantity ?? 0) - cancelledQty;
  const [qty, setQty] = useState(1);
  const [method, setMethod] = useState<"mercadopago" | "coupon" | "manual">(
    order.mercadopago_payment_id ? "mercadopago" : "coupon",
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Preview do valor de reembolso (proporcional ao desconto do pedido)
  const baseCents = (item.unit_price_cents ?? 0) * qty;
  const subtotal = order.subtotal_cents || 1;
  const discount = order.discount_cents ?? 0;
  const ratio = Math.max(0, Math.min(1, 1 - discount / subtotal));
  const refundPreview = Math.round(baseCents * ratio);

  const submit = async () => {
    if (qty < 1 || qty > remaining) {
      toast.error("Quantidade inválida.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await adminPartialCancelItem({
        data: {
          order_id: order.id,
          order_item_id: item.id,
          quantity: qty,
          refund_method: method,
          notes: notes.trim() || null,
        },
      });
      toast.success(
        `Item cancelado. ${res.refundDetails ?? `Reembolso: ${fmtBRL(res.refundCents ?? 0)}`}`,
        { duration: 6000 },
      );
      await onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao cancelar item.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-card border border-border p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-bold">Cancelar item parcialmente</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {item.card_name}
            {item.card_number ? ` · ${item.card_number}` : ""}
          </p>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Quantidade a cancelar
          </label>
          <div className="flex items-center gap-3 mt-1">
            <input
              type="number"
              min={1}
              max={remaining}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(remaining, parseInt(e.target.value) || 1)))}
              className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold"
            />
            <span className="text-xs text-muted-foreground">de {remaining} disponíveis</span>
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Forma de reembolso
          </label>
          <div className="mt-1 space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="refund"
                checked={method === "mercadopago"}
                disabled={!order.mercadopago_payment_id}
                onChange={() => setMethod("mercadopago")}
                className="mt-0.5"
              />
              <span>
                <strong>Estorno automático no Mercado Pago</strong>
                {!order.mercadopago_payment_id && (
                  <span className="text-xs text-muted-foreground"> — indisponível (pagamento não foi via MP)</span>
                )}
                <span className="block text-xs text-muted-foreground">Cai na conta/cartão do cliente em até 7 dias úteis.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="refund"
                checked={method === "coupon"}
                onChange={() => setMethod("coupon")}
                className="mt-0.5"
              />
              <span>
                <strong>Cupom de desconto</strong>
                <span className="block text-xs text-muted-foreground">Gera cupom único no valor do reembolso (válido 1 ano).</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="refund"
                checked={method === "manual"}
                onChange={() => setMethod("manual")}
                className="mt-0.5"
              />
              <span>
                <strong>Manual (Pix por fora)</strong>
                <span className="block text-xs text-muted-foreground">Apenas registra; você devolve por fora.</span>
              </span>
            </label>
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Observação para o cliente (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: Infelizmente esta carta saiu do estoque antes da separação. Pedimos desculpas pelo transtorno."
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            rows={3}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Esta mensagem será enviada junto ao e-mail de cancelamento parcial.
          </p>
        </div>


        <div className="rounded-md bg-secondary/50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Valor a reembolsar:</span>
            <span className="font-bold tabular-nums">{fmtBRL(refundPreview)}</span>
          </div>
          {discount > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Já desconta proporcionalmente {discount > 0 ? "o desconto/Pix" : ""} aplicado no pedido.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-md bg-destructive text-destructive-foreground px-3 py-1.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Processando..." : "Confirmar cancelamento"}
          </button>
        </div>
      </div>
    </div>
  );
}

const PICKERS = ["Luca", "Julia"] as const;
type Picker = (typeof PICKERS)[number];

function PickedByControl({ item, onChanged }: { item: any; onChanged: () => void | Promise<void> }) {
  const [saving, setSaving] = useState<Picker | "clear" | null>(null);
  const current: Picker | null = item.picked_by ?? null;

  const setPicked = async (value: Picker | null) => {
    setSaving(value ?? "clear");
    try {
      const { error } = await supabase
        .from("order_items")
        .update({ picked_by: value, picked_at: value ? new Date().toISOString() : null })
        .eq("id", item.id);
      if (error) throw error;
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao marcar separação.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Separado por:</span>
      {PICKERS.map((p) => {
        const active = current === p;
        const isSaving = saving === p;
        return (
          <button
            key={p}
            type="button"
            disabled={!!saving}
            onClick={() => setPicked(active ? null : p)}
            className={
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors " +
              (active
                ? p === "Luca"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-pink-600 text-white border-pink-600"
                : "bg-background hover:bg-secondary border-border text-foreground")
            }
            title={active ? `Desmarcar ${p}` : `Marcar como separado por ${p}`}
          >
            <span
              className={
                "inline-block h-3 w-3 rounded-sm border " +
                (active ? "bg-white/90 border-white/90" : "border-muted-foreground")
              }
            >
              {active && <span className="block text-[10px] leading-3 text-black text-center">✓</span>}
            </span>
            {isSaving ? "..." : p}
          </button>
        );
      })}
      {current && item.picked_at && (
        <span className="text-[10px] text-muted-foreground">
          em {new Date(item.picked_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
        </span>
      )}
    </div>
  );
}

function PickingSummary({ items }: { items: any[] }) {
  const total = items.length;
  const lucaPicked = items.filter((it) => it.picked_by === "Luca").length;
  const juliaPicked = items.filter((it) => it.picked_by === "Julia").length;
  const done = lucaPicked + juliaPicked;
  const allDone = done === total && total > 0;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-[11px] text-muted-foreground">
        Separado: <span className="font-semibold text-foreground">{done}/{total}</span>
      </span>
      {lucaPicked > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-[11px] font-semibold">
          Luca {lucaPicked}/{total} {lucaPicked === total && <span className="text-[10px]">✓</span>}
        </span>
      )}
      {juliaPicked > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-pink-100 text-pink-800 px-2 py-0.5 text-[11px] font-semibold">
          Julia {juliaPicked}/{total} {juliaPicked === total && <span className="text-[10px]">✓</span>}
        </span>
      )}
      {allDone && (
        <span className="text-[11px] font-bold text-green-700">Tudo separado ✓</span>
      )}
    </div>
  );
}


function FullCancelDialog({
  order,
  mode,
  onClose,
  onDone,
}: {
  order: any;
  mode: "cancel" | "approve";
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const POST_PAID = ["paid", "preparing", "shipped", "awaiting_pickup", "delivered"];
  const wasPaid = POST_PAID.includes(order.status) || POST_PAID.includes(order.pre_cancel_status ?? "");
  const pending = Math.max(0, (order.total_cents ?? 0) - (order.refunded_cents ?? 0));
  const [method, setMethod] = useState<"mercadopago" | "coupon" | "manual" | "none">(
    !wasPaid || pending <= 0 ? "none" : order.mercadopago_payment_id ? "mercadopago" : "coupon",
  );
  const [restoreStock, setRestoreStock] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const fn = mode === "approve" ? approveOrderCancellation : adminCancelOrder;
      const res: any = await fn({
        data: { order_id: order.id, refund_method: method, restore_stock: restoreStock },
      });
      if (res?.refundError) {
        toast.warning(`Pedido cancelado, mas o reembolso falhou: ${res.refundError}`, { duration: 9000 });
      } else {
        toast.success(
          `Pedido cancelado.${res?.refundDetails ? ` ${res.refundDetails}` : ""}`,
          { duration: 6000 },
        );
      }
      await onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao cancelar pedido.");
    } finally {
      setSubmitting(false);
    }
  };

  const opts: { value: typeof method; label: string; hint?: string }[] = [
    { value: "mercadopago", label: "Estornar no Mercado Pago", hint: order.mercadopago_payment_id ? undefined : "Pedido sem pagamento MP vinculado" },
    { value: "coupon", label: "Gerar vale-presente (cupom)", hint: "Válido por 1 ano" },
    { value: "manual", label: "Reembolso manual", hint: "Apenas registra; você paga fora do sistema" },
    { value: "none", label: "Sem reembolso" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-card border border-border p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-bold">
            {mode === "approve" ? "Aprovar cancelamento" : "Cancelar pedido"}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pedido #{String(order.id).slice(0, 8).toUpperCase()} · Pendente de reembolso: {fmtBRL(pending)}
          </p>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Forma de reembolso
          </span>
          {opts.map((o) => (
            <label
              key={o.value}
              className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-border p-2"
            >
              <input
                type="radio"
                className="mt-1"
                checked={method === o.value}
                disabled={o.value === "mercadopago" && !order.mercadopago_payment_id}
                onChange={() => setMethod(o.value)}
              />
              <span>
                {o.label}
                {o.hint && <span className="block text-[11px] text-muted-foreground">{o.hint}</span>}
              </span>
            </label>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={restoreStock}
            onChange={(e) => setRestoreStock(e.target.checked)}
          />
          Devolver os itens ao estoque
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg border border-border">
            Voltar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="text-sm px-3 py-2 rounded-lg bg-destructive text-destructive-foreground font-semibold disabled:opacity-60"
          >
            {submitting ? "Processando…" : "Confirmar cancelamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
