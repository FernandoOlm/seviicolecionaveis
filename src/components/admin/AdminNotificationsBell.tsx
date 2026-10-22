import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Bell } from "lucide-react";
import { useAdminNotifications, type AdminNotification } from "@/hooks/useAdminNotifications";
import { MODALITY_LABELS, formatScheduleShort, timeAgo, type Modality } from "@/lib/fulfillment-alerts";

export function NotificationRow({ n, onOpen }: { n: AdminNotification; onOpen: (n: AdminNotification) => void }) {
  const failed = n.kind === "notify_failed";
  return (
    <button type="button" onClick={() => onOpen(n)}
      className={`w-full text-left flex gap-2 px-3 py-2.5 border-b border-border last:border-0 hover:bg-secondary transition ${n.read_at ? "" : "bg-primary/5"}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : failed ? "bg-destructive" : "bg-primary"}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-xs font-semibold">
          {failed && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}{n.title}
        </span>
        <span className="block text-xs text-muted-foreground truncate">
          {n.customer_name ?? "Cliente"} · {n.target_code}
          {n.modality ? ` · ${MODALITY_LABELS[n.modality as Modality] ?? n.modality}` : ""}
        </span>
        {(n.scheduled_at || n.event_name) && (
          <span className="block text-xs text-muted-foreground truncate">
            {[n.event_name, formatScheduleShort(n.scheduled_at)].filter(Boolean).join(" · ")}
          </span>
        )}
        <span className="block text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</span>
      </span>
    </button>
  );
}

export function useOpenNotification(markRead: (id: string) => Promise<void>) {
  const nav = useNavigate();
  return (n: AdminNotification) => {
    if (!n.read_at) void markRead(n.id);
    if (n.target_type === "order") nav({ to: "/admin/orders/$orderId", params: { orderId: n.target_id } });
    else nav({ to: "/admin/pilha" });
  };
}

export function AdminNotificationsBell() {
  const { items, unread, markRead, markAllRead } = useAdminNotifications(50);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const openN = useOpenNotification(markRead);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);
  return (
    <div ref={ref} className="no-print fixed bottom-24 right-5 z-40">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={`Notificações (${unread.length} não lidas)`}
        className="relative rounded-full border border-border bg-card p-2.5 shadow-sm hover:bg-secondary">
        <Bell className="h-5 w-5" />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center">
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-2 w-[min(92vw,380px)] rounded-xl border border-border bg-card shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <p className="text-xs font-bold uppercase tracking-wider">Notificações</p>
            {unread.length > 0 && <button onClick={markAllRead} className="text-xs font-semibold hover:underline">Marcar todas como lidas</button>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? <p className="p-4 text-xs text-muted-foreground">Nenhuma notificação.</p>
              : items.slice(0, 20).map((n) => <NotificationRow key={n.id} n={n} onOpen={(x) => { setOpen(false); openN(x); }} />)}
          </div>
          <Link to="/admin/notificacoes" onClick={() => setOpen(false)} className="block text-center text-xs font-semibold py-2 border-t border-border hover:bg-secondary">
            Ver todas e reprocessar
          </Link>
        </div>
      )}
    </div>
  );
}
