import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AdminCancellationBell } from "@/components/AdminCancellationBell";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ChevronRight, ImageOff, Search } from "lucide-react";



export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Sevii Colecionáveis" }] }),
  validateSearch: (search: { focus?: string }): { focus?: string } => ({
    focus: typeof search.focus === "string" ? search.focus : undefined,
  }),
  component: AdminPage,
});

const STATUSES = ["pending", "paid", "preparing", "shipped", "awaiting_pickup", "delivered", "cancelled"] as const;
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

const SHIPPING_METHODS = ["fixed", "arrange", "card_stack", "arte_em_cards", "presencial", "superfrete", "delivery_app"] as const;
const SHIPPING_METHOD_LABEL: Record<string, string> = {
  fixed: "Frete fixo",
  superfrete: "SuperFrete",
  arte_em_cards: "Retirada na Arte em Cards",
  card_stack: "Pilha de Cartas",
  presencial: "Retirada presencial",
  arrange: "Envio a combinar",
  delivery_app: "Aplicativo de entrega",
};

function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const search = Route.useSearch();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const ALL_STATUSES = [...STATUSES, "cancellation_requested"] as const;
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(() => {
    if (typeof window === "undefined") return [...ALL_STATUSES];
    const raw = localStorage.getItem("admin-orders-filter-v2");
    if (!raw) return [...ALL_STATUSES];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [...ALL_STATUSES];
  });

  const [selectedShippingMethods, setSelectedShippingMethods] = useState<string[]>(() => {
    if (typeof window === "undefined") return [...SHIPPING_METHODS];
    const raw = localStorage.getItem("admin-orders-shipping-filter");
    if (!raw) return [...SHIPPING_METHODS];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [...SHIPPING_METHODS];
  });


  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("admin-orders-filter-v2", JSON.stringify(selectedStatuses));
    }
  }, [selectedStatuses]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("admin-orders-shipping-filter", JSON.stringify(selectedShippingMethods));
    }
  }, [selectedShippingMethods]);

  const toggleStatus = (s: string) => {
    setSelectedStatuses((curr) =>
      curr.includes(s) ? curr.filter((x) => x !== s) : [...curr, s],
    );
  };

  const toggleShippingMethod = (s: string) => {
    setSelectedShippingMethods((curr) =>
      curr.includes(s) ? curr.filter((x) => x !== s) : [...curr, s],
    );
  };
  const isOrdersRoute = location.pathname === "/admin";
  const focusId = search.focus;
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user) nav({ to: "/auth" });
      else if (!isAdmin) nav({ to: "/" });
    }
  }, [authLoading, user, isAdmin, nav]);

  const loadRef = useRef<(showSpinner?: boolean) => Promise<void>>(async () => {});
  loadRef.current = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .order("created_at", { ascending: false });
    setOrders(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin && isOrdersRoute) loadRef.current(true);
  }, [isAdmin, isOrdersRoute]);

  useEffect(() => {
    if (!isAdmin || !isOrdersRoute) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { loadRef.current(false); }, 400);
    };
    const channel = supabase
      .channel("admin-orders-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        scheduleReload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        scheduleReload,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [isAdmin, isOrdersRoute]);

  useEffect(() => {
    if (!focusId || orders.length === 0) return;
    const target = orders.find((o) => o.id === focusId);
    if (!target) return;
    setSelectedStatuses((curr: string[]) => (curr.includes(target.status) ? curr : [...curr, target.status]));
  }, [focusId, orders]);

  useEffect(() => {
    if (!focusId || loading) return;
    const t = setTimeout(() => {
      focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(t);
  }, [focusId, loading, orders]);


  if (authLoading || !isAdmin) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!isOrdersRoute) {
    return (
      <div className="min-h-screen bg-background flex">
        <AdminSidebar />
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    );
  }

  const query = searchQuery.trim().toLowerCase();

  const filtered = orders.filter((o) => {
    // Pedidos de leilão são geridos exclusivamente em /admin/pedidos-leilao
    if (o.origin === "auction") return false;
    if (!selectedStatuses.includes(o.status)) return false;
    if (!selectedShippingMethods.includes(o.shipping_method ?? "")) return false;
    const items: any[] = o.order_items ?? [];

    if (!query) return true;
    const matchId = o.id.toLowerCase().includes(query) || o.id.slice(0, 8).toLowerCase().includes(query);
    const matchName = (o.recipient_name ?? "").toLowerCase().includes(query);
    const matchEmail = (o.email ?? "").toLowerCase().includes(query);
    const matchItem = items.some((it) => (it.card_name ?? "").toLowerCase().includes(query));
    return matchId || matchName || matchEmail || matchItem;
  });

  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4">
          <Link to="/" className="text-sm font-bold uppercase tracking-widest">Sevii Colecionáveis · Admin</Link>
          <AdminCancellationBell />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">

        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold">Pedidos ({filtered.length})</h1>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Filtrar por status</p>
                <div className="flex gap-2 text-[10px]">
                  <button
                    onClick={() => setSelectedStatuses([...ALL_STATUSES])}
                    className="text-foreground hover:underline font-semibold"
                  >
                    Todos
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    onClick={() => setSelectedStatuses([])}
                    className="text-foreground hover:underline font-semibold"
                  >
                    Nenhum
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {ALL_STATUSES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedStatuses.includes(s)}
                      onChange={() => toggleStatus(s)}
                      className="h-4 w-4 rounded border-border accent-foreground"
                    />
                    {STATUS_LABEL[s]}
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Filtrar por entrega</p>
                <div className="flex gap-2 text-[10px]">
                  <button
                    onClick={() => setSelectedShippingMethods([...SHIPPING_METHODS])}
                    className="text-foreground hover:underline font-semibold"
                  >
                    Todos
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    onClick={() => setSelectedShippingMethods([])}
                    className="text-foreground hover:underline font-semibold"
                  >
                    Nenhum
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {SHIPPING_METHODS.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedShippingMethods.includes(s)}
                      onChange={() => toggleShippingMethod(s)}
                      className="h-4 w-4 rounded border-border accent-foreground"
                    />
                    {SHIPPING_METHOD_LABEL[s]}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>




        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nº do pedido, nome do cliente ou nome da carta..."
            className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-4 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((o) => {
              const items: any[] = o.order_items ?? [];
              const totalQty = items.reduce((s, it) => s + (it.quantity ?? 0), 0);
              const visible = items.slice(0, 5);
              const extra = items.length - visible.length;
              const isHighlight = o.id === focusId;
              const isCancellation = o.status === "cancellation_requested";
              return (
                <Link
                  key={o.id}
                  to="/admin/orders/$orderId"
                  params={{ orderId: o.id }}
                  ref={isHighlight ? (focusRef as any) : undefined}
                  className={`group flex items-center gap-4 rounded-xl border bg-card p-4 hover:border-foreground/40 hover:shadow-sm transition ${
                    isHighlight
                      ? "border-orange-500 ring-2 ring-orange-300"
                      : isCancellation
                        ? "border-orange-300"
                        : "border-border"
                  }`}
                >
                  <div className="flex shrink-0 -space-x-2">
                    {visible.map((it: any) => (
                      <div
                        key={it.id}
                        className="h-16 w-12 rounded-md overflow-hidden bg-secondary border-2 border-card ring-1 ring-border grid place-items-center"
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
                          <ImageOff className="h-4 w-4 text-muted-foreground" />
                        )}
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
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
                          isCancellation
                            ? "bg-orange-100 text-orange-800"
                            : o.status === "pending"
                              ? "bg-yellow-100 text-yellow-800"
                              : o.status === "paid"
                                ? "bg-blue-100 text-blue-800"
                                : o.status === "shipped"
                                  ? "bg-purple-100 text-purple-800"
                                  : o.status === "delivered"
                                    ? "bg-green-100 text-green-800"
                                    : o.status === "cancelled"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-secondary text-foreground"
                        }`}
                      >
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </div>
                    <p className="text-sm font-semibold mt-1 truncate">{o.recipient_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {o.email}
                      {o.phone ? ` · ${o.phone}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(o.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" · "}
                      {totalQty} {totalQty === 1 ? "item" : "itens"}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-base font-bold tabular-nums">
                      R$ {(o.total_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                    <ChevronRight className="h-5 w-5 text-muted-foreground inline-block mt-1 group-hover:translate-x-0.5 transition" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      </div>
    </div>
  );
}


