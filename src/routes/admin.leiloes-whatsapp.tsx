import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Radio, Clock, CheckCircle2, Trash2, Pencil, Eye, Copy } from "lucide-react";

export const Route = createFileRoute("/admin/leiloes-whatsapp")({
  head: () => ({ meta: [{ title: "Leilões WhatsApp — Admin" }] }),
  component: AuctionsListPage,
});

export type AuctionRow = {
  id: string;
  auction_number: number;
  title: string;
  group_jid: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string;
  auction_items?: { count: number }[];
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendado",
  live: "Ao Vivo",
  finished: "Finalizado",
  cancelled: "Cancelado",
};

const TABS = [
  { key: "all", label: "Todos" },
  { key: "live", label: "Ao Vivo 🔴" },
  { key: "scheduled", label: "Agendados ⏳" },
  { key: "finished", label: "Concluídos ✅" },
] as const;

export function fmtDate(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function AuctionsListPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<AuctionRow[]>([]);
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data }, { data: grp }] = await Promise.all([
      (supabase as any)
        .from("auctions")
        .select("id, auction_number, title, group_jid, status, scheduled_start, scheduled_end, auction_items(count)")
        .order("scheduled_start", { ascending: false }),
      (supabase as any).from("bot_groups").select("group_jid, group_name"),
    ]);
    setRows(data ?? []);
    const map: Record<string, string> = {};
    for (const g of grp ?? []) map[g.group_jid] = g.group_name ?? g.group_jid;
    setGroups(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load();
    const ch = (supabase as any)
      .channel("admin-auctions")
      .on("postgres_changes", { event: "*", schema: "public", table: "auctions" }, () => load())
      .subscribe();
    return () => {
      (supabase as any).removeChannel(ch);
    };
  }, [isAdmin, load]);

  if (authLoading || loading) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  if (!isAdmin) {
    nav({ to: "/" });
    return null;
  }

  const filtered = rows.filter((r) => (tab === "all" ? true : r.status === tab));

  const remove = async (id: string) => {
    if (!confirm("Excluir este leilão e todos os seus lotes?")) return;
    const { error } = await (supabase as any).from("auctions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Leilão excluído.");
    load();
  };

  const duplicate = async (id: string) => {
    if (!confirm("Copiar este leilão? Uma cópia em rascunho será criada.")) return;
    setLoading(true);
    try {
      const [{ data: a }, { data: its }] = await Promise.all([
        (supabase as any).from("auctions").select("*").eq("id", id).maybeSingle(),
        (supabase as any).from("auction_items").select("*").eq("auction_id", id).order("sequence"),
      ]);
      if (!a) return toast.error("Leilão não encontrado.");

      const { data: created, error: insertErr } = await (supabase as any)
        .from("auctions")
        .insert({
          title: `${a.title} (Cópia)`,
          description: a.description,
          group_jid: a.group_jid,
          status: "draft",
          scheduled_start: null,
          scheduled_end: null,
          closing_message: a.closing_message,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      if (its?.length) {
        const copied = its.map((i: any, idx: number) => ({
          auction_id: created.id,
          sequence: idx + 1,
          name: i.name,
          description: i.description,
          image_url: i.image_url,
          starting_price: i.starting_price,
          bid_increment: i.bid_increment,
          buyout_price: i.buyout_price,
          quantity: i.quantity,
          extra_prices: i.extra_prices,
        }));
        const { error } = await (supabase as any).from("auction_items").insert(copied);
        if (error) throw error;
      }

      toast.success("Leilão copiado. Ajuste as datas e itens antes de programar.");
      nav({ to: "/admin/criar-leilao", search: { id: created.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao copiar leilão.");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight">Leilões WhatsApp</h1>
          <p className="text-xs text-muted-foreground">
            {rows.filter((r) => r.status === "live").length} ao vivo ·{" "}
            {rows.filter((r) => r.status === "scheduled").length} agendados
          </p>
        </div>
        <Link
          to="/admin/criar-leilao"
          className="inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-xs font-bold text-background"
        >
          <Plus className="h-4 w-4" /> Criar Novo Leilão
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.key ? "border-foreground bg-foreground text-background" : "border-border hover:bg-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum leilão nesta aba.
        </p>
      ) : (
        <div className="grid gap-3">
          {filtered.map((r) => {
            const count = r.auction_items?.[0]?.count ?? 0;
            return (
              <div key={r.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-bold">
                      Leilão #{r.auction_number} — {r.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Grupo: {groups[r.group_jid] ?? r.group_jid} · {count} lote(s)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Abre {fmtDate(r.scheduled_start)} · Encerra {fmtDate(r.scheduled_end)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      r.status === "live"
                        ? "bg-red-100 text-red-700"
                        : r.status === "scheduled"
                          ? "bg-amber-100 text-amber-800"
                          : r.status === "finished"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {r.status === "live" ? <Radio className="h-3 w-3" /> : r.status === "scheduled" ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to="/admin/acompanhar-leilao"
                    search={{ id: r.id }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-secondary"
                  >
                    <Eye className="h-3.5 w-3.5" /> Acompanhar
                  </Link>
                  {(r.status === "draft" || r.status === "scheduled") && (
                    <Link
                      to="/admin/criar-leilao"
                      search={{ id: r.id }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-secondary"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Link>
                  )}
                  {r.status !== "live" && (
                    <button
                      onClick={() => remove(r.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
