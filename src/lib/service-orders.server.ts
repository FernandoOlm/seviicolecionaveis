import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createPixPayment } from "@/lib/mercadopago.server";

export const ARTE_EM_CARDS_FEE_CENTS = 500;
const PIX_EXPIRES_MINUTES = 30;
const STORE_WHATSAPP = "5579981509552"; // Sevii Colecionáveis (somente dígitos com DDI)

export type ServiceOrderMethod = "correios" | "app" | "arte_em_cards" | "presencial" | "evento";

export interface ServiceOrderAddress {
  recipientName: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
}

export interface CreateServiceOrderInput {
  userId: string;
  itemIds: string[];
  method: ServiceOrderMethod;
  shippingQuote?: { serviceId: string; serviceName: string; company: string; priceCents: number } | null;
  address?: ServiceOrderAddress | null;
  arteEmCardsCode?: string | null;
  pickupPoint?: "aruana" | "aeroporto" | null;
  eventName?: string | null;
  eventId?: string | null;
  eventAt?: string | null;
  notes?: string | null;
  cpf?: string | null;
}

interface ResolvedItems {
  stackId: string;
  items: Array<{ id: string; card_name: string; quantity: number; card_id: string }>;
}

async function loadItems(userId: string, itemIds: string[]): Promise<ResolvedItems> {
  if (itemIds.length === 0) throw new Error("Selecione ao menos uma carta.");
  const { data, error } = await supabaseAdmin
    .from("card_stack_items")
    .select("id, stack_id, user_id, status, card_name, quantity, card_id")
    .in("id", itemIds);
  if (error) throw new Error(error.message);
  if (!data || data.length !== itemIds.length) throw new Error("Itens não encontrados.");
  for (const it of data) {
    if (it.user_id !== userId) throw new Error("Itens não pertencem ao usuário.");
    if (it.status !== "stored") throw new Error("Alguns itens já foram solicitados ou enviados.");
  }
  const stackId = data[0].stack_id;
  if (data.some((d) => d.stack_id !== stackId)) {
    throw new Error("Itens de pilhas diferentes.");
  }
  return {
    stackId,
    items: data.map((d) => ({
      id: d.id,
      card_name: d.card_name,
      quantity: d.quantity,
      card_id: d.card_id,
    })),
  };
}

async function resolveArteCode(userId: string, rawCode: string | null | undefined) {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) return { feeCents: ARTE_EM_CARDS_FEE_CENTS, codeUsed: null as string | null };
  const { validateCodeForUser } = await import("@/lib/arte-em-cards.server");
  const v = await validateCodeForUser(userId, code);
  if (v.valid) return { feeCents: 0, codeUsed: v.code };
  return { feeCents: ARTE_EM_CARDS_FEE_CENTS, codeUsed: null };
}

export interface CreateServiceOrderResult {
  serviceOrderId: string;
  code: number;
  method: ServiceOrderMethod;
  amountCents: number;
  pix?: { qrCode: string; qrCodeBase64: string; expiresAt: string };
  paymentUrl?: string;
  whatsappUrl?: string;
}

export async function createServiceOrderServer(input: CreateServiceOrderInput): Promise<CreateServiceOrderResult> {
  const { stackId, items } = await loadItems(input.userId, input.itemIds);

  if (input.method === "arte_em_cards" && items.some((i) => i.card_id?.startsWith("sealed:"))) {
    throw new Error("Retirada na Arte em Cards não está disponível para produtos lacrados. Escolha outra forma de envio.");
  }

  let amountCents = 0;
  let shippingCostCents = 0;
  let arteCodeUsed: string | null = null;
  let eventName = input.eventName?.trim() ?? "";

  if (input.method === "correios") {
    if (!input.address) throw new Error("Endereço obrigatório para envio pelos Correios.");
    if (!input.shippingQuote) throw new Error("Selecione uma cotação de frete.");
    shippingCostCents = input.shippingQuote.priceCents;
    amountCents = shippingCostCents;
  } else if (input.method === "arte_em_cards") {
    const arte = await resolveArteCode(input.userId, input.arteEmCardsCode);
    amountCents = arte.feeCents;
    arteCodeUsed = arte.codeUsed;
  } else if (input.method === "app") {
    amountCents = 0;
  } else if (input.method === "evento") {
    if (!input.eventId || !input.eventAt) throw new Error("Escolha o evento, o dia e o horário da retirada.");
    const { data: ev } = await supabaseAdmin.from("events").select("*").eq("id", input.eventId).maybeSingle();
    if (!ev) throw new Error("Evento não encontrado.");
    const { validateEventSchedule, ymdOfIso } = await import("@/lib/events");
    const { localParts } = await import("@/lib/scheduling");
    const eventErr = validateEventSchedule(
      {
        id: ev.id,
        name: ev.name,
        description: ev.description ?? null,
        start_date: ev.start_date,
        end_date: ev.end_date,
        start_time: String(ev.start_time).slice(0, 5),
        end_time: String(ev.end_time).slice(0, 5),
        per_day_times: (ev.per_day_times as any) ?? null,
        active: ev.active,
      },
      ymdOfIso(input.eventAt),
      localParts(input.eventAt).time,
    );
    if (eventErr) throw new Error(eventErr);
    eventName = ev.name;
    amountCents = 0;
  } else if (input.method === "presencial") {
    if (!input.pickupPoint) throw new Error("Selecione o ponto de retirada (Aruana ou Aeroporto).");
    amountCents = 0;
  }

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(input.userId);
  const email = userData?.user?.email ?? "";

  const { data: created, error: createErr } = await supabaseAdmin
    .from("service_orders")
    .insert({
      user_id: input.userId,
      stack_id: stackId,
      method: input.method,
      status: amountCents > 0 ? "awaiting_payment" : "paid",
      amount_cents: amountCents,
      shipping_cost_cents: shippingCostCents,
      recipient_name: input.address?.recipientName ?? null,
      cep: input.address?.cep ?? null,
      street: input.address?.street ?? null,
      number: input.address?.number ?? null,
      complement: input.address?.complement ?? null,
      neighborhood: input.address?.neighborhood ?? null,
      city: input.address?.city ?? null,
      state: input.address?.state?.toUpperCase() ?? null,
      phone: input.address?.phone ?? null,
      event_id: input.method === "evento" ? (input.eventId ?? null) : null,
      scheduled_at: input.method === "evento" ? (input.eventAt ?? null) : null,
      notes:
        input.method === "evento"
          ? `Retirada em eventos: ${eventName}.${input.notes ? `\n\n${input.notes}` : ""}`
          : input.method === "presencial" && input.pickupPoint
          ? `Retirada presencial: ${input.pickupPoint === "aruana" ? "Aruana" : "Aeroporto"}.${input.notes ? `\n\n${input.notes}` : ""}`
          : (input.notes ?? null),
      arte_em_cards_code: arteCodeUsed,
    })
    .select("id, code")
    .single();

  if (createErr || !created) throw new Error(createErr?.message ?? "Falha ao criar ordem de serviço.");

  const { error: updErr } = await supabaseAdmin
    .from("card_stack_items")
    .update({ status: "requested", service_order_id: created.id, updated_at: new Date().toISOString() })
    .in("id", input.itemIds);
  if (updErr) throw new Error(updErr.message);

  console.log(`[service-orders] Nova OS #${created.code} criada (${input.method}) — ${items.length} item(s).`);
  await notifyServiceOrderChoice(created.id).catch((e) => console.error("[service-orders] alert", e));

  // Sem cobrança: já está paga
  if (amountCents === 0) {
    let whatsappUrl: string | undefined;
    if (input.method === "app") {
      const lines = items.map((i) => `• ${i.quantity}× ${i.card_name}`).join("\n");
      const msg = `Olá! Solicitação de entrega por aplicativo — OS #${created.code}\n\nItens:\n${lines}\n\nPor favor, me informem disponibilidade e custo.`;
      whatsappUrl = `https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(msg)}`;
      await supabaseAdmin
        .from("service_orders")
        .update({ whatsapp_sent_at: new Date().toISOString() })
        .eq("id", created.id);
    }
    return { serviceOrderId: created.id, code: created.code, method: input.method, amountCents: 0, whatsappUrl };
  }

  // Gera Pix
  // Use the custom domain by default — the lovable.app URL responds with a 307
  // redirect to the custom domain, which Mercado Pago's webhook delivery does
  // not follow reliably, causing missed payment notifications.
  const baseUrl = process.env.PUBLIC_SITE_URL ?? "https://seviicolecionaveis.com.br";
  const notificationUrl = `${baseUrl}/api/public/payments/mercadopago-webhook`;
  const [firstName, ...rest] = (input.address?.recipientName ?? "Cliente").trim().split(/\s+/);
  const lastName = rest.join(" ") || "Sevii";

  const pix = await createPixPayment({
    amountCents,
    description: `OS Pilha #${created.code} — Sevii`,
    payerEmail: email,
    payerFirstName: firstName,
    payerLastName: lastName,
    payerCpf: input.cpf ?? null,
    externalReference: `so:${created.id}`,
    notificationUrl,
    expiresInMinutes: PIX_EXPIRES_MINUTES,
  });

  return {
    serviceOrderId: created.id,
    code: created.code,
    method: input.method,
    amountCents,
    pix: { qrCode: pix.qr_code, qrCodeBase64: pix.qr_code_base64, expiresAt: pix.date_of_expiration },
    paymentUrl: pix.ticket_url,
  };
}

export async function markServiceOrderPaid(serviceOrderId: string): Promise<void> {
  const { data: so } = await supabaseAdmin
    .from("service_orders")
    .select("id, status, method")
    .eq("id", serviceOrderId)
    .maybeSingle();
  if (!so || so.status === "paid" || so.status === "preparing" || so.status === "dispatched" || so.status === "delivered") return;

  await supabaseAdmin
    .from("service_orders")
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("id", serviceOrderId);

  await supabaseAdmin
    .from("card_stack_items")
    .update({ status: "dispatched", updated_at: new Date().toISOString() })
    .eq("service_order_id", serviceOrderId);
}

export async function checkServiceOrderStatusServer(serviceOrderId: string, userId: string) {
  const { data: so, error } = await supabaseAdmin
    .from("service_orders")
    .select("id, user_id, status")
    .eq("id", serviceOrderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!so || so.user_id !== userId) throw new Error("OS não encontrada");
  if (so.status === "paid" || so.status === "preparing" || so.status === "dispatched" || so.status === "delivered") {
    return { status: "paid" as const };
  }

  // Consulta Mercado Pago por external_reference (so:<id>) — confirma pagamento mesmo se o webhook atrasar
  try {
    const { findPaymentByExternalReference } = await import("@/lib/mercadopago.server");
    const payment = await findPaymentByExternalReference(`so:${serviceOrderId}`);
    if (payment?.status === "approved") {
      await markServiceOrderPaid(serviceOrderId);
      return { status: "paid" as const };
    }
  } catch (e) {
    console.error("[checkServiceOrderStatusServer] MP lookup falhou:", e);
  }

  return { status: so.status as string };
}

