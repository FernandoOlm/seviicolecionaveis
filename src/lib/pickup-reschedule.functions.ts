import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const reschedulePickupFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        at: z.string().datetime(),
        kind: z.enum(["pickup", "event"]).optional(),
        eventId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { reschedulePickup } = await import("@/lib/pickup-reschedule.server");
    return reschedulePickup(context.userId, data.orderId, data.at, { kind: data.kind, eventId: data.eventId });
  });
