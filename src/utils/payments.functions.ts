import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AdminTestInputSchema, CardInputSchema, PixInputSchema, StripeInputSchema } from "./payments.schemas";

export const createOrderCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => StripeInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { createOrderCheckoutServer } = await import("./payments.server");
    return createOrderCheckoutServer(data, context.userId);
  });

export const createPixOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PixInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { createPixOrderServer } = await import("./payments.server");
    return createPixOrderServer(data, context.userId);
  });

export const checkPixOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { checkPixOrderStatusServer } = await import("./payments.server");
    return checkPixOrderStatusServer(data.orderId, context.userId);
  });

export const createCardOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CardInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { createCardOrderServer } = await import("./payments.server");
    return createCardOrderServer(data, context.userId);
  });

export const getMercadoPagoPublicKey = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getMercadoPagoPublicKeyServer } = await import("@/lib/mercadopago.server");
    return { publicKey: getMercadoPagoPublicKeyServer() };
  });

const CardForOrderSchema = z.object({
  orderId: z.string().uuid(),
  card: z.object({
    token: z.string().min(5).max(200),
    paymentMethodId: z.string().min(1).max(50),
    issuerId: z.string().max(50).optional().nullable(),
    installments: z.number().int().min(1).max(12),
    payerEmail: z.string().email().max(200).optional().nullable(),
    payerCpf: z.string().max(20).optional().nullable(),
  }),
  saveCard: z.boolean().optional().default(false),
});

export const regeneratePixForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { regeneratePixForExistingOrderServer } = await import("./payments.server");
    return regeneratePixForExistingOrderServer(data.orderId, context.userId);
  });

export const getAuctionPaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error || !admin) throw new Error("Acesso negado.");
    const { createAuctionPaymentLink } = await import("@/lib/auction-payment-links.server");
    return { link: await createAuctionPaymentLink(data.orderId) };
  });

export const payExistingOrderWithCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CardForOrderSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { payExistingOrderWithCardServer } = await import("./payments.server");
    return payExistingOrderWithCardServer(data.orderId, context.userId, data.card, { saveCard: data.saveCard });
  });

export const resendPendingOrderEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Response("Acesso negado", { status: 403 });
    const { resendPendingOrderEmailsServer } = await import("./payments.server");
    return resendPendingOrderEmailsServer();
  });

export const previewCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        code: z.string().trim().min(1).max(60),
        subtotalCents: z.number().int().min(0).max(100_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { previewCouponServer } = await import("./payments.server");
    return previewCouponServer(context.userId, data.code, data.subtotalCents);
  });

export const createAdminTestOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AdminTestInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { createAdminTestOrderServer } = await import("./payments.server");
    return createAdminTestOrderServer(data, context.userId);
  });

