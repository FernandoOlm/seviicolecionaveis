import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { adminUpdateOrderStatus } from "@/utils/orders.functions";
import { useServerFn } from "@tanstack/react-start";
import {
  Gavel,
  Search,
  ExternalLink,
  MessageCircle,
  Copy,
  Check,
  RefreshCw,
  ImageOff,
  Filter,
  DollarSign,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  Layers,
} from "lucide-react";

export const Route = createFileRoute("/admin/pedidos-leilao")({
  head: () => ({ meta: [{ title: "Pedidos Leilão — Sevii Admin" }] }),
  component: AuctionOrdersPage,
});

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string; icon: any }> = {
  pending: {
    label: "Aguardando pagamento",
    badgeClass: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-800",
    icon: Clock,
  },
  paid: {
    label: "Pago",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
    icon: CheckCircle2,
  },
  preparing: {
    label: "Em preparação",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
    icon: Package,
  },
  shipped: {
    label: "Enviado",
    badgeClass: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800",
    icon: Truck,
  },
  awaiting_pickup: {
    label: "Aguardando retirada",
    badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800",
    icon: Layers,
  },
  delivered: {
    label: "Entregue",
    badgeClass: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "Cancelado",
    badgeClass: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
    icon: AlertCircle,
  },
};

function formatPhoneDisplay(rawPhone: string | null | undefined): string {
  if (!rawPhone) return "—";
  const digits = rawPhone.replace(/\D/g, "");
  const num = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (num.length === 11) {
    return `(${num.slice(0, 2)}) ${num.slice(2, 7)}-${num.slice(7)}`;
  }
  if (num.length === 10) {
    return `(${num.slice(0, 2)}) ${num.slice(2, 6)}-${num.slice(6)}`;
  }
  return rawPhone;
}

function cleanWhatsAppLink(rawPhone: string | null | undefined): string {
  if (!rawPhone) return "";
  let digits = rawPhone.replace(/\D/g, "");
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return `https://wa.me/${digits}`;
}

export function AuctionOrdersPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [auctions, setAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedAuctionId, setSelectedAuctionId] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const updateStatus = useServerFn(adminUpdateOrderStatus);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const [ordersRes, groupsRes, auctionsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("*, order_items(*), auctions(id, title, auction_number, group_jid)")
          .eq("origin", "auction")
          .order("created_at", { ascending: false }),
        (supabase as any).from("bot_groups").select("group_jid, group_name"),
        (supabase as any).from("auctions").select("id, title, auction_number").order("created_at", { ascending: false }),
      ]);

      if (ordersRes.data) setOrders(ordersRes.data);
      if (auctionsRes.data) setAuctions(auctionsRes.data);
      if (groupsRes.data) {
        const gMap: Record<string, string> = {};
        for (const g of groupsRes.data) {
          gMap[g.group_jid] = g.group_name || g.group_jid;
        }
        setGroups(gMap);
      }
    } catch (e: any) {
      console.error("[PEDIDOS-LEILAO] Erro ao carregar dados:", e);
      toast.error("Falha ao carregar pedidos de leilão.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadData(true);
    }
  }, [isAdmin, loadData]);

  // Realtime subscription
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("realtime-auction-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          loadData(false);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => {
          loadData(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, loadData]);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      await updateStatus({ data: { order_id: orderId, status: newStatus as any } });
      toast.success(`Status atualizado para ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atualizar status");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCopyPaymentLink = (order: any) => {
    const siteUrl = window.location.origin;
    const link = `${siteUrl}/pay/${order.id}`;
    navigator.clipboard.writeText(link);
    setCopiedId(order.id);
    toast.success("Link de pagamento copiado!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenWhatsAppCobrar = (order: any) => {
    const phone = order.phone?.replace(/\D/g, "");
    if (!phone) {
      toast.error("Telefone não disponível para cobrança.");
      return;
    }
    const siteUrl = window.location.origin;
    const link = `${siteUrl}/pay/${order.id}`;
    const total = (order.total_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    const items = (order.order_items || [])
      .map((it: any) => `• ${it.quantity}x ${it.card_name} (R$ ${((it.unit_price_cents || 0) / 100).toFixed(2).replace('.', ',')})`)
      .join("\n");

    const text = encodeURIComponent(
      `Olá ${order.recipient_name || ""}! Parabéns pelo seu arremate na *Sevii Colecionáveis* 🏆\n\n` +
      `📦 *Itens arrematados:*\n${items}\n\n` +
      `💰 *Total a pagar:* R$ ${total}\n\n` +
      `🔗 *Acesse o link seguro para efetuar o pagamento via PIX:*\n${link}\n\n` +
      `Qualquer dúvida estamos à disposição!`
    );

    let digits = phone;
    if (!digits.startsWith("55")) digits = `55${digits}`;
    window.open(`https://wa.me/${digits}?text=${text}`, "_blank");
  };

  // KPIs
  const kpis = useMemo(() => {
    const totalCount = orders.length;
    const pendingOrders = orders.filter((o) => o.status === "pending");
    const paidOrders = orders.filter((o) => ["paid", "preparing", "shipped", "delivered"].includes(o.status));
    const totalRevenueCents = paidOrders.reduce((sum, o) => sum + (o.total_cents || 0), 0);
    const pendingRevenueCents = pendingOrders.reduce((sum, o) => sum + (o.total_cents || 0), 0);

    return {
      totalCount,
      pendingCount: pendingOrders.length,
      paidCount: paidOrders.length,
      totalRevenue: totalRevenueCents / 100,
      pendingRevenue: pendingRevenueCents / 100,
    };
  }, [orders]);

  // Filtering
  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return orders.filter((o) => {
      // Status filter
      if (selectedStatus !== "all" && o.status !== selectedStatus) return false;

      // Auction filter
      if (selectedAuctionId !== "all") {
        if (o.auction_id !== selectedAuctionId) return false;
      }

      // Search query
      if (!q) return true;

      const orderNumber = (o.id || "").slice(0, 8).toLowerCase();
      const recipientName = (o.recipient_name || "").toLowerCase();
      const phone = (o.phone || "").toLowerCase();
      const notes = (o.notes || "").toLowerCase();
      const auctionTitle = (o.auctions?.title || "").toLowerCase();
      const auctionNumber = String(o.auctions?.auction_number || "");
      const itemsMatch = (o.order_items || []).some((it: any) =>
        (it.card_name || "").toLowerCase().includes(q)
      );

      return (
        orderNumber.includes(q) ||
        recipientName.includes(q) ||
        phone.includes(q) ||
        notes.includes(q) ||
        auctionTitle.includes(q) ||
        auctionNumber.includes(q) ||
        itemsMatch
      );
    });
  }, [orders, searchQuery, selectedStatus, selectedAuctionId]);

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-4 py-4 sticky top-0 bg-background/95 backdrop-blur z-20">
        <div className="mx-auto max-w-6xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <Gavel className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Pedidos Leilão</h1>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Tempo Real
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Pedidos gerados automaticamente a partir dos leilões e enquetes do WhatsApp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
            <Link
              to="/admin/leiloes-whatsapp"
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-bold text-background hover:opacity-90 transition"
            >
              Ver Leilões
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total de Pedidos</span>
              <Package className="h-4 w-4" />
            </div>
            <p className="text-2xl font-extrabold">{kpis.totalCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Originados de leilões</p>
          </div>

          <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-4">
            <div className="flex items-center justify-between text-amber-800 dark:text-amber-300 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Aguardando Pagamento</span>
              <Clock className="h-4 w-4" />
            </div>
            <p className="text-2xl font-extrabold text-amber-900 dark:text-amber-200">{kpis.pendingCount}</p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
              R$ {kpis.pendingRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} pendentes
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Pedidos Pagos</span>
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <p className="text-2xl font-extrabold text-emerald-900 dark:text-emerald-200">{kpis.paidCount}</p>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">Prontos ou em envio</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Faturamento Confirmado</span>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
              R$ {kpis.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Arrecadação de leilões</p>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por arrematante, WhatsApp, ID, carta, leilão ou grupo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Limpar
                </button>
              )}
            </div>

            {auctions.length > 0 && (
              <div className="w-full md:w-64">
                <select
                  value={selectedAuctionId}
                  onChange={(e) => setSelectedAuctionId(e.target.value)}
                  className="w-full py-2 px-3 text-sm rounded-lg border border-border bg-background"
                >
                  <option value="all">Todos os Leilões</option>
                  {auctions.map((a) => (
                    <option key={a.id} value={a.id}>
                      Leilão #{a.auction_number} — {a.title.slice(0, 30)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
              Status:
            </span>
            <button
              onClick={() => setSelectedStatus("all")}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                selectedStatus === "all"
                  ? "bg-foreground text-background"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              Todos ({orders.length})
            </button>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => {
              const count = orders.filter((o) => o.status === key).length;
              if (count === 0 && selectedStatus !== key) return null;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedStatus(key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                    selectedStatus === key
                      ? "bg-foreground text-background"
                      : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {config.label}
                  <span className="text-[10px] opacity-75 tabular-nums">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Orders Listing */}
        {loading && orders.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 opacity-50" />
            <p className="text-sm">Carregando pedidos de leilão...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
            <Gavel className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="text-base font-semibold">Nenhum pedido de leilão encontrado</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              {searchQuery || selectedStatus !== "all" || selectedAuctionId !== "all"
                ? "Nenhum resultado corresponde aos filtros aplicados. Tente limpar os filtros."
                : "Quando o bot finalizar um leilão no WhatsApp, os pedidos dos arrematantes aparecerão aqui automaticamente."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-medium px-1">
              Exibindo {filteredOrders.length} pedido(s) de leilão
            </p>

            {filteredOrders.map((order) => {
              const statusInfo = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
              const StatusIcon = statusInfo.icon;
              const items = order.order_items ?? [];
              const totalItemsCount = items.reduce((s: number, it: any) => s + (it.quantity ?? 0), 0);
              const auctionTitle = order.auctions?.title;
              const auctionNumber = order.auctions?.auction_number;
              const groupJid = order.auctions?.group_jid;
              const groupName = groupJid ? (groups[groupJid] || groupJid) : null;
              const totalFormatted = ((order.total_cents || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
              const subtotalFormatted = ((order.subtotal_cents || order.total_cents || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
              const shippingFormatted = ((order.shipping_cost_cents || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
              const formattedPhone = formatPhoneDisplay(order.phone);
              const waLink = cleanWhatsAppLink(order.phone);

              return (
                <div
                  key={order.id}
                  className="rounded-xl border border-border bg-card overflow-hidden transition hover:border-foreground/30 hover:shadow-sm"
                >
                  {/* Top Bar of Card */}
                  <div className="px-4 py-2.5 bg-secondary/30 border-b border-border flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </span>

                      {auctionNumber ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-primary/10 text-primary">
                          <Gavel className="h-3 w-3" />
                          Leilão #{auctionNumber}{auctionTitle ? `: ${auctionTitle}` : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-primary/10 text-primary">
                          <Gavel className="h-3 w-3" />
                          Leilão WhatsApp
                        </span>
                      )}

                      {groupName && (
                        <span className="text-[11px] text-muted-foreground truncate max-w-xs">
                          👥 {groupName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusInfo.badgeClass}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {statusInfo.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {new Date(order.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    {/* Customer & Contact Info */}
                    <div className="min-w-0 md:w-1/3">
                      <p className="text-sm font-bold text-foreground truncate">
                        {order.recipient_name || "Arrematante"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground font-mono">
                          {formattedPhone}
                        </span>
                        {waLink && (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                            title="Conversar no WhatsApp"
                          >
                            <MessageCircle className="h-3 w-3" />
                            WhatsApp
                          </a>
                        )}
                      </div>
                      {order.notes && (
                        <p className="text-[11px] text-muted-foreground/80 mt-1 italic line-clamp-1">
                          {order.notes}
                        </p>
                      )}
                    </div>

                    {/* Items Won Preview */}
                    <div className="flex-1 min-w-0 w-full md:w-auto">
                      <div className="flex items-center gap-3">
                        <div className="flex shrink-0 -space-x-2 overflow-hidden py-1">
                          {items.slice(0, 4).map((it: any) => (
                            <div
                              key={it.id}
                              className="h-14 w-11 rounded-md overflow-hidden bg-secondary border-2 border-card ring-1 ring-border grid place-items-center shrink-0 shadow-sm"
                              title={it.card_name}
                            >
                              {it.card_image ? (
                                <img
                                  src={it.card_image}
                                  alt={it.card_name}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <ImageOff className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </div>
                          ))}
                          {items.length > 4 && (
                            <div className="h-14 w-11 rounded-md border-2 border-card ring-1 ring-border bg-secondary grid place-items-center text-xs font-bold text-muted-foreground shrink-0">
                              +{items.length - 4}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate">
                            {items.map((it: any) => `${it.quantity > 1 ? `${it.quantity}x ` : ""}${it.card_name}`).join(", ") || "Itens do Leilão"}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {totalItemsCount} {totalItemsCount === 1 ? "lote arrematado" : "lotes arrematados"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Financial & Status Controls */}
                    <div className="flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border">
                      <div className="text-left md:text-right">
                        <p className="text-lg font-extrabold text-foreground tabular-nums">
                          R$ {totalFormatted}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Subtotal: R$ {subtotalFormatted}
                          {Number(order.shipping_cost_cents) > 0 && ` · Frete: R$ ${shippingFormatted}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 mt-2">
                        <select
                          value={order.status}
                          disabled={updatingId === order.id}
                          onChange={(e) => handleStatusChange(order.id, e.target.value)}
                          className="text-xs font-semibold rounded-md border border-border bg-background px-2 py-1 focus:ring-1 focus:ring-primary"
                        >
                          {Object.entries(STATUS_CONFIG).map(([val, conf]) => (
                            <option key={val} value={val}>
                              {conf.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="px-4 py-2.5 bg-secondary/15 border-t border-border flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopyPaymentLink(order)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-secondary transition"
                      >
                        {copiedId === order.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-emerald-600 font-semibold">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copiar link de pagamento
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleOpenWhatsAppCobrar(order)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 px-2 py-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Cobrar no WhatsApp
                      </button>
                    </div>

                    <Link
                      to="/admin/orders/$orderId"
                      params={{ orderId: order.id }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      Ver detalhes completos
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
export default AuctionOrdersPage;
