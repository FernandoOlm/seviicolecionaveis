import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admin confirma (ou desfaz) o pagamento da taxa da Entrega em mãos. */
export const setHandDeliveryFeeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      orderId: z.string().uuid(),
      confirmed: z.boolean(),
      note: z.string().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Acesso negado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: o } = await db.from("orders").select("*").eq("id", data.orderId).maybeSingle();
    if (!o) throw new Error("Pedido não encontrado.");
    if (o.schedule_kind !== "delivery") throw new Error("Este pedido não é Entrega em mãos.");
    const { isHandDeliveryFeePaid } = await import("@/lib/hand-delivery");
    const wasPaid = isHandDeliveryFeePaid(o.hand_delivery_fee_status);
    if (wasPaid === data.confirmed) return { ok: true, unchanged: true };

    const now = new Date().toISOString();
    const email = (context.claims as any)?.email ?? null;
    const history = Array.isArray(o.hand_delivery_fee_history) ? [...o.hand_delivery_fee_history] : [];
    history.push({
      at: now, admin_id: context.userId, admin_email: email,
      previous: o.hand_delivery_fee_status ?? "pending", next: data.confirmed ? "confirmed" : "pending",
      note: data.note?.trim() || null,
    });
    const { error } = await db.from("orders").update({
      hand_delivery_fee_status: data.confirmed ? "confirmed" : "pending",
      hand_delivery_fee_confirmed_at: data.confirmed ? now : null,
      hand_delivery_fee_confirmed_by: data.confirmed ? context.userId : null,
      hand_delivery_fee_history: history,
      updated_at: now,
    }).eq("id", o.id);
    if (error) throw new Error("Não foi possível salvar.");

    if (data.confirmed && o.email) {
      const { formatSchedule } = await import("@/lib/scheduling");
      const { sendTransactionalEmailSafe } = await import("@/lib/email/send.server");
      const address = [[o.street, o.number].filter(Boolean).join(", "), o.neighborhood, [o.city, o.state].filter(Boolean).join("/")]
        .filter(Boolean).join(" · ");
      await sendTransactionalEmailSafe({
        templateName: "hand-delivery-fee-confirmed",
        recipientEmail: o.email,
        idempotencyKey: `hand-delivery-fee-${o.id}-${now}`,
        templateData: {
          recipientName: o.recipient_name, orderId: o.id, address,
          when: o.scheduled_at ? formatSchedule("delivery", o.scheduled_at) : undefined,
        },
      }).catch((e: unknown) => console.error("[hand-delivery-fee] email", e));
    }
    return { ok: true };
  });
