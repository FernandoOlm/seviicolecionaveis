import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { formatSchedule, HAND_DELIVERY_PIX_KEY, STORE_WHATSAPP } from "@/lib/scheduling";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clock, XCircle, Package, Truck, AlertTriangle } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { requestOrderCancellation } from "@/utils/orders.functions";
import { checkPixOrderStatus } from "@/utils/payments.functions";
import { toast } from "sonner";
import { PostPurchaseSurvey } from "@/components/PostPurchaseSurvey";
import { ScheduleSlotPicker } from "@/components/ScheduleSlotPicker";
import { reschedulePickupFn } from "@/lib/pickup-reschedule.functions";
import { isSlotBookable, SLOT_EXPIRED_MESSAGE } from "@/lib/scheduling";

function RescheduleBox({ orderId, onDone }: { orderId: string; onDone: (at: string) => void }) {
  const [at, setAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-md border border-amber-400/60 bg-amber-50 p-3 space-y-3 text-amber-950">
      <p className="font-semibold">Reagendamento necessário</p>
      <p className="text-xs">Não conseguimos concluir sua retirada no horário agendado. Escolha um novo horário abaixo.</p>
      <ScheduleSlotPicker kind="pickup" value={at} onChange={setAt} />
      <button
        type="button"
        disabled={!at || busy}
        className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold disabled:opacity-50"
        onClick={async () => {
          if (!at) return;
          if (!isSlotBookable("pickup", at)) { setAt(null); toast.error(SLOT_EXPIRED_MESSAGE); return; }
          setBusy(true);
          try {
            await reschedulePickupFn({ data: { orderId, at } });
            toast.success("Novo horário confirmado!");
            onDone(at);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Não foi possível reagendar.");
          } finally { setBusy(false); }
        }}
      >
        {busy ? "Confirmando..." : "Confirmar novo horário"}
      </button>
    </div>
  );
}

const PURCHASE_TRACKED_KEY = "sevii_ga_purchase_tracked";

export const Route = createFileRoute("/orders/$orderId")({
  head: () => ({ meta: [
    { title: "Pedido — Sevii Colecionáveis" },
    { name: "description", content: "Acompanhe pagamento, envio e retirada do seu pedido na Sevii Colecionáveis." },
    { property: "og:title", content: "Pedido — Sevii Colecionáveis" },
    { property: "og:description", content: "Acompanhe pagamento, envio e retirada do seu pedido na Sevii Colecionáveis." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: OrderDetailPage,
});

const STATUS_LABEL: Record<string, string> = { ...ORDER_STATUS_LABELS, pending: "Pedido recebido — aguardando pagamento", cancellation_requested: "Cancelamento em análise" };

const STATUS_ICON: Record<string, any> = {
  preparing: Package,
  separated: CheckCircle2,
  cards_pending_delivery: AlertTriangle,
  pending: Clock,
  paid: CheckCircle2,
  shipped: Truck,
  awaiting_pickup: Package,
  delivered: Package,
  cancelled: XCircle,
  cancellation_requested: AlertTriangle,
};

const STATUS_COLOR: Record<string, string> = {
  preparing: "text-muted-foreground",
  separated: "text-primary",
  cards_pending_delivery: "text-foreground",
  pending: "text-yellow-600",
  paid: "text-green-600",
  shipped: "text-purple-600",
  awaiting_pickup: "text-amber-600",
  delivered: "text-blue-600",
  cancelled: "text-red-600",
  cancellation_requested: "text-orange-600",
};

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [coupon, setCoupon] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const handleRequestCancel = async () => {
    if (!order) return;
    if (!confirm("Deseja realmente solicitar o cancelamento deste pedido? A solicitação passará por análise da nossa equipe.")) return;
    setCancelling(true);
    try {
      await requestOrderCancellation({ data: { order_id: order.id } });
      toast.success("Solicitação de cancelamento enviada. Aguarde a análise.");
      setOrder({ ...order, status: "cancellation_requested", pre_cancel_status: order.status });
    } catch (e: any) {
      toast.error(typeof e?.message === "string" ? e.message : "Não foi possível solicitar o cancelamento.");
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/auth" });
  }, [authLoading, user, nav]);

  // Notifica quando o status muda (ex: admin aprova cancelamento)
  useEffect(() => {
    if (!order) return;
    const prev = (window as any).__lastOrderStatus?.[order.id];
    if (prev && prev !== order.status) {
      if (order.status === "cancelled") {
        toast.success("Seu pedido foi cancelado.");
      } else if (prev === "cancellation_requested" && order.status !== "cancelled") {
        toast.info("Sua solicitação de cancelamento foi recusada.");
      }
    }
    (window as any).__lastOrderStatus = { ...((window as any).__lastOrderStatus ?? {}), [order.id]: order.status };
  }, [order?.status, order?.id]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", orderId)
        .maybeSingle();
      if (!cancelled) {
        setOrder(data);
        setLoading(false);
      }
      if (data?.coupon_code) {
        const { data: c } = await supabase
          .from("coupons")
          .select("code, percent, amount_cents, user_id, notes")
          .ilike("code", data.coupon_code)
          .maybeSingle();
        if (!cancelled) setCoupon(c);
      } else if (!cancelled) {
        setCoupon(null);
      }
    };
    load();

    // Realtime: refetch quando o pedido for atualizado (admin aprovar cancelamento, etc.)
    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => { load(); },
      )
      .subscribe();

    // Polling de segurança (a cada 8s) caso o realtime caia
    const interval = setInterval(load, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user, orderId]);

  // Se o pedido está pendente (Pix aguardando), consulta o Mercado Pago
  // diretamente — confirma o pagamento mesmo se o webhook atrasar/falhar.
  useEffect(() => {
    if (!order || order.status !== "pending" || order.payment_method !== "pix") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await checkPixOrderStatus({ data: { orderId: order.id } });
        if (!cancelled && r.status === "paid") {
          const { data } = await supabase
            .from("orders")
            .select("*, order_items(*)")
            .eq("id", order.id)
            .maybeSingle();
          if (!cancelled && data) setOrder(data);
        }
      } catch (e) {
        console.error("checkPixOrderStatus failed", e);
      }
    };
    poll();
    const i = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(i); };
  }, [order?.id, order?.status, order?.payment_method]);

  // GA4 purchase — disparado apenas uma vez quando o pedido fica pago
  useEffect(() => {
    if (!order || order.status !== "paid") return;
    try {
      const tracked = JSON.parse(sessionStorage.getItem(PURCHASE_TRACKED_KEY) ?? "[]") as string[];
      if (tracked.includes(order.id)) return;
      trackEvent("purchase", {
        transaction_id: order.id,
        currency: "BRL",
        value: (order.total_cents ?? 0) / 100,
        shipping: (order.shipping_cost_cents ?? 0) / 100,
        coupon: order.coupon_code ?? undefined,
        items: (order.order_items ?? []).map((it: any) => ({
          item_id: it.card_id,
          item_name: it.card_name,
          item_category: it.collection ?? undefined,
          item_variant: `${it.finish ?? ""}/${it.language ?? ""}/${it.condition ?? ""}`,
          price: (it.unit_price_cents ?? 0) / 100,
          quantity: it.quantity,
        })),
      });
      tracked.push(order.id);
      sessionStorage.setItem(PURCHASE_TRACKED_KEY, JSON.stringify(tracked.slice(-20)));
    } catch {
      // ignore storage errors
    }
  }, [order]);

  if (authLoading || loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando pedido...</div>;
  }

  if (!order) {
    return (
      <div className="min-h-screen grid place-items-center px-4 text-center">
        <div className="space-y-3">
          <h1 className="text-xl font-bold">Pedido não encontrado</h1>
          <Link to="/orders" className="text-sm underline">Ver meus pedidos</Link>
        </div>
      </div>
    );
  }

  const Icon = STATUS_ICON[order.status] ?? Clock;
  const isPaid = order.status === "paid" || order.status === "shipped" || order.status === "delivered";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <Link to="/" className="text-sm font-bold uppercase tracking-widest">Sevii Colecionáveis</Link>
          <Link to="/orders" className="text-xs text-muted-foreground hover:text-foreground">Meus pedidos →</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="text-center space-y-3">
          <Icon className={`h-14 w-14 mx-auto ${STATUS_COLOR[order.status] ?? "text-muted-foreground"}`} />
          <h1 className="text-2xl font-bold">
            {isPaid ? "Pagamento confirmado!" : STATUS_LABEL[order.status] ?? order.status}
          </h1>
          <p className="text-xs text-muted-foreground font-mono">Pedido #{order.id.slice(0, 8)}</p>
          <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString("pt-BR")}</p>
        </div>

        {(order.status === "shipped" || order.status === "delivered") && order.tracking_code && (
          <section className="rounded-xl border border-border bg-card p-5 text-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Rastreio do envio
            </h2>
            <p className="font-mono font-semibold text-base">{order.tracking_code}</p>
            <a
              href="https://rastreamento.correios.com.br/app/index.php"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block rounded-full bg-foreground text-background px-4 py-2 text-xs font-semibold hover:opacity-90"
            >
              Rastrear nos Correios
            </a>
            <p className="text-xs text-muted-foreground mt-2">
              Cole o código na página dos Correios para ver o histórico de movimentações.
            </p>
          </section>
        )}

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
            Itens do pedido
          </h2>
          <ul className="space-y-4">
            {order.order_items?.map((it: any) => (
              <li key={it.id} className="flex gap-4">
                <div className="h-24 w-20 shrink-0 rounded-md overflow-hidden bg-secondary border border-border">
                  {it.card_image ? (
                    <img
                      src={it.card_image}
                      alt={it.card_name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-[10px] text-muted-foreground">
                      sem imagem
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">
                    {it.card_name}
                    {it.card_number ? <span className="text-muted-foreground font-normal"> {it.card_number}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {it.finish === "Liga" && it.liga_subcategory ? `Liga · ${it.liga_subcategory}` : it.finish} · {it.language}
                    {it.condition ? ` · ${it.condition}` : ""}
                  </p>
                  {it.collection && (
                    <p className="text-xs text-muted-foreground truncate">
                      {it.collection}
                    </p>
                  )}
                  <p className="text-sm mt-1">
                    {it.quantity}× <span className="tabular-nums">R$ {(it.unit_price_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </p>
                </div>
                <div className="text-sm font-semibold tabular-nums shrink-0">
                  R$ {(it.unit_price_cents * it.quantity / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">R$ {(order.subtotal_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          </div>
          {order.bundle_discount_cents > 0 && (
            <div className="flex justify-between text-green-700">
              <span>Desconto de combo</span>
              <span className="tabular-nums">- R$ {(order.bundle_discount_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {order.coupon_discount_cents > 0 && (() => {
            const isGift = coupon && coupon.amount_cents != null && coupon.user_id;
            const isPercent = coupon && coupon.percent != null;
            const label = isGift
              ? "Vale-presente"
              : isPercent
                ? `Cupom de desconto (${coupon.percent}%)`
                : "Cupom de desconto";
            return (
              <div className="flex justify-between text-green-700">
                <span>
                  {label}
                  {order.coupon_code ? <span className="font-mono ml-1 opacity-80">({order.coupon_code})</span> : null}
                </span>
                <span className="tabular-nums">- R$ {(order.coupon_discount_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
            );
          })()}
          {order.points_discount_cents > 0 && (
            <div className="flex justify-between text-green-700">
              <span>Desconto de pontos</span>
              <span className="tabular-nums">- R$ {(order.points_discount_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {order.pix_discount_cents > 0 && (
            <div className="flex justify-between text-green-700">
              <span>Desconto Pix (5%)</span>
              <span className="tabular-nums">- R$ {(order.pix_discount_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {/* Fallback para pedidos antigos sem separação de descontos */}
          {order.discount_cents > 0 && order.bundle_discount_cents === 0 && order.coupon_discount_cents === 0 && order.points_discount_cents === 0 && order.pix_discount_cents === 0 && (() => {
            const isGift = coupon && coupon.amount_cents != null && coupon.user_id;
            const isPercent = coupon && coupon.percent != null;
            const label = isGift
              ? "Vale-presente"
              : isPercent
                ? `Cupom de desconto (${coupon.percent}%)`
                : "Cupom de desconto";
            return (
              <div className="flex justify-between text-green-700">
                <span>
                  {label}
                  {order.coupon_code ? <span className="font-mono ml-1 opacity-80">({order.coupon_code})</span> : null}
                </span>
                <span className="tabular-nums">- R$ {(order.discount_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
            );
          })()}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {order.shipping_method === "fixed"
                ? "Frete (Mini Envios)"
                : order.shipping_method === "arte_em_cards"
                  ? "Taxa Arte em Cards"
                  : "Envio a combinar"}
            </span>
            <span className="tabular-nums">R$ {(order.shipping_cost_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
            <span>Total</span>
            <span className="tabular-nums">R$ {(order.total_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-xs text-muted-foreground">
            <span>Forma de pagamento</span>
            <span className="font-medium text-foreground">
              {order.payment_method === "pix"
                ? "Pix"
                : order.payment_method === "stripe"
                  ? "Cartão de crédito (Stripe)"
                  : order.payment_method === "mercadopago_card"
                    ? "Cartão de crédito (Mercado Pago)"
                    : order.payment_method ?? "A definir"}
            </span>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 text-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Endereço de entrega
          </h2>
          <p className="font-medium">{order.recipient_name}</p>
          <p className="text-muted-foreground">
            {order.street}, {order.number}{order.complement ? ` - ${order.complement}` : ""}
          </p>
          <p className="text-muted-foreground">{order.neighborhood} · {order.city}/{order.state} · CEP {order.cep}</p>
          {order.phone && <p className="text-muted-foreground mt-1">Tel: {order.phone}</p>}
        </section>

        {order.shipping_method === "arte_em_cards" && order.arte_em_cards_code && (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-900">
              ✨ Seu código Arte em Cards
            </h2>
            <code className="block rounded-md bg-white border border-amber-300 px-3 py-2 font-mono text-base font-bold tracking-wider text-amber-900">
              {order.arte_em_cards_code}
            </code>
            <p className="text-xs text-amber-900">
              Use este código no checkout, na modalidade <strong>Retirada na Arte em Cards</strong>,
              em quantas compras quiser nesta semana sem pagar a taxa novamente.
              Válido até a próxima sexta-feira às 11h59. Também enviamos por e-mail e está disponível
              em <Link to="/conta" className="underline font-semibold">Minha conta → Arte em Cards</Link>.
            </p>
            <p className="text-xs text-amber-900">
              Retiradas: 14h às 18h em dias úteis, mediante contato com 24h de antecedência.
            </p>
          </section>
        )}

        {(order as any).scheduled_at && (
          <section className="rounded-xl border border-border bg-card p-5 text-sm space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {(order as any).schedule_kind === "delivery" ? "Entrega em mãos" : "Retirada em mãos"}
              </h2>
              <p className="text-sm mt-1">
                {(order as any).reschedule_required ? "Horário anterior (não concluído): " : "Agendado para "}
                <strong>{formatSchedule((order as any).schedule_kind, (order as any).scheduled_at)}</strong>
              </p>
            </div>
            {(order as any).reschedule_required && (order as any).schedule_kind === "pickup" && (
              <RescheduleBox orderId={order.id} onDone={(at) => setOrder({ ...order, scheduled_at: at, reschedule_required: false })} />
            )}
            {(order as any).schedule_kind === "delivery" && (
              <>
                <p className="text-xs text-muted-foreground">
                  Taxa de entrega: <strong>R$ 15,00</strong> via Pix para a chave{" "}
                  <span className="font-mono font-semibold text-foreground">{HAND_DELIVERY_PIX_KEY}</span>.{" "}
                  Status:{" "}
                  <strong>{(order as any).hand_delivery_fee_status === "confirmed" ? "pagamento confirmado" : "aguardando confirmação de pagamento"}</strong>
                </p>
                {(order as any).hand_delivery_fee_status !== "confirmed" && (
                  <a
                    href={`https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(
                      `Olá! Envio o comprovante do Pix da Entrega em Mãos referente ao pedido #${order.id.slice(0, 8).toUpperCase()}`,
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold hover:opacity-90"
                  >
                    Enviar comprovante no WhatsApp
                  </a>
                )}
              </>
            )}
          </section>
        )}

        {order.shipping_method === "arrange" && typeof order.notes === "string" && order.notes.includes("Entrega por aplicativo") && (
          <section className="rounded-xl border border-border bg-card p-5 text-sm space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Entrega por aplicativo
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Solicite a disponibilidade da entrega por aplicativo (somente Uber) direto pelo WhatsApp da loja.
                O custo da corrida é por sua conta. Envios realizados às terças e quintas, das 14h às 18h.
              </p>
            </div>
            <a
              href={`https://wa.me/557998150955?text=${encodeURIComponent(
                `Olá, acabei de realizar uma compra pelo site do pedido #${order.id.slice(0, 8)} e queria solicitar disponibilidade para entrega por aplicativo.`,
              )}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-full bg-green-600 text-white px-4 py-2 text-xs font-semibold hover:bg-green-700"
            >
              Solicitar entrega por aplicativo no WhatsApp
            </a>
          </section>
        )}

        {(order.status === "paid" || order.status === "shipped" || order.status === "delivered") && (
          <PostPurchaseSurvey orderId={order.id} />
        )}

        {(order.status === "pending" || order.status === "paid") && (
          <div className="rounded-xl border border-border bg-card p-5 text-sm space-y-2">
            <p className="font-semibold">Precisa cancelar este pedido?</p>
            <p className="text-xs text-muted-foreground">
              Ao solicitar o cancelamento, sua solicitação ficará em análise pela nossa equipe.
              Você será notificado assim que houver uma resposta.
            </p>
            <button
              onClick={handleRequestCancel}
              disabled={cancelling}
              className="rounded-full border border-destructive/40 text-destructive px-4 py-2 text-xs font-semibold hover:bg-destructive/10 disabled:opacity-50"
            >
              {cancelling ? "Enviando..." : "Solicitar cancelamento"}
            </button>
          </div>
        )}

        {order.status === "cancellation_requested" && (
          <div className="rounded-xl border border-orange-300 bg-orange-50 p-5 text-sm text-orange-900">
            <p className="font-semibold">Cancelamento em análise</p>
            <p className="text-xs mt-1">
              Recebemos sua solicitação. Nossa equipe irá analisar e retornar em breve.
            </p>
          </div>
        )}

        <div className="flex gap-3 justify-center pt-2">
          <Link to="/" className="rounded-full border border-border px-5 py-2 text-sm font-semibold hover:bg-secondary">
            Voltar ao catálogo
          </Link>
          <Link to="/orders" className="rounded-full bg-foreground text-background px-5 py-2 text-sm font-semibold hover:bg-foreground/90">
            Meus pedidos
          </Link>
        </div>
      </main>
    </div>
  );
}
