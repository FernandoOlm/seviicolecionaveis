import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Radio, CheckCircle2, Megaphone } from "lucide-react";

export const Route = createFileRoute("/admin/acompanhar-leilao")({
  head: () => ({ meta: [{ title: "Acompanhar Leilão — Admin" }] }),
  validateSearch: (s: { id?: string }): { id?: string } => ({
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  component: TrackAuctionPage,
});

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const maskPhone = (p: string) => (p.length > 6 ? `${p.slice(0, 4)}****${p.slice(-4)}` : p);

function useCountdown(target?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!target) return "—";
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return "encerrado";
  const s = Math.floor(diff / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
}

function TrackAuctionPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const { id } = Route.useSearch();
  const [auction, setAuction] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    const [{ data: a }, { data: its }, { data: bds }] = await Promise.all([
      (supabase as any).from("auctions").select("*").eq("id", id).maybeSingle(),
      (supabase as any).from("auction_items").select("*").eq("auction_id", id).order("sequence"),
      (supabase as any).from("auction_bids").select("*").eq("auction_id", id).order("created_at"),
    ]);
    setAuction(a ?? null);
    setItems(its ?? []);
    setBids(bds ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!isAdmin) return;
    load();
    const ch = (supabase as any)
      .channel(`auction-live-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_bids" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_items" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "auctions" }, () => load())
      .subscribe();
    return () => {
      (supabase as any).removeChannel(ch);
    };
  }, [isAdmin, id, load]);

  const countdown = useCountdown(auction?.scheduled_end);

  const bidsByItem = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const b of bids) {
      const key = b.item_id ?? `seq:${b.sequence}`;
      m.set(key, [...(m.get(key) ?? []), b]);
    }
    return m;
  }, [bids]);

  if (authLoading || loading) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  if (!isAdmin) {
    nav({ to: "/" });
    return null;
  }
  if (!id || !auction) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm">
        Leilão não encontrado.{" "}
        <Link to="/admin/leiloes-whatsapp" className="underline">
          Voltar
        </Link>
      </div>
    );
  }

  const closeNow = async () => {
    if (!confirm("Encerrar este leilão agora? O bot fechará as enquetes no grupo.")) return;
    setBusy(true);
    const { error } = await (supabase as any).from("auction_schedules").insert({
      auction_id: auction.id,
      action: "CLOSE",
      scheduled_time: new Date().toISOString(),
      group_jid: auction.group_jid,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Encerramento solicitado ao bot.");
    load();
  };

  const approveAll = async () => {
    const pending = bids.filter((b) => b.status === "pending");
    if (pending.length === 0) return toast.info("Nenhum lance pendente.");
    if (!confirm(`Aprovar ${pending.length} arremate(s)?`)) return;
    setBusy(true);
    const { error } = await (supabase as any)
      .from("auction_bids")
      .update({ status: "approved" })
      .eq("auction_id", auction.id)
      .eq("status", "pending");
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Arremates aprovados. O bot avisará os vencedores.");
    load();
  };

  const totalApproved = bids.filter((b) => b.status === "approved").reduce((s, b) => s + Number(b.amount), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <Link to="/admin/leiloes-whatsapp" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Leilões
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
        <div>
          <p className="text-sm font-black uppercase">
            Leilão #{auction.auction_number} — {auction.title}
          </p>
          <p className="text-xs text-muted-foreground">
            Encerra em <span className="font-bold text-foreground">{countdown}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {auction.status === "live" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">
              <Radio className="h-3 w-3" /> Ao Vivo
            </span>
          )}
          {auction.status !== "finished" && (
            <button
              onClick={closeNow}
              disabled={busy}
              className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Encerrar Leilão Manualmente
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => {
          const hist = bidsByItem.get(it.id) ?? bidsByItem.get(`seq:${it.sequence}`) ?? [];
          return (
            <div key={it.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex gap-3">
                {it.image_url ? (
                  <img src={it.image_url} alt={it.name} className="h-16 w-16 rounded object-cover" />
                ) : (
                  <div className="h-16 w-16 rounded border border-dashed border-border" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    #{it.sequence} {it.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{it.description}</p>
                  <p className="text-xs font-semibold">
                    {it.final_bid ? `Vencedor: ${brl(Number(it.final_bid))}` : `Inicial: ${brl(Number(it.starting_price))}`}
                  </p>
                  {it.winner_phone && (
                    <p className="text-[11px] text-muted-foreground">{maskPhone(it.winner_phone)}</p>
                  )}
                </div>
              </div>
              {hist.length > 0 && (
                <ul className="space-y-0.5 border-t border-border pt-2 text-[11px] text-muted-foreground">
                  {hist.map((b: any) => (
                    <li key={b.id}>
                      {maskPhone(b.phone)} — {brl(Number(b.amount))}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {(auction.status === "finished" || bids.length > 0) && (
        <section className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide">Pós-leilão · Lances recebidos</h2>
            <button
              onClick={approveAll}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-bold text-background disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar Todos os Arremates
            </button>
          </div>
          {bids.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum lance recebido do bot ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="py-1">Lote</th>
                    <th>Item</th>
                    <th>Telefone</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Anunciado</th>
                  </tr>
                </thead>
                <tbody>
                  {bids.map((b) => (
                    <tr key={b.id} className="border-t border-border">
                      <td className="py-1.5">#{b.sequence}</td>
                      <td>{b.item_name}</td>
                      <td>{maskPhone(b.phone)}</td>
                      <td>{brl(Number(b.amount))}</td>
                      <td>{b.status}</td>
                      <td>{b.announced ? <Megaphone className="h-3.5 w-3.5" /> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="pt-2 text-xs font-bold">Total aprovado: {brl(totalApproved)}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
