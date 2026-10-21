import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const reschedulePickupFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid(), at: z.string().datetime() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { reschedulePickup } = await import("@/lib/pickup-reschedule.server");
    return reschedulePickup(context.userId, data.orderId, data.at);
  });
