import { PAID_ORDER_STATUSES } from "@/lib/order-status";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdminStackItem {
  id: string;
  card_id: string;
  card_name: string;
  card_image: string | null;
  collection: string | null;
  card_number: string | null;
  finish: string | null;
  language: string | null;
  condition: string | null;
  quantity: number;
  unit_price_cents: number;
  order_id: string | null;
  status: string;
  service_order_id: string | null;
  auction_name: string | null;
  auction_date: string | null;
}

export interface AdminServiceOrder {
  id: string;
  code: number;
  user_id: string;
  method: string;
  status: string;
  amount_cents: number;
  shipping_cost_cents: number;
  recipient_name: string | null;
  phone: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  arte_em_cards_code: string | null;
  carrier: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  created_at: string;
  customer_name: string | null;
  customer_email: string | null;
  items: AdminStackItem[];
}

export interface AdminStack {
  id: string;
  user_id: string;
  started_at: string;
  expires_at: string;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  items: AdminStackItem[];
}

async function ensureAdmin(supabaseAdmin: any, userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Apenas administradores.");
}

export const adminGetPilhaData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ serviceOrders: AdminServiceOrder[]; stacks: AdminStack[]; exampleOrderId: string | null }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdmin(supabaseAdmin, context.userId);

    const [{ data: osRows }, { data: stackRows }, { data: exampleRows }] = await Promise.all([
      supabaseAdmin
        .from("service_orders")
        .select("*")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("card_stacks")
        .select("*")
        .eq("status", "active")
        .order("expires_at", { ascending: true }),
      supabaseAdmin
        .from("orders")
        .select("id, status, created_at")
        .in("status", [...PAID_ORDER_STATUSES, "dispatched"])
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const orders = osRows ?? [];
    const stacks = stackRows ?? [];
    const osIds = orders.map((o: any) => o.id);
    const stackIds = stacks.map((s: any) => s.id);

    const [{ data: osItems }, { data: stackItems }] = await Promise.all([
      osIds.length
        ? supabaseAdmin.from("card_stack_items").select("*").in("service_order_id", osIds)
        : Promise.resolve({ data: [] as any[] }),
      stackIds.length
        ? supabaseAdmin
            .from("card_stack_items")
            .select("*")
            .in("stack_id", stackIds)
            .eq("status", "stored")
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const allUserIds = Array.from(
      new Set<string>([
        ...orders.map((o: any) => o.user_id),
        ...stacks.map((s: any) => s.user_id),
      ]),
    );

    const profileMap = new Map<string, { name: string | null; email: string | null }>();
    if (allUserIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", allUserIds);
      (profiles ?? []).forEach((p: any) =>
        profileMap.set(p.user_id, { name: p.full_name ?? null, email: null }),
      );
      // emails via auth admin
      for (const uid of allUserIds) {
        try {
          const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
          const prev = profileMap.get(uid) ?? { name: null, email: null };
          profileMap.set(uid, { name: prev.name, email: data?.user?.email ?? null });
        } catch {
          // ignore
        }
      }
    }

    const byOs: Record<string, AdminStackItem[]> = {};
    (osItems ?? []).forEach((it: any) => {
      (byOs[it.service_order_id] ??= []).push(it);
    });
    const byStack: Record<string, AdminStackItem[]> = {};
    (stackItems ?? []).forEach((it: any) => {
      (byStack[it.stack_id] ??= []).push(it);
    });

    const exampleOrderIds = (exampleRows ?? []).map((o: any) => o.id);
    const [{ data: exampleOrderItems }, { data: exampleStackItems }] = exampleOrderIds.length
      ? await Promise.all([
          supabaseAdmin.from("order_items").select("order_id").in("order_id", exampleOrderIds),
          supabaseAdmin.from("card_stack_items").select("order_id").in("order_id", exampleOrderIds),
        ])
      : [{ data: [] as any[] }, { data: [] as any[] }];
    const ordersWithItems = new Set((exampleOrderItems ?? []).map((it: any) => it.order_id));
    const itemsByOrderId = new Set((exampleStackItems ?? []).map((it: any) => it.order_id));

    return {
      exampleOrderId:
        (exampleRows ?? []).find((o: any) => ordersWithItems.has(o.id) && !itemsByOrderId.has(o.id))?.id ?? null,
      serviceOrders: orders.map((o: any) => ({
        ...o,
        customer_name: profileMap.get(o.user_id)?.name ?? null,
        customer_email: profileMap.get(o.user_id)?.email ?? null,
        items: byOs[o.id] ?? [],
      })),
      stacks: stacks.map((s: any) => ({
        ...s,
        customer_name: profileMap.get(s.user_id)?.name ?? null,
        customer_email: profileMap.get(s.user_id)?.email ?? null,
        items: byStack[s.id] ?? [],
      })),
    };
  });

export const adminAdjustStackItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        itemId: z.string().uuid(),
        newQuantity: z.number().int().min(0).max(999),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdmin(supabaseAdmin, context.userId);

    if (data.newQuantity === 0) {
      const { error } = await supabaseAdmin
        .from("card_stack_items")
        .delete()
        .eq("id", data.itemId);
      if (error) throw new Error(error.message);
      return { ok: true, removed: true };
    }

    const { error } = await supabaseAdmin
      .from("card_stack_items")
      .update({ quantity: data.newQuantity })
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    return { ok: true, removed: false };
  });

export const adminAddOrderToStack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ orderIdOrPrefix: z.string().trim().min(4).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdmin(supabaseAdmin, context.userId);

    const raw = data.orderIdOrPrefix.trim().toLowerCase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw);
    let order: any = null;
    if (isUuid) {
      const { data: o, error } = await supabaseAdmin
        .from("orders")
        .select("id, user_id, status")
        .eq("id", raw)
        .maybeSingle();
      if (error) throw new Error(error.message);
      order = o;
    } else {
      // UUID columns não suportam ILIKE — construímos um intervalo de UUID a
      // partir do prefixo hex (com ou sem hífens) e usamos gte/lte.
      const hex = raw.replace(/-/g, "");
      if (!/^[0-9a-f]+$/.test(hex) || hex.length < 4 || hex.length > 32) {
        throw new Error("Prefixo inválido. Use ao menos 4 caracteres hex do ID.");
      }
      const padLow = (hex + "0".repeat(32 - hex.length)).slice(0, 32);
      const padHigh = (hex + "f".repeat(32 - hex.length)).slice(0, 32);
      const fmt = (h: string) =>
        `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
      const { data: list, error } = await supabaseAdmin
        .from("orders")
        .select("id, user_id, status")
        .gte("id", fmt(padLow))
        .lte("id", fmt(padHigh))
        .limit(2);
      if (error) throw new Error(error.message);
      if (list && list.length > 1) {
        throw new Error("Mais de um pedido começa com esse prefixo. Use o ID completo.");
      }
      order = list?.[0] ?? null;
    }
    if (!order) throw new Error("Pedido não encontrado.");
    const allowed = [...PAID_ORDER_STATUSES, "dispatched"];
    if (!allowed.includes(order.status)) {
      throw new Error(`Pedido está com status "${order.status}". Só pedidos pagos podem ir à pilha.`);
    }

    const { count } = await supabaseAdmin
      .from("card_stack_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id);
    if ((count ?? 0) > 0) {
      throw new Error("Esse pedido já está na pilha do cliente.");
    }

    const { ensureActiveStack } = await import("@/lib/card-stack.server");
    const stack = await ensureActiveStack(order.user_id);

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select(
        "id, card_id, card_name, card_image, collection, card_number, finish, language, condition, quantity, unit_price_cents",
      )
      .eq("order_id", order.id);

    if (!items || items.length === 0) throw new Error("Pedido não possui itens.");

    const rows = items.map((it: any) => ({
      stack_id: stack.id,
      user_id: order.user_id,
      order_id: order.id,
      order_item_id: it.id,
      card_id: it.card_id,
      card_name: it.card_name,
      card_image: it.card_image,
      collection: it.collection,
      card_number: it.card_number,
      finish: it.finish,
      language: it.language,
      condition: it.condition,
      quantity: it.quantity,
      unit_price_cents: it.unit_price_cents ?? 0,
      status: "stored" as const,
    }));

    const { error } = await supabaseAdmin
      .from("card_stack_items")
      .insert(rows);
    if (error) throw new Error(error.message);

    // Notifica o cliente
    try {
      const { data: ord } = await supabaseAdmin
        .from("orders")
        .select("email, recipient_name")
        .eq("id", order.id)
        .maybeSingle();
      if (ord?.email) {
        const { sendTransactionalEmailSafe } = await import("@/lib/email/send.server");
        await sendTransactionalEmailSafe({
          templateName: "stack-order-stored",
          recipientEmail: ord.email,
          idempotencyKey: `stack-order-stored-${order.id}`,
          templateData: {
            recipientName: ord.recipient_name?.split(/\s+/)[0],
            orderId: order.id,
            expiresAt: stack.expires_at,
            items: items.map((it: any) => ({
              card_name: it.card_name,
              collection: it.collection,
              card_number: it.card_number,
              finish: it.finish,
              language: it.language,
              condition: it.condition,
              quantity: it.quantity,
              unit_price_cents: it.unit_price_cents ?? 0,
            })),
          },
        });
      }
    } catch (e) {
      console.error("[adminAddOrderToStack] email falhou:", e);
    }

    return { ok: true, addedCount: rows.length, orderId: order.id, stackId: stack.id };
  });

export const adminAddOrderItemsToStack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        items: z
          .array(
            z.object({
              orderItemId: z.string().uuid(),
              quantity: z.number().int().min(1).max(999),
            }),
          )
          .min(1)
          .max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdmin(supabaseAdmin, context.userId);

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, status, email, recipient_name")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr) throw new Error(orderErr.message);
    if (!order) throw new Error("Pedido não encontrado.");
    const allowed = [...PAID_ORDER_STATUSES, "dispatched"];
    if (!allowed.includes(order.status)) {
      throw new Error(`Pedido está com status "${order.status}". Só pedidos pagos podem ir à pilha.`);
    }

    const itemIds = data.items.map((i) => i.orderItemId);
    const { data: orderItems, error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .select(
        "id, card_id, card_name, card_image, collection, card_number, finish, language, condition, quantity, cancelled_quantity, unit_price_cents, order_id",
      )
      .in("id", itemIds)
      .eq("order_id", order.id);
    if (itemsErr) throw new Error(itemsErr.message);
    if (!orderItems || orderItems.length !== itemIds.length) {
      throw new Error("Algum item selecionado não pertence a esse pedido.");
    }

    // Filtra itens já presentes na pilha (unique constraint em order_item_id)
    const { data: existing } = await supabaseAdmin
      .from("card_stack_items")
      .select("order_item_id")
      .in("order_item_id", itemIds);
    const existingSet = new Set((existing ?? []).map((r: any) => r.order_item_id));

    const { ensureActiveStack } = await import("@/lib/card-stack.server");
    const stack = await ensureActiveStack(order.user_id);

    const qtyMap = new Map(data.items.map((i) => [i.orderItemId, i.quantity]));
    const rows: any[] = [];
    for (const it of orderItems) {
      if (existingSet.has(it.id)) continue;
      const available = (it.quantity ?? 0) - (it.cancelled_quantity ?? 0);
      const qty = Math.min(qtyMap.get(it.id) ?? available, available);
      if (qty < 1) continue;
      rows.push({
        stack_id: stack.id,
        user_id: order.user_id,
        order_id: order.id,
        order_item_id: it.id,
        card_id: it.card_id,
        card_name: it.card_name,
        card_image: it.card_image,
        collection: it.collection,
        card_number: it.card_number,
        finish: it.finish,
        language: it.language,
        condition: it.condition,
        quantity: qty,
        unit_price_cents: it.unit_price_cents ?? 0,
        status: "stored" as const,
      });
    }

    if (rows.length === 0) {
      throw new Error("Nada para enviar: itens já estavam na pilha ou sem quantidade disponível.");
    }

    const { error: insErr } = await supabaseAdmin
      .from("card_stack_items")
      .insert(rows);
    if (insErr) throw new Error(insErr.message);

    // Notifica o cliente
    try {
      if (order.email) {
        const { sendTransactionalEmailSafe } = await import("@/lib/email/send.server");
        await sendTransactionalEmailSafe({
          templateName: "stack-order-stored",
          recipientEmail: order.email,
          idempotencyKey: `stack-order-items-${order.id}-${Date.now()}`,
          templateData: {
            recipientName: order.recipient_name?.split(/\s+/)[0],
            orderId: order.id,
            expiresAt: stack.expires_at,
            items: rows.map((r: any) => ({
              card_name: r.card_name,
              collection: r.collection,
              card_number: r.card_number,
              finish: r.finish,
              language: r.language,
              condition: r.condition,
              quantity: r.quantity,
              unit_price_cents: r.unit_price_cents ?? 0,
            })),
          },
        });
      }
    } catch (e) {
      console.error("[adminAddOrderItemsToStack] email falhou:", e);
    }

    return { ok: true, addedCount: rows.length, stackId: stack.id };
  });


export const adminCreateManualServiceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        stackId: z.string().uuid(),
        itemIds: z.array(z.string().uuid()).min(1).max(500),
        method: z.enum(["correios", "app", "arte_em_cards", "presencial"]),
        status: z.enum(["paid", "preparing", "dispatched", "delivered"]).default("delivered"),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdmin(supabaseAdmin, context.userId);

    const { data: stack, error: stackErr } = await supabaseAdmin
      .from("card_stacks")
      .select("id, user_id, status")
      .eq("id", data.stackId)
      .maybeSingle();
    if (stackErr) throw new Error(stackErr.message);
    if (!stack) throw new Error("Pilha não encontrada.");

    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("card_stack_items")
      .select("id, status, stack_id, service_order_id")
      .in("id", data.itemIds)
      .eq("stack_id", data.stackId);
    if (itemsErr) throw new Error(itemsErr.message);
    if (!items || items.length === 0) throw new Error("Nenhum item válido selecionado.");
    const invalid = items.find((i: any) => i.status !== "stored" || i.service_order_id);
    if (invalid) throw new Error("Há itens já vinculados a outra ordem de serviço.");

    const { data: created, error: createErr } = await supabaseAdmin
      .from("service_orders")
      .insert({
        user_id: stack.user_id,
        stack_id: stack.id,
        method: data.method,
        status: data.status,
        amount_cents: 0,
        shipping_cost_cents: 0,
        notes: data.notes
          ? `[Criada manualmente pelo admin]\n${data.notes}`
          : "[Criada manualmente pelo admin]",
      })
      .select("id, code")
      .single();
    if (createErr || !created) throw new Error(createErr?.message ?? "Falha ao criar OS.");

    const itemStatus =
      data.status === "delivered"
        ? "delivered"
        : data.status === "dispatched"
          ? "dispatched"
          : "requested";

    const { error: updErr } = await supabaseAdmin
      .from("card_stack_items")
      .update({
        status: itemStatus,
        service_order_id: created.id,
        updated_at: new Date().toISOString(),
      })
      .in("id", data.itemIds);
    if (updErr) throw new Error(updErr.message);

    const { count: remaining } = await supabaseAdmin
      .from("card_stack_items")
      .select("id", { count: "exact", head: true })
      .eq("stack_id", stack.id)
      .eq("status", "stored");
    if ((remaining ?? 0) === 0) {
      await supabaseAdmin
        .from("card_stacks")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", stack.id);
    }

    return { ok: true, serviceOrderId: created.id, code: created.code };
  });

const auctionItemSchema = z.object({
  card_id: z.string().trim().min(1).max(200),
  card_name: z.string().trim().min(1).max(200),
  card_image: z.string().trim().max(2000).nullable().optional(),
  collection: z.string().trim().max(200).nullable().optional(),
  card_number: z.string().trim().max(50).nullable().optional(),
  finish: z.string().trim().max(50).nullable().optional(),
  language: z.string().trim().max(20).nullable().optional(),
  condition: z.string().trim().max(20).nullable().optional(),
  quantity: z.number().int().min(1).max(999),
  unit_price_cents: z.number().int().min(0).max(99999999),
});

export const adminAddAuctionCardsToStack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        customerEmail: z.string().trim().email().max(255),
        auctionName: z.string().trim().min(1).max(200),
        auctionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
        items: z.array(auctionItemSchema).min(1).max(200),
        sendEmail: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdmin(supabaseAdmin, context.userId);

    const emailLower = data.customerEmail.toLowerCase();

    // Encontra usuário por email via auth admin (lista paginada — simples)
    let foundUserId: string | null = null;
    let foundUserName: string | null = null;
    let page = 1;
    while (page <= 20 && !foundUserId) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(`Falha ao buscar usuários: ${error.message}`);
      const match = (list?.users ?? []).find(
        (u: any) => (u.email ?? "").toLowerCase() === emailLower,
      );
      if (match) {
        foundUserId = match.id;
        break;
      }
      if (!list || list.users.length < 200) break;
      page++;
    }
    if (!foundUserId) {
      throw new Error(`Nenhum cliente cadastrado com o email "${data.customerEmail}".`);
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("user_id", foundUserId)
      .maybeSingle();
    foundUserName = profile?.full_name ?? null;

    const { ensureActiveStack } = await import("@/lib/card-stack.server");
    const stack = await ensureActiveStack(foundUserId);

    const rows = data.items.map((it) => ({
      stack_id: stack.id,
      user_id: foundUserId!,
      order_id: null,
      order_item_id: null,
      card_id: it.card_id,
      card_name: it.card_name,
      card_image: it.card_image ?? null,
      collection: it.collection ?? null,
      card_number: it.card_number ?? null,
      finish: it.finish ?? null,
      language: it.language ?? null,
      condition: it.condition ?? null,
      quantity: it.quantity,
      unit_price_cents: it.unit_price_cents,
      status: "stored" as const,
      auction_name: data.auctionName,
      auction_date: data.auctionDate,
    }));

    const { error } = await supabaseAdmin.from("card_stack_items").insert(rows);
    if (error) throw new Error(error.message);

    if (data.sendEmail) {
      try {
        const { sendTransactionalEmailSafe } = await import("@/lib/email/send.server");
        await sendTransactionalEmailSafe({
          templateName: "stack-auction-stored",
          recipientEmail: data.customerEmail,
          idempotencyKey: `stack-auction-${stack.id}-${data.auctionName}-${data.auctionDate}-${Date.now()}`,
          templateData: {
            recipientName: foundUserName?.split(/\s+/)[0],
            auctionName: data.auctionName,
            auctionDate: data.auctionDate,
            expiresAt: stack.expires_at,
            items: data.items.map((it) => ({
              card_name: it.card_name,
              collection: it.collection,
              card_number: it.card_number,
              finish: it.finish,
              language: it.language,
              condition: it.condition,
              quantity: it.quantity,
              unit_price_cents: it.unit_price_cents,
            })),
          },
        });
      } catch (e) {
        console.error("[adminAddAuctionCardsToStack] email falhou:", e);
      }
    }

    return {
      ok: true,
      addedCount: rows.length,
      stackId: stack.id,
      userId: foundUserId,
      userName: foundUserName,
    };
  });



export const adminBulkDeleteStackItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        stackId: z.string().uuid(),
        itemIds: z.array(z.string().uuid()).min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdmin(supabaseAdmin, context.userId);

    // Garante que todos os itens pertencem à pilha informada e ainda estão armazenados
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("card_stack_items")
      .select("id, status, service_order_id, stack_id")
      .in("id", data.itemIds)
      .eq("stack_id", data.stackId);
    if (itemsErr) throw new Error(itemsErr.message);
    if (!items || items.length === 0) throw new Error("Nenhum item válido selecionado.");
    const invalid = items.find((i: any) => i.status !== "stored" || i.service_order_id);
    if (invalid) throw new Error("Há itens já vinculados a uma ordem de serviço — não podem ser excluídos diretamente.");

    const { error: delErr } = await supabaseAdmin
      .from("card_stack_items")
      .delete()
      .in("id", items.map((i: any) => i.id));
    if (delErr) throw new Error(delErr.message);

    // Se a pilha ficou vazia, marca como concluída
    const { count: remaining } = await supabaseAdmin
      .from("card_stack_items")
      .select("id", { count: "exact", head: true })
      .eq("stack_id", data.stackId)
      .eq("status", "stored");
    if ((remaining ?? 0) === 0) {
      await supabaseAdmin
        .from("card_stacks")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", data.stackId);
    }

    return { ok: true, deleted: items.length };
  });
