import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTransactionalEmailSafe } from "@/lib/email/send.server";
import { isPaidOrderStatus, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { formatSchedule } from "@/lib/scheduling";
import type { PickupEvent } from "@/lib/events";
import {
  ADMIN_SHIPPING_MODE_LABELS, OUT_OF_WINDOW_WARNING, adminShippingWarnings, rebuildShippingNotes,
  validateAdminShippingInput, type AdminShippingInput,
} from "@/lib/admin-shipping-edit";
import {
  MANUAL_PAYMENT_METHODS, MANUAL_SOURCES, manualShippingMethod, manualTotals, stockShortages, validateManualItems,
  type ManualAdjustments, type ManualItem, type ManualPaymentMethod, type ManualShippingMode, type ManualSource,
} from "@/lib/manual-order";

const db = supabaseAdmin as any;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- busca

export async function searchManualCustomers(q: string) {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_,()]/g, "")}%`;
  const digits = term.replace(/\D/g, "");
  const ors = [`full_name.ilike.${like}`];
  if (digits.length >= 4) ors.push(`phone.ilike.%${digits}%`, `whatsapp.ilike.%${digits}%`);
  const { data: profs } = await db.from("profiles").select("user_id, full_name, phone, whatsapp").or(ors.join(",")).limit(15);
  const byId = new Map<string, any>();
  for (const p of profs ?? []) byId.set(p.user_id, { userId: p.user_id, name: p.full_name ?? "", phone: p.whatsapp || p.phone || "", email: "" });

  // E-mail: percorre usuários (base pequena) e filtra.
  const lower = term.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    for (const u of users) {
      if (byId.has(u.id)) byId.get(u.id).email = u.email ?? "";
      else if (u.email?.toLowerCase().includes(lower) && byId.size < 25)
        byId.set(u.id, { userId: u.id, name: "", phone: "", email: u.email ?? "" });
    }
    if (users.length < 1000) break;
  }
  const ids = [...byId.keys()];
  if (!ids.length) return [];
  const [{ data: missing }, { data: stacks }, { data: addrs }] = await Promise.all([
    db.from("profiles").select("user_id, full_name, phone, whatsapp").in("user_id", ids),
    db.from("card_stacks").select("user_id, started_at, expires_at").in("user_id", ids).eq("status", "active"),
    db.from("addresses").select("*").in("user_id", ids).order("is_default", { ascending: false }),
  ]);
  for (const p of missing ?? []) {
    const c = byId.get(p.user_id);
    if (!c.name) c.name = p.full_name ?? "";
    if (!c.phone) c.phone = p.whatsapp || p.phone || "";
  }
  return ids.map((id) => {
    const c = byId.get(id);
    const st = (stacks ?? []).find((s: any) => s.user_id === id);
    const a = (addrs ?? []).find((x: any) => x.user_id === id);
    return {
      ...c,
      activeStack: st ? { startedAt: st.started_at, expiresAt: st.expires_at } : null,
      address: a ? { cep: a.cep, street: a.street, number: a.number, complement: a.complement ?? "", neighborhood: a.neighborhood, city: a.city, state: a.state } : null,
    };
  });
}

export async function searchManualCatalog(q: string) {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_,()]/g, "")}%`;
  const [{ data: cards }, { data: sealed }] = await Promise.all([
    db.from("cards").select("id, name, card_number, collection, finish, language, condition, stock, base_price_cents, image")
      .or(`name.ilike.${like},card_number.ilike.${like}`).order("name").limit(30),
    db.from("sealed_products").select("id, title, price_cents, stock, images").ilike("title", like).limit(10),
  ]);
  return [
    ...(cards ?? []).map((c: any) => ({
      cardId: c.id, name: c.name, detail: [c.collection, `#${c.card_number}`, c.finish, c.language, c.condition].filter(Boolean).join(" · "),
      priceCents: c.base_price_cents ?? 0, stock: c.stock ?? 0, image: c.image ?? null, type: "card" as const,
    })),
    ...(sealed ?? []).map((s: any) => ({
      cardId: `sealed:${s.id}`, name: s.title, detail: "Produto lacrado",
      priceCents: s.price_cents ?? 0, stock: s.stock ?? 0, image: s.images?.[0] ?? null, type: "sealed" as const,
    })),
  ];
}

// ---------------------------------------------------------------- criação

export interface ManualOrderInput {
  customer: { userId?: string | null; name: string; email: string; phone?: string;
    address?: { cep?: string; street?: string; number?: string; complement?: string; neighborhood?: string; city?: string; state?: string } | null };
  items: ManualItem[];
  adjustments: ManualAdjustments;
  decrementStock: boolean;
  confirmStockOverride: boolean;
  shipping: Omit<AdminShippingInput, "mode"> & { mode: ManualShippingMode };
  payment: { status: "pending" | "paid"; method: ManualPaymentMethod; paidAt?: string | null; note?: string };
  initialStatus: string;
  source: ManualSource;
  internalNotes?: string;
  sendEmail: boolean;
}

async function availableStock(cardIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const cards = cardIds.filter((id) => UUID_RE.test(id));
  const sealed = cardIds.filter((id) => id.startsWith("sealed:")).map((id) => id.slice(7));
  if (cards.length) {
    const { data } = await db.from("cards").select("id, stock").in("id", cards);
    for (const c of data ?? []) out[c.id] = c.stock ?? 0;
  }
  if (sealed.length) {
    const { data } = await db.from("sealed_products").select("id, stock").in("id", sealed);
    for (const s of data ?? []) out[`sealed:${s.id}`] = s.stock ?? 0;
  }
  return out;
}

async function resolveCustomer(c: ManualOrderInput["customer"]) {
  if (c.userId) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(c.userId);
    if (!data?.user) throw new Error("Cliente não encontrado.");
    return { userId: data.user.id, email: data.user.email ?? c.email, created: false };
  }
  const email = c.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Informe um e-mail válido para o novo cliente.");
  if (!c.name.trim()) throw new Error("Informe o nome do novo cliente.");
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { full_name: c.name.trim(), whatsapp: c.phone?.trim() || "" },
  });
  if (error || !data?.user) {
    if (/already|registered|exists/i.test(error?.message ?? "")) throw new Error("Já existe um cliente com esse e-mail. Busque-o na lista.");
    throw new Error("Não foi possível cadastrar o cliente.");
  }
  const userId = data.user.id;
  if (c.phone?.trim()) await db.from("profiles").update({ phone: c.phone.trim() }).eq("user_id", userId);
  const a = c.address;
  if (a?.street?.trim() && a.number?.trim() && a.city?.trim()) {
    await db.from("addresses").insert({
      user_id: userId, recipient_name: c.name.trim(), cep: a.cep ?? "", street: a.street, number: a.number,
      complement: a.complement || null, neighborhood: a.neighborhood ?? "", city: a.city, state: a.state ?? "", is_default: true,
    });
  }
  return { userId, email, created: true };
}

export async function createManualOrder(admin: { id: string; email: string | null }, input: ManualOrderInput) {
  const itemsErr = validateManualItems(input.items);
  if (itemsErr) return { ok: false as const, error: itemsErr };
  const now = new Date();
  const ship = input.shipping;

  let ev: PickupEvent | null = null;
  let warnings: string[] = [];
  if (ship.mode !== "later") {
    const shipInput = { ...ship, mode: ship.mode } as AdminShippingInput;
    const err = validateAdminShippingInput(shipInput);
    if (err) return { ok: false as const, error: err };
    if (ship.mode === "event") {
      const { data: row } = await db.from("events").select("*").eq("id", ship.eventId).maybeSingle();
      if (!row) return { ok: false as const, error: "Evento não encontrado." };
      ev = { ...row, start_time: String(row.start_time).slice(0, 5), end_time: String(row.end_time).slice(0, 5) };
    }
    warnings = adminShippingWarnings(shipInput, ev, now);
  }

  // Estoque: avisa e pede confirmação antes de seguir.
  const catalogIds = [...new Set(input.items.filter((i) => i.kind === "catalog").map((i) => i.cardId!))];
  const stock = await availableStock(catalogIds);
  for (const id of catalogIds) if (!(id in stock)) return { ok: false as const, error: "Um item do catálogo não foi encontrado." };
  const shortages = input.decrementStock ? stockShortages(input.items, stock) : [];
  if (shortages.length && !input.confirmStockOverride) return { ok: false as const, needsStockConfirmation: true, shortages };

  const customer = await resolveCustomer(input.customer);

  const scheduled = ship.mode === "pickup" || ship.mode === "event" || ship.mode === "delivery";
  const shippingCents = ship.mode === "tracked" ? Math.round(ship.shippingCents ?? 0) : 0;
  const totals = manualTotals(input.items, input.adjustments, shippingCents);
  const a = ship.mode === "delivery" || ship.mode === "tracked" ? (ship.address ?? {}) : (input.customer.address ?? {});
  const shipLabel = ship.mode === "later" ? "Definir depois" : ADMIN_SHIPPING_MODE_LABELS[ship.mode].replace("Manter na ", "");
  const shipDesc = scheduled && ship.at ? `${shipLabel} — ${formatSchedule(ship.mode === "delivery" ? "delivery" : "pickup", ship.at)}` : shipLabel;
  const outOfWindow = warnings.includes(OUT_OF_WINDOW_WARNING);
  const notes = ship.mode === "later" ? null : rebuildShippingNotes(null, { ...ship, mode: ship.mode } as AdminShippingInput, ev?.name);
  const paidStage = input.payment.status === "paid" || isPaidOrderStatus(input.initialStatus);

  const { data: order, error } = await db.from("orders").insert({
    user_id: customer.userId,
    status: "pending",
    origin: "manual",
    payment_method: input.payment.method,
    shipping_method: manualShippingMethod(ship.mode),
    schedule_kind: scheduled ? ship.mode : null,
    scheduled_at: scheduled ? ship.at : null,
    event_id: ship.mode === "event" ? ship.eventId : null,
    hand_delivery_fee_status: ship.mode === "delivery" ? ship.feeStatus : null,
    ...(ship.mode === "delivery" && ship.feeStatus === "confirmed" ? {
      hand_delivery_fee_confirmed_at: now.toISOString(), hand_delivery_fee_confirmed_by: admin.id,
      hand_delivery_fee_history: [{ at: now.toISOString(), admin_id: admin.id, admin_email: admin.email, previous: null, next: "confirmed", note: "Marcado como pago pelo admin" }],
    } : {}),
    shipping_cost_cents: shippingCents,
    subtotal_cents: totals.subtotal,
    discount_cents: totals.discount,
    total_cents: totals.total,
    recipient_name: input.customer.name.trim() || customer.email,
    phone: input.customer.phone?.trim() || null,
    email: customer.email,
    cep: a.cep ?? "", street: a.street ?? "", number: a.number ?? "", complement: a.complement || null,
    neighborhood: a.neighborhood ?? "", city: a.city ?? "", state: a.state ?? "",
    notes,
    stock_decremented: !input.decrementStock,
    manual_created_by: admin.id,
    manual_created_by_email: admin.email,
    manual_created_at: now.toISOString(),
    manual_source: input.source,
    payment_paid_at: input.payment.status === "paid" ? (input.payment.paidAt || now.toISOString()) : null,
    payment_note: input.payment.note?.trim() || null,
    manual_adjustments: {
      payment_status: input.payment.status,
      discount: { type: input.adjustments.discountType, value: input.adjustments.discountValue, cents: totals.discount, reason: input.adjustments.discountReason || null },
      surcharge: { cents: totals.surcharge, reason: input.adjustments.surchargeReason || null },
      decrement_stock: input.decrementStock,
      stock_override: shortages,
    },
    shipping_edit_history: [{
      at: now.toISOString(), admin_id: admin.id, admin_email: admin.email,
      previous: "—", next: `Pedido criado manualmente (${MANUAL_SOURCES[input.source]}) — ${shipDesc}`,
      mode: ship.mode, scheduled_at: scheduled ? ship.at : null, event_name: ev?.name ?? null,
      out_of_window: outOfWindow, warnings,
      details: [
        `Pagamento: ${input.payment.status === "paid" ? "Pago" : "Pendente"} (${MANUAL_PAYMENT_METHODS[input.payment.method]})`,
        `Status inicial: ${ORDER_STATUS_LABELS[input.initialStatus] ?? input.initialStatus}`,
        input.decrementStock ? "Estoque baixado" : "Estoque não alterado",
        ...(shortages.length ? [`Estoque insuficiente confirmado: ${shortages.map((s) => s.name).join(", ")}`] : []),
        ...(customer.created ? ["Cliente cadastrado neste pedido"] : []),
      ],
    }],
  }).select("id").single();
  if (error || !order) {
    console.error("[manual-order] insert", error);
    throw new Error("Não foi possível criar o pedido.");
  }

  const { data: cardRows } = catalogIds.filter((id) => UUID_RE.test(id)).length
    ? await db.from("cards").select("id, image, collection, card_number, finish, language, condition, liga_subcategory").in("id", catalogIds.filter((id) => UUID_RE.test(id)))
    : { data: [] };
  const cardMap = new Map((cardRows ?? []).map((c: any) => [c.id, c]));
  const rows = input.items.map((i, idx) => {
    const c: any = i.cardId ? cardMap.get(i.cardId) : null;
    return {
      order_id: order.id,
      card_id: i.kind === "catalog" ? i.cardId : `custom:${order.id.slice(0, 8)}-${idx}`,
      card_name: i.name.trim(), card_image: c?.image ?? null, collection: c?.collection ?? null,
      card_number: c?.card_number ?? null, finish: c?.finish ?? null, language: c?.language ?? null,
      condition: c?.condition ?? null, liga_subcategory: c?.liga_subcategory ?? null,
      quantity: i.quantity, unit_price_cents: Math.round(i.unitPriceCents),
    };
  });
  const { error: itemsError } = await db.from("order_items").insert(rows);
  if (itemsError) {
    console.error("[manual-order] items", itemsError);
    await db.from("orders").delete().eq("id", order.id);
    throw new Error("Não foi possível salvar os itens do pedido.");
  }

  if (input.internalNotes?.trim()) {
    await db.from("order_admin_notes").insert({ order_id: order.id, internal_notes: input.internalNotes.trim(), created_by: admin.id });
  }

  const { markOrderPaid, decrementOrderStock } = await import("@/lib/orders.server");
  if (paidStage) {
    // Mesmo pipeline do site: estoque, pontos, pilha (30 dias) e e-mails.
    await markOrderPaid(order.id, undefined, { notifyCustomer: input.sendEmail, skipShippingLabel: true });
    if (input.initialStatus !== "paid") {
      await db.from("orders").update({ status: input.initialStatus, updated_at: new Date().toISOString() }).eq("id", order.id);
    }
  } else {
    if (input.decrementStock) await decrementOrderStock(order.id);
    if (input.initialStatus !== "pending") {
      await db.from("orders").update({ status: input.initialStatus }).eq("id", order.id);
    }
    if (input.sendEmail) {
      await sendTransactionalEmailSafe({
        templateName: "order-received", recipientEmail: customer.email, idempotencyKey: `order-received-${order.id}`,
        templateData: {
          recipientName: input.customer.name.trim().split(/\s+/)[0], orderId: order.id,
          items: rows.map((r) => ({ card_name: r.card_name, quantity: r.quantity, unit_price_cents: r.unit_price_cents, finish: r.finish, language: r.language, card_image: r.card_image })),
          totalCents: totals.total, paymentMethod: input.payment.method,
        },
      }).catch((e) => console.error("[manual-order] email", e));
    }
    if (scheduled) {
      const { data: full } = await db.from("orders").select("*").eq("id", order.id).maybeSingle();
      const { sendScheduleConfirmations } = await import("@/lib/schedule-confirmation.server");
      if (full) await sendScheduleConfirmations(full, "", { skipClient: !input.sendEmail }).catch((e) => console.error("[manual-order] schedule", e));
    }
  }

  return { ok: true as const, orderId: order.id, warnings };
}
