import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const addr = z.object({
  cep: z.string().max(20).optional(), street: z.string().max(200).optional(), number: z.string().max(30).optional(),
  complement: z.string().max(200).optional(), neighborhood: z.string().max(120).optional(),
  city: z.string().max(120).optional(), state: z.string().max(4).optional(),
});

export const adminEditOrderShippingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      orderId: z.string().uuid(),
      mode: z.enum(["pickup", "event", "delivery", "tracked", "stack"]),
      at: z.string().datetime().nullable().optional(),
      pickupPoint: z.enum(["aruana", "aeroporto"]).nullable().optional(),
      eventId: z.string().uuid().nullable().optional(),
      address: addr.nullable().optional(),
      deliveryInfo: z.string().max(500).nullable().optional(),
      feeStatus: z.enum(["pending", "confirmed"]).nullable().optional(),
      shippingCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
      notifyClient: z.boolean(),
      applyToStack: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Acesso negado.");
    const { adminEditOrderShipping } = await import("@/lib/admin-shipping-edit.server");
    const { orderId, notifyClient, applyToStack, ...input } = data;
    return adminEditOrderShipping(
      { id: context.userId, email: (context.claims as any)?.email ?? null },
      orderId, input, { notifyClient, applyToStack },
    );
  });
