import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Meus pedidos — Sevii Colecionáveis" },
      { name: "description", content: "Histórico e status dos seus pedidos de cartas Pokémon na Sevii Colecionáveis." },
      { property: "og:title", content: "Meus pedidos — Sevii Colecionáveis" },
      { property: "og:description", content: "Acompanhe seus pedidos e o status de envio." },
      { property: "og:url", content: "https://seviicolecionaveis.lovable.app/orders" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrdersPage,
});

const STATUS_LABEL: Record<string, string> = { ...ORDER_STATUS_LABELS, pending: "Aguardando pagamento", cancellation_requested: "Cancelamento em análise" };
const STATUS_COLOR: Record<string, string> = {
  preparing: "bg-muted text-muted-foreground",
  separated: "bg-secondary text-secondary-foreground",
  cards_pending_delivery: "bg-accent text-accent-foreground",
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  awaiting_pickup: "bg-amber-100 text-amber-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  cancellation_requested: "bg-orange-100 text-orange-800",
};

function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/auth" });
  }, [authLoading, user, nav]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, created_at, status, total_cents, order_items(id, card_name, card_image, quantity)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setOrders(data ?? []);
        setLoading(false);
      }
    };
    load();

    const channel = supabase
      .channel(`orders-list-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` },
        () => { load(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (authLoading || loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <Link to="/" className="text-sm font-bold uppercase tracking-widest">Sevii Colecionáveis</Link>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Catálogo</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Meus pedidos</h1>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Você ainda não fez nenhum pedido.</p>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              const items = o.order_items ?? [];
              const totalQty = items.reduce((s: number, it: any) => s + (it.quantity ?? 0), 0);
              const visible = items.slice(0, 5);
              const extra = items.length - visible.length;
              return (
                <Link
                  key={o.id}
                  to="/orders/$orderId"
                  params={{ orderId: o.id }}
                  className="group flex items-center gap-4 rounded-xl border border-border p-4 bg-card hover:border-foreground/40 hover:shadow-sm transition"
                >
                  <div className="flex shrink-0 -space-x-2">
                    {visible.map((it: any) => (
                      <div
                        key={it.id}
                        className="h-16 w-12 rounded-md overflow-hidden bg-secondary border-2 border-card ring-1 ring-border"
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
                        ) : null}
                      </div>
                    ))}
                    {extra > 0 && (
                      <div className="h-16 w-12 rounded-md border-2 border-card ring-1 ring-border bg-secondary grid place-items-center text-xs font-semibold text-muted-foreground">
                        +{extra}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-mono text-muted-foreground">#{o.id.slice(0, 8)}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${STATUS_COLOR[o.status] ?? "bg-secondary"}`}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(o.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                      {" · "}
                      {totalQty} {totalQty === 1 ? "item" : "itens"}
                    </p>
                    <p className="text-base font-bold tabular-nums mt-1">
                      R$ {(o.total_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition" />
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
