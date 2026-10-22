import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Acesso negado.");
}

export interface MissingAlert {
  type: "order" | "service_order";
  id: string;
  code: string;
  customer: string | null;
  modality: string;
  scheduledAt: string | null;
  createdAt: string;
}

/** Pedidos/OS com modalidade já escolhida que nunca geraram alerta. */
export const scanMissingAlertsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MissingAlert[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { modalityOfServiceOrder, modalityOfOrder } = await import("@/lib/fulfillment-alerts");
    const { PAID_ORDER_STATUSES } = await import("@/lib/order-status");
    const db = supabaseAdmin as any;
    const [{ data: sos }, { data: orders }, { data: notes }] = await Promise.all([
      db.from("service_orders").select("id, code, method, scheduled_at, created_at, recipient_name, status").neq("status", "cancelled").order("created_at", { ascending: false }).limit(500),
      db.from("orders").select("id, recipient_name, shipping_method, schedule_kind, scheduled_at, created_at, status").in("schedule_kind", ["pickup", "event", "delivery"]).in("status", [...PAID_ORDER_STATUSES]).not("scheduled_at", "is", null).order("created_at", { ascending: false }).limit(500),
      db.from("admin_notifications").select("target_id").eq("kind", "fulfillment").limit(5000),
    ]);
    const seen = new Set((notes ?? []).map((n: any) => n.target_id));
    const out: MissingAlert[] = [];
    for (const s of sos ?? []) if (!seen.has(s.id)) out.push({ type: "service_order", id: s.id, code: `OS #${s.code}`, customer: s.recipient_name, modality: modalityOfServiceOrder(s.method), scheduledAt: s.scheduled_at, createdAt: s.created_at });
    for (const o of orders ?? []) if (!seen.has(o.id)) out.push({ type: "order", id: o.id, code: `#${o.id.slice(0, 8).toUpperCase()}`, customer: o.recipient_name, modality: modalityOfOrder(o), scheduledAt: o.scheduled_at, createdAt: o.created_at });
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

export const reprocessAlertsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    items: z.array(z.object({ type: z.enum(["order", "service_order"]), id: z.string().uuid() })).min(1).max(100),
    sendClientEmail: z.boolean(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifyServiceOrderChoice } = await import("@/lib/service-orders.server");
    const { sendScheduleConfirmations } = await import("@/lib/schedule-confirmation.server");
    let done = 0;
    for (const it of data.items) {
      try {
        if (it.type === "service_order") {
          await notifyServiceOrderChoice(it.id, { notifyClient: data.sendClientEmail });
        } else {
          const { data: o } = await (supabaseAdmin as any).from("orders").select("*").eq("id", it.id).maybeSingle();
          if (o) await sendScheduleConfirmations(o, "", { skipClient: !data.sendClientEmail });
        }
        done++;
      } catch (e) { console.error("[reprocess-alerts]", it.id, e); }
    }
    return { done };
  });
