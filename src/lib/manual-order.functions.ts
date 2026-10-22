import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ORDER_STATUSES } from "@/lib/order-status";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Acesso negado.");
}

const q = z.object({ q: z.string().max(120) });

export const searchManualCustomersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => q.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { searchManualCustomers } = await import("@/lib/manual-order.server");
    return searchManualCustomers(data.q);
  });

export const searchManualCatalogFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => q.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { searchManualCatalog } = await import("@/lib/manual-order.server");
    return searchManualCatalog(data.q);
  });

const addr = z.object({
  cep: z.string().max(20).optional(), street: z.string().max(200).optional(), number: z.string().max(30).optional(),
  complement: z.string().max(200).optional(), neighborhood: z.string().max(120).optional(),
  city: z.string().max(120).optional(), state: z.string().max(4).optional(),
});

const schema = z.object({
  customer: z.object({
    userId: z.string().uuid().nullable().optional(),
    name: z.string().max(160), email: z.string().max(200), phone: z.string().max(40).optional(),
    address: addr.nullable().optional(),
  }),
  items: z.array(z.object({
    kind: z.enum(["catalog", "custom"]), cardId: z.string().max(80).nullable().optional(),
    name: z.string().min(1).max(200), unitPriceCents: z.number().int().min(0).max(100_000_000),
    quantity: z.number().int().min(1).max(10_000),
  })).min(1).max(300),
  adjustments: z.object({
    discountType: z.enum(["fixed", "percent"]), discountValue: z.number().min(0).max(100_000_000),
    discountReason: z.string().max(300).optional(),
    surchargeCents: z.number().int().min(0).max(100_000_000), surchargeReason: z.string().max(300).optional(),
  }),
  decrementStock: z.boolean(),
  confirmStockOverride: z.boolean(),
  shipping: z.object({
    mode: z.enum(["pickup", "event", "delivery", "tracked", "stack", "later"]),
    at: z.string().datetime().nullable().optional(),
    pickupPoint: z.enum(["aruana", "aeroporto"]).nullable().optional(),
    eventId: z.string().uuid().nullable().optional(),
    address: addr.nullable().optional(),
    deliveryInfo: z.string().max(500).nullable().optional(),
    feeStatus: z.enum(["pending", "confirmed"]).nullable().optional(),
    shippingCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  }),
  payment: z.object({
    status: z.enum(["pending", "paid"]),
    method: z.enum(["manual_pix", "manual_cash", "manual_card", "manual_other"]),
    paidAt: z.string().datetime().nullable().optional(),
    note: z.string().max(500).optional(),
  }),
  initialStatus: z.enum(ORDER_STATUSES),
  source: z.enum(["whatsapp", "instagram", "presencial", "evento", "outro"]),
  internalNotes: z.string().max(2000).optional(),
  sendEmail: z.boolean(),
});

export const createManualOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { createManualOrder } = await import("@/lib/manual-order.server");
    return createManualOrder({ id: context.userId, email: (context.claims as any)?.email ?? null }, data as any);
  });
