import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AddressSchema = z.object({
  recipientName: z.string().min(2).max(150),
  phone: z.string().min(8).max(30),
  cep: z.string().min(8).max(10),
  street: z.string().min(2).max(200),
  number: z.string().min(1).max(20),
  complement: z.string().max(100).nullable().optional(),
  neighborhood: z.string().min(1).max(150),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(2),
});

const QuoteSchema = z.object({
  serviceId: z.string().min(1).max(100),
  serviceName: z.string().min(1).max(100),
  company: z.string().min(1).max(100),
  priceCents: z.number().int().min(0).max(1_000_000),
});

const InputSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(200),
  method: z.enum(["correios", "app", "arte_em_cards", "presencial", "evento"]),
  shippingQuote: QuoteSchema.nullable().optional(),
  address: AddressSchema.nullable().optional(),
  arteEmCardsCode: z.string().trim().max(40).nullable().optional(),
  pickupPoint: z.enum(["aruana", "aeroporto"]).nullable().optional(),
  eventName: z.string().trim().max(200).nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
  eventAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  cpf: z.string().max(20).nullable().optional(),
});

export const createServiceOrderRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { createServiceOrderServer } = await import("@/lib/service-orders.server");
    return createServiceOrderServer({
      userId: context.userId,
      itemIds: data.itemIds,
      method: data.method,
      shippingQuote: data.shippingQuote ?? null,
      address: data.address ?? null,
      arteEmCardsCode: data.arteEmCardsCode ?? null,
      pickupPoint: data.pickupPoint ?? null,
      eventName: data.eventName ?? null,
      eventId: data.eventId ?? null,
      eventAt: data.eventAt ?? null,
      notes: data.notes ?? null,
      cpf: data.cpf ?? null,
    });
  });

export const checkServiceOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ serviceOrderId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { checkServiceOrderStatusServer } = await import("@/lib/service-orders.server");
    return checkServiceOrderStatusServer(data.serviceOrderId, context.userId);
  });
