import { PAID_ORDER_STATUSES } from "@/lib/order-status";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useCardsCatalog } from "@/hooks/useCardsCatalog";
import { useCardStats } from "@/hooks/useCardStats";
import { TrendingUp, Eye, ShoppingBag, AlertTriangle, Download, Mail } from "lucide-react";
import { AdminCancellationBell } from "@/components/AdminCancellationBell";
import { resendPendingOrderEmails } from "@/utils/payments.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard — Sevii Admin" },
    { name: "description", content: "Acompanhe e gerencie os pedidos da Sevii Colecionáveis." },
    { property: "og:title", content: "Dashboard — Sevii Admin" },
    { property: "og:description", content: "Acompanhe e gerencie os pedidos da Sevii Colecionáveis." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const { cards } = useCardsCatalog();
  const stats = useCardStats();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAdmin) nav({ to: "/" });
  }, [authLoading, isAdmin, nav]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from("orders")
      .select("*, order_items(*)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders(data ?? []);
        setLoading(false);
      });
  }, [isAdmin]);

  const metrics = useMemo(() => {
    const now = Date.now();
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recent = orders.filter((o) => new Date(o.created_at).getTime() >= monthAgo);
    const revenueTotal = orders
      .filter((o) => PAID_ORDER_STATUSES.includes(o.status))
      .reduce((s, o) => s + (o.total_cents ?? 0), 0);
    const pending = orders.filter((o) => o.status === "pending").length;
    const totalViews = Array.from(stats.views.values()).reduce((a, b) => a + b, 0);
    const totalSales = Array.from(stats.sales.values()).reduce((a, b) => a + b, 0);
    const lowStock = cards.filter((c) => c.stock > 0 && c.stock <= 2).length;
    return {
      revenueTotal,
      ordersMonth: recent.length,
      pending,
      totalViews,
      totalSales,
      lowStock,
    };
  }, [orders, stats, cards]);

  const topViewed = useMemo(
    () =>
      [...cards]
        .map((c) => ({ c, v: stats.views.get(c.id) ?? 0 }))
        .filter((x) => x.v > 0)
        .sort((a, b) => b.v - a.v)
        .slice(0, 8),
    [cards, stats],
  );

  const topSold = useMemo(
    () =>
      [...cards]
        .map((c) => ({ c, s: stats.sales.get(c.id) ?? 0 }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 8),
    [cards, stats],
  );

  const lowStockList = useMemo(
    () =>
      [...cards]
        .filter((c) => c.stock > 0 && c.stock <= 2)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 10),
    [cards],
  );

  const exportCSV = () => {
    const rows = [
      [
        "ID", "Data", "Cliente", "Email", "Telefone", "CPF", "Status",
        "Subtotal", "Frete", "Desconto", "Total", "Cupom", "CEP", "Endereço",
        "Bairro", "Cidade", "Estado", "Itens",
      ],
    ];
    for (const o of orders) {
      const items = (o.order_items ?? [])
        .map((i: any) => `${i.quantity}x ${i.card_name} (${i.finish}, ${i.language}, ${i.condition})`)
        .join(" | ");
      rows.push([
        o.id,
        new Date(o.created_at).toLocaleString("pt-BR"),
        o.recipient_name ?? "",
        o.email ?? "",
        o.phone ?? "",
        o.cpf ?? "",
        o.status ?? "",
        ((o.subtotal_cents ?? 0) / 100).toFixed(2),
        ((o.shipping_cost_cents ?? 0) / 100).toFixed(2),
        ((o.discount_cents ?? 0) / 100).toFixed(2),
        ((o.total_cents ?? 0) / 100).toFixed(2),
        o.coupon_code ?? "",
        o.cep ?? "",
        `${o.street ?? ""}, ${o.number ?? ""}${o.complement ? " " + o.complement : ""}`,
        o.neighborhood ?? "",
        o.city ?? "",
        o.state ?? "",
        items,
      ]);
    }
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading || !isAdmin) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando...</div>;
  }

  const fmtBRL = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4 flex-wrap">
          <Link to="/" className="text-sm font-bold uppercase tracking-widest">Sevii · Dashboard</Link>
          <div className="flex items-center gap-3">
            <AdminCancellationBell />
            <div className="flex gap-3 text-xs">
              <Link to="/admin" className="font-semibold hover:underline">Pedidos</Link>
              <Link to="/admin/manage-cards" className="font-semibold hover:underline">Cartas</Link>
              <Link to="/admin/banners" className="font-semibold hover:underline">Banners</Link>
              <Link to="/" className="text-muted-foreground hover:text-foreground">← Catálogo</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold">Visão geral</h1>
          <div className="flex flex-wrap gap-2">
            <ResendPendingEmailsButton />
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 rounded-md bg-foreground text-background px-4 py-2 text-xs font-bold uppercase tracking-wider hover:opacity-90"
            >
              <Download className="h-3.5 w-3.5" /> Exportar pedidos (CSV)
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando métricas...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="Receita total"
                value={fmtBRL(metrics.revenueTotal)}
              />
              <MetricCard
                icon={<ShoppingBag className="h-4 w-4" />}
                label="Pedidos (30d)"
                value={String(metrics.ordersMonth)}
              />
              <MetricCard
                icon={<AlertTriangle className="h-4 w-4 text-condition-played" />}
                label="Pendentes"
                value={String(metrics.pending)}
              />
              <MetricCard
                icon={<Eye className="h-4 w-4" />}
                label="Visualizações"
                value={metrics.totalViews.toLocaleString("pt-BR")}
              />
              <MetricCard
                icon={<ShoppingBag className="h-4 w-4" />}
                label="Cartas vendidas"
                value={metrics.totalSales.toLocaleString("pt-BR")}
              />
              <MetricCard
                icon={<AlertTriangle className="h-4 w-4 text-condition-played" />}
                label="Estoque baixo"
                value={String(metrics.lowStock)}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Section title="Mais vistas">
                {topViewed.length === 0 ? (
                  <Empty>Sem visualizações registradas ainda.</Empty>
                ) : (
                  topViewed.map((x) => (
                    <Row
                      key={x.c.id}
                      name={x.c.name}
                      sub={`${x.c.collection} · #${x.c.number}`}
                      value={`${x.v} ${x.v === 1 ? "view" : "views"}`}
                    />
                  ))
                )}
              </Section>

              <Section title="Mais vendidas">
                {topSold.length === 0 ? (
                  <Empty>Sem vendas registradas ainda.</Empty>
                ) : (
                  topSold.map((x) => (
                    <Row
                      key={x.c.id}
                      name={x.c.name}
                      sub={`${x.c.collection} · #${x.c.number}`}
                      value={`${x.s} un.`}
                    />
                  ))
                )}
              </Section>
            </div>

            <Section title="Estoque baixo (≤ 2 unidades)">
              {lowStockList.length === 0 ? (
                <Empty>Tudo em ordem.</Empty>
              ) : (
                lowStockList.map((c) => (
                  <Row
                    key={c.id}
                    name={c.name}
                    sub={`${c.collection} · #${c.number}`}
                    value={`${c.stock} un.`}
                  />
                ))
              )}
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <h2 className="px-4 py-3 text-xs uppercase tracking-widest font-bold border-b border-border">
        {title}
      </h2>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({ name, sub, value }: { name: string; sub: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground truncate">{sub}</p>
      </div>
      <span className="shrink-0 text-xs font-bold tabular-nums">{value}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-xs text-muted-foreground italic">{children}</p>;
}

function ResendPendingEmailsButton() {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    if (!confirm("Reenviar o e-mail de cobrança para TODOS os pedidos com pagamento pendente?")) return;
    setBusy(true);
    try {
      const r = await resendPendingOrderEmails({});
      toast.success(`E-mails reenviados: ${r.sent} de ${r.total}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao reenviar e-mails");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={handle}
      disabled={busy}
      className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-secondary disabled:opacity-50"
    >
      <Mail className="h-3.5 w-3.5" /> {busy ? "Enviando..." : "Reenviar e-mails pendentes"}
    </button>
  );
}
