import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AdminNotification {
  id: string;
  kind: string;
  action: string | null;
  source: string | null;
  title: string;
  target_type: "order" | "service_order";
  target_id: string;
  target_code: string | null;
  customer_name: string | null;
  modality: string | null;
  scheduled_at: string | null;
  event_id: string | null;
  event_name: string | null;
  details: any;
  read_at: string | null;
  created_at: string;
}

/** Notificações do admin, atualizadas a cada 15s e em tempo real. */
export function useAdminNotifications(limit = 200) {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const load = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("admin_notifications").select("*").order("created_at", { ascending: false }).limit(limit);
    setItems((data ?? []) as AdminNotification[]);
  }, [limit]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    const ch = supabase.channel(`admin-notifications-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" }, () => load())
      .subscribe();
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, [load]);
  const markRead = async (id: string) => {
    setItems((c) => c.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    await (supabase as any).from("admin_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };
  const markAllRead = async () => {
    const now = new Date().toISOString();
    setItems((c) => c.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await (supabase as any).from("admin_notifications").update({ read_at: now }).is("read_at", null);
  };
  const unread = items.filter((n) => !n.read_at);
  const unreadTargets = new Set(unread.map((n) => n.target_id));
  return { items, unread, unreadTargets, markRead, markAllRead, reload: load };
}
