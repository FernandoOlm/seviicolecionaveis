import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STACK_DURATION_DAYS = 30;

/**
 * Garante uma pilha de cartas ativa para o usuário.
 * Se não houver pilha ativa, cria uma nova com vencimento em 30 dias.
 * Se já houver uma ativa, mantém a data de início original (o prazo não reinicia).
 */
export async function ensureActiveStack(userId: string): Promise<{
  id: string;
  started_at: string;
  expires_at: string;
}> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("card_stacks")
    .select("id, started_at, expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Falha ao buscar pilha ativa: ${existingError.message}`);
  }

  if (existing) return existing;

  const startedAt = new Date();
  const expiresAt = new Date(startedAt);
  expiresAt.setDate(expiresAt.getDate() + STACK_DURATION_DAYS);

  const { data: created, error } = await supabaseAdmin
    .from("card_stacks")
    .insert({
      user_id: userId,
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      status: "active",
    })
    .select("id, started_at, expires_at")
    .single();

  if (error || !created) {
    throw new Error(`Falha ao criar pilha de cartas: ${error?.message ?? "desconhecido"}`);
  }
  return created;
}

/**
 * Move os itens de um pedido pago para a pilha de cartas ativa do cliente.
 * Idempotente: se já houver itens lançados para esse pedido na pilha, não duplica.
 */
export async function addOrderToStack(orderId: string): Promise<void> {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, email, recipient_name, shipping_method")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.shipping_method !== "card_stack") return;

  // Idempotência
  const { count } = await supabaseAdmin
    .from("card_stack_items")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  if ((count ?? 0) > 0) return;

  const stack = await ensureActiveStack(order.user_id);

  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select(
      "id, card_id, card_name, card_image, collection, card_number, finish, language, condition, quantity, unit_price_cents",
    )
    .eq("order_id", orderId);

  if (!items || items.length === 0) return;

  const rows = items.map((it) => ({
    stack_id: stack.id,
    user_id: order.user_id,
    order_id: orderId,
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

  // Insere item a item ignorando duplicados (corrida entre webhook e retorno):
  // o índice único em order_item_id é parcial, então não dá para usar upsert.
  let inserted = 0;
  for (const row of rows) {
    const { error } = await supabaseAdmin.from("card_stack_items").insert(row);
    if (!error) inserted++;
    else if (error.code !== "23505")
      throw new Error(`Falha ao adicionar itens à pilha: ${error.message}`);
  }
  // Se outro processamento já lançou tudo, ele envia o e-mail.
  if (inserted === 0) return;

  if (order.email) {
    try {
      const { sendTransactionalEmailSafe } = await import("@/lib/email/send.server");
      await sendTransactionalEmailSafe({
        templateName: "stack-order-stored",
        recipientEmail: order.email,
        idempotencyKey: `stack-order-stored-${orderId}`,
        templateData: {
          recipientName: order.recipient_name?.split(/\s+/)[0],
          orderId,
          expiresAt: stack.expires_at,
          items: items.map((it) => ({
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
    } catch (e) {
      console.error("[addOrderToStack] email falhou:", e);
    }
  }
}
