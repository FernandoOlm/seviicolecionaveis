import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getMyStack } from "@/lib/card-stack.functions";
import { Checkbox } from "@/components/ui/checkbox";
import logoUrl from "@/assets/logo.webp";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pilha/")({
  head: () => ({
    meta: [
      { title: "Pilha de Cartas — Sevii Colecionáveis" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PilhaPage,
});

function useCountdown(targetIso: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!targetIso) return null;
  const diff = new Date(targetIso).getTime() - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return { days, hours, minutes, seconds, expired: false };
}

function PilhaPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  const { data: stack, isLoading } = useQuery({
    queryKey: ["card-stack", user?.id],
    queryFn: () => getMyStack(),
    enabled: !!user,
  });

  const { data: reopened } = useQuery({
    queryKey: ["pickup-reopened", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("id").eq("reschedule_required", true).eq("schedule_kind", "pickup");
      return data ?? [];
    },
    enabled: !!user,
  });

  const countdown = useCountdown(stack?.expiresAt);
  const urgent = !!countdown && !countdown.expired && countdown.days < 7;
  const critical = !!countdown && !countdown.expired && countdown.days < 2;

  const allChecked = useMemo(
    () => !!stack && stack.items.length > 0 && stack.items.every((i) => selected.has(i.id)),
    [stack, selected],
  );

  const toggleAll = () => {
    if (!stack) return;
    setSelected(allChecked ? new Set() : new Set(stack.items.map((i) => i.id)));
  };

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading || !user) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img src={logoUrl} alt="Sevii Colecionáveis" className="h-12 w-auto sm:h-14" />
          </Link>
          <Link to="/conta" className="text-xs font-semibold uppercase tracking-widest hover:underline">
            ← Minha conta
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 pb-32 sm:px-6">
        <h1 className="text-2xl font-bold mb-1">🃏 Pilha de Cartas</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Guarde suas cartas por até 30 dias e solicite o envio quando quiser.
        </p>
        {(reopened ?? []).map((o) => (
          <Link key={o.id} to="/orders/$orderId" params={{ orderId: o.id }}
            className="mb-4 block rounded-md border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-950 hover:underline">
            <strong>Reagendamento necessário</strong> — pedido #{o.id.slice(0, 8).toUpperCase()}: escolha um novo horário de retirada →
          </Link>
        ))}

        {isLoading && <p className="text-sm text-muted-foreground">Carregando sua pilha…</p>}

        {!isLoading && !stack && (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Você ainda não tem nenhuma pilha ativa. No checkout, escolha{" "}
            <span className="font-semibold text-foreground">Pilha de Cartas</span> como forma de envio
            para começar.
          </div>
        )}

        {stack && (
          <>
            <section
              className={`rounded-xl border p-5 mb-6 ${
                critical
                  ? "border-red-300 bg-red-50"
                  : urgent
                    ? "border-amber-300 bg-amber-50"
                    : "border-border bg-card"
              }`}
            >
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Início</p>
                  <p className="text-sm font-semibold mt-1">
                    {new Date(stack.startedAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Vencimento</p>
                  <p className="text-sm font-semibold mt-1">
                    {new Date(stack.expiresAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Cartas</p>
                  <p className="text-sm font-semibold mt-1">{stack.totalCards}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Pedidos</p>
                  <p className="text-sm font-semibold mt-1">{stack.totalOrders}</p>
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-border/60">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                  Tempo restante
                </p>
                {countdown?.expired ? (
                  <p className="text-lg font-bold text-red-700">Pilha vencida</p>
                ) : countdown ? (
                  <div className="flex gap-3 text-center">
                    {[
                      { label: "dias", value: countdown.days },
                      { label: "horas", value: countdown.hours },
                      { label: "min", value: countdown.minutes },
                      { label: "seg", value: countdown.seconds },
                    ].map((b) => (
                      <div key={b.label} className="rounded-md bg-background/70 border border-border px-3 py-2 min-w-[64px]">
                        <p className="text-xl font-bold tabular-nums">{b.value.toString().padStart(2, "0")}</p>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{b.label}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            {stack.items.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                Nenhuma carta armazenada no momento.
              </div>
            ) : (
              <section className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest cursor-pointer">
                    <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
                    Selecionar tudo
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {selected.size} selecionada(s)
                  </span>
                </div>

                <ul className="divide-y divide-border">
                  {stack.items.map((i) => (
                    <li
                      key={i.id}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest("a, button, input, [role='checkbox']")) return;
                        toggle(i.id);
                      }}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/30 active:bg-secondary/50"
                    >
                      <Checkbox
                        checked={selected.has(i.id)}
                        onCheckedChange={() => toggle(i.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {i.cardImage ? (
                        <img
                          src={i.cardImage}
                          alt={i.cardName}
                          className="h-14 w-10 object-cover rounded-sm border border-border"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-14 w-10 rounded-sm bg-muted" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {i.quantity}× {i.cardName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[i.collection, i.cardNumber, i.finish, i.language, i.condition]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {i.auctionName ? (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                            🔨 Leilão: {i.auctionName}
                            {i.auctionDate
                              ? ` · ${new Date(i.auctionDate + "T00:00:00").toLocaleDateString("pt-BR")}`
                              : ""}
                          </p>
                        ) : i.orderId ? (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Pedido{" "}
                            <Link
                              to="/orders/$orderId"
                              params={{ orderId: i.orderId }}
                              className="font-mono underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              #{i.orderId.slice(0, 8)}
                            </Link>
                            {i.orderCreatedAt
                              ? ` · ${new Date(i.orderCreatedAt).toLocaleDateString("pt-BR")}`
                              : ""}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="px-4 py-4 border-t border-border bg-secondary/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Selecione as cartas que deseja solicitar.
                  </p>
                  <button
                    type="button"
                    disabled={selected.size === 0}
                    onClick={() => {
                      const ids = Array.from(selected);
                      try {
                        sessionStorage.setItem("pilha:selectedItems", JSON.stringify(ids));
                      } catch {}
                      nav({ to: "/pilha/solicitar", search: { items: ids.join(",") } });
                    }}
                    className="w-full sm:w-auto rounded-full bg-foreground px-5 py-3 text-xs font-semibold uppercase tracking-wide text-background disabled:bg-foreground/30 disabled:cursor-not-allowed"
                  >
                    {selected.size === 0
                      ? "Selecione cartas para solicitar"
                      : `Solicitar Retirada / Envio (${selected.size})`}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}