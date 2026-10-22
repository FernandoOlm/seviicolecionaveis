import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { NotificationRow, useOpenNotification } from "@/components/admin/AdminNotificationsBell";
import { scanMissingAlertsFn, reprocessAlertsFn, type MissingAlert } from "@/lib/fulfillment-alerts.functions";
import { MODALITY_LABELS, formatScheduleShort, type Modality } from "@/lib/fulfillment-alerts";

export const Route = createFileRoute("/admin/notificacoes")({
  head: () => ({ meta: [
    { title: "Notificações — Sevii Admin" },
    { name: "description", content: "Alertas de retirada e envio escolhidos pelos clientes." },
    { property: "og:title", content: "Notificações — Sevii Admin" },
    { property: "og:description", content: "Alertas de retirada e envio escolhidos pelos clientes." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { items, unread, markRead, markAllRead, reload } = useAdminNotifications(300);
  const open = useOpenNotification(markRead);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const scan = useServerFn(scanMissingAlertsFn);
  const reprocess = useServerFn(reprocessAlertsFn);
  const [missing, setMissing] = useState<MissingAlert[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [sendClient, setSendClient] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = onlyUnread ? unread : items;

  const runScan = async () => {
    setBusy(true);
    try { const r = await scan(); setMissing(r); setSel(new Set(r.map((m) => m.id))); }
    catch (e: any) { toast.error(e?.message ?? "Não foi possível verificar."); }
    finally { setBusy(false); }
  };
  const runReprocess = async () => {
    if (!missing) return;
    const chosen = missing.filter((m) => sel.has(m.id)).map((m) => ({ type: m.type, id: m.id }));
    if (!chosen.length) return;
    setBusy(true);
    try {
      const r = await reprocess({ data: { items: chosen, sendClientEmail: sendClient } });
      toast.success(`${r.done} alerta(s) gerado(s).`);
      setMissing((c) => (c ?? []).filter((m) => !sel.has(m.id)));
      setSel(new Set());
      reload();
    } catch (e: any) { toast.error(e?.message ?? "Falha ao reprocessar."); }
    finally { setBusy(false); }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h1 className="text-2xl font-bold">Notificações ({unread.length} não lidas)</h1>
          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-2"><input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} className="accent-foreground" /> Só não lidas</label>
            {unread.length > 0 && <button onClick={markAllRead} className="font-semibold hover:underline">Marcar todas como lidas</button>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {list.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhuma notificação.</p>
            : list.map((n) => (
              <div key={n.id} className="flex items-stretch">
                <div className="flex-1 min-w-0"><NotificationRow n={n} onOpen={open} /></div>
                {!n.read_at && <button onClick={() => markRead(n.id)} className="px-3 text-[11px] font-semibold border-b border-border hover:bg-secondary">Marcar como lida</button>}
              </div>
            ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold uppercase tracking-widest mb-1">Escolhas sem alerta</h2>
        <p className="text-xs text-muted-foreground mb-3">Encontra pedidos e pilhas com retirada/envio já escolhidos que nunca geraram notificação ou e-mail, e gera os alertas agora.</p>
        <button onClick={runScan} disabled={busy} className="rounded-md bg-foreground text-background px-4 py-2 text-xs font-semibold disabled:opacity-40">
          {busy && !missing ? "Verificando..." : "Verificar"}
        </button>
        {missing && (
          missing.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Tudo certo: nenhum pedido sem alerta.</p> : (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-border divide-y divide-border">
                {missing.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 px-3 py-2 text-xs cursor-pointer">
                    <input type="checkbox" className="accent-foreground" checked={sel.has(m.id)}
                      onChange={() => setSel((s) => { const n = new Set(s); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} />
                    <span className="font-mono">{m.code}</span>
                    <span className="flex-1 truncate">{m.customer ?? "Cliente"}</span>
                    <span>{MODALITY_LABELS[m.modality as Modality] ?? m.modality}</span>
                    <span className="text-muted-foreground">{formatScheduleShort(m.scheduledAt)}</span>
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-foreground" checked={sendClient} onChange={(e) => setSendClient(e.target.checked)} /> Enviar e-mail também ao cliente</label>
              <button onClick={runReprocess} disabled={busy || sel.size === 0} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold disabled:opacity-40">
                {busy ? "Gerando..." : `Reprocessar ${sel.size} selecionado(s)`}
              </button>
            </div>
          )
        )}
      </section>
    </main>
  );
}
