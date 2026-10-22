import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function adminOf(context: any) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Acesso negado.");
  return { id: context.userId as string, email: (context.claims as any)?.email ?? null };
}
const uuid = z.string().uuid();

export const searchEventCandidatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: uuid, query: z.string().max(120) }).parse(d))
  .handler(async ({ context, data }) => {
    await adminOf(context);
    const { searchEventCandidates } = await import("@/lib/event-hub.server");
    return searchEventCandidates(data.eventId, data.query);
  });

export const addOrdersToEventFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: uuid, orderIds: z.array(uuid).min(1).max(50), includeStack: z.boolean(), at: z.string().datetime(), notifyClient: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const admin = await adminOf(context);
    const { addOrdersToEvent } = await import("@/lib/event-hub.server");
    return addOrdersToEvent(admin, data);
  });

export const rescheduleEventOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: uuid, orderId: uuid, at: z.string().datetime(), notifyClient: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const admin = await adminOf(context);
    const { rescheduleEventOrder } = await import("@/lib/event-hub.server");
    return rescheduleEventOrder(admin, data);
  });

export const removeOrderFromEventFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: uuid, orderId: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    const admin = await adminOf(context);
    const { removeOrderFromEvent } = await import("@/lib/event-hub.server");
    return removeOrderFromEvent(admin, data);
  });

export const markEventOrderDeliveredFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: uuid, orderId: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    const admin = await adminOf(context);
    const { markEventOrderDelivered } = await import("@/lib/event-hub.server");
    return markEventOrderDelivered(admin, data);
  });
