import { z } from "zod";

const ItemSchema = z.object({
  cardId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  image: z.string().max(500).optional().nullable(),
  collection: z.string().max(200).optional().nullable(),
  number: z.string().max(50).optional().nullable(),
  finish: z.string().max(50),
  language: z.string().max(50),
  condition: z.string().max(10).optional().nullable(),
  unitPrice: z.number().positive().max(100000),
  quantity: z.number().int().positive().max(100),
});

const ShippingQuoteSchema = z.object({
  serviceId: z.string().min(1).max(100),
  serviceName: z.string().min(1).max(100),
  company: z.string().min(1).max(100),
  priceCents: z.number().int().min(0).max(1_000_000),
});

const AddressSchema = z.object({
  recipientName: z.string().min(2).max(150),
  cpf: z.string().max(20).optional().nullable(),
  phone: z.string().min(8).max(30),
  cep: z.string().min(8).max(10),
  street: z.string().min(2).max(200),
  number: z.string().min(1).max(20),
  complement: z.string().max(100).optional().nullable(),
  neighborhood: z.string().min(1).max(150),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(2),
});

export const ShippingMethodEnum = z.enum(["fixed", "arrange", "arte_em_cards", "card_stack"]);

export const ScheduleSchema = z.object({
  kind: z.enum(["delivery", "pickup"]),
  at: z.string().datetime(),
});

export const StripeInputSchema = z.object({
  items: z.array(ItemSchema).min(1).max(500),
  shippingMethod: ShippingMethodEnum,
  shippingQuote: ShippingQuoteSchema.optional().nullable(),
  address: AddressSchema,
  notes: z.string().max(2000).optional().nullable(),
  couponCode: z.string().max(50).optional().nullable(),
  pointsToRedeem: z.number().int().min(0).max(10_000_000).optional().nullable(),
  arteEmCardsCode: z.string().trim().max(40).optional().nullable(),
  schedule: ScheduleSchema.optional().nullable(),
  returnUrl: z.string().url(),
  environment: z.enum(["sandbox", "live"]),
});

export const PixInputSchema = z.object({
  items: z.array(ItemSchema).min(1).max(500),
  shippingMethod: ShippingMethodEnum,
  shippingQuote: ShippingQuoteSchema.optional().nullable(),
  address: AddressSchema,
  notes: z.string().max(2000).optional().nullable(),
  couponCode: z.string().max(50).optional().nullable(),
  pointsToRedeem: z.number().int().min(0).max(10_000_000).optional().nullable(),
  arteEmCardsCode: z.string().trim().max(40).optional().nullable(),
  schedule: ScheduleSchema.optional().nullable(),
});

export const CardInputSchema = z.object({
  items: z.array(ItemSchema).min(1).max(500),
  shippingMethod: ShippingMethodEnum,
  shippingQuote: ShippingQuoteSchema.optional().nullable(),
  address: AddressSchema,
  notes: z.string().max(2000).optional().nullable(),
  couponCode: z.string().max(50).optional().nullable(),
  pointsToRedeem: z.number().int().min(0).max(10_000_000).optional().nullable(),
  arteEmCardsCode: z.string().trim().max(40).optional().nullable(),
  schedule: ScheduleSchema.optional().nullable(),
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

export const AdminTestInputSchema = z.object({
  items: z.array(ItemSchema).min(1).max(500),
  shippingMethod: ShippingMethodEnum,
  shippingQuote: ShippingQuoteSchema.optional().nullable(),
  address: AddressSchema,
  notes: z.string().max(2000).optional().nullable(),
  arteEmCardsCode: z.string().trim().max(40).optional().nullable(),
  schedule: ScheduleSchema.optional().nullable(),
});

export type ShippingMethod = z.infer<typeof ShippingMethodEnum>;
export type StripeInput = z.infer<typeof StripeInputSchema>;
export type PixInput = z.infer<typeof PixInputSchema>;
export type CardInput = z.infer<typeof CardInputSchema>;
export type AdminTestInput = z.infer<typeof AdminTestInputSchema>;
