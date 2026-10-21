import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface StackItemDTO {
  id: string;
  cardId: string;
  cardName: string;
  cardImage: string | null;
  collection: string | null;
  cardNumber: string | null;
  finish: string | null;
  language: string | null;
  condition: string | null;
  quantity: number;
  orderId: string | null;
  orderCreatedAt: string | null;
  auctionName: string | null;
  auctionDate: string | null;
  status: string;
  createdAt: string;
}

export interface StackDTO {
  id: string;
  startedAt: string;
  expiresAt: string;
  status: string;
  totalCards: number;
  totalOrders: number;
  items: StackItemDTO[];
}

export const getMyStack = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StackDTO | null> => loadStack(context.supabase, context.userId, null));

// Pilha específica do cliente (inclusive vencida) — usada pelo link do e-mail de fim de prazo.
export const getStackById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { stackId: string }) => {
    if (!d || typeof d.stackId !== "string" || !/^[0-9a-f-]{36}$/i.test(d.stackId)) throw new Error("Pilha inválida.");
    return d;
  })
  .handler(async ({ data, context }): Promise<StackDTO | null> => loadStack(context.supabase, context.userId, data.stackId));

async function loadStack(supabase: any, userId: string, stackId: string | null): Promise<StackDTO | null> {
    let q = supabase
      .from("card_stacks")
      .select("id, started_at, expires_at, status")
      .eq("user_id", userId);
    q = stackId ? q.eq("id", stackId) : q.eq("status", "active");
    const { data: stack, error: stackErr } = await q.maybeSingle();

    if (stackErr) throw new Error(stackErr.message);
    if (!stack) return null;

    const { data: items, error: itemsErr } = await supabase
      .from("card_stack_items")
      .select(
        "id, card_id, card_name, card_image, collection, card_number, finish, language, condition, quantity, order_id, status, created_at, auction_name, auction_date",
      )
      .eq("stack_id", stack.id)
      .eq("status", "stored")
      .order("created_at", { ascending: false });

    if (itemsErr) throw new Error(itemsErr.message);

    const orderIds = Array.from(
      new Set((items ?? []).map((i: any) => i.order_id).filter((v): v is string => !!v)),
    );
    let createdAtByOrder = new Map<string, string>();
    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, created_at")
        .in("id", orderIds);
      createdAtByOrder = new Map((orders ?? []).map((o: any) => [o.id, o.created_at]));
    }

    const dtoItems: StackItemDTO[] = (items ?? []).map((i: any) => ({
      id: i.id,
      cardId: i.card_id,
      cardName: i.card_name,
      cardImage: i.card_image,
      collection: i.collection,
      cardNumber: i.card_number,
      finish: i.finish,
      language: i.language,
      condition: i.condition,
      quantity: i.quantity,
      orderId: i.order_id,
      orderCreatedAt: i.order_id ? (createdAtByOrder.get(i.order_id) ?? null) : null,
      auctionName: (i as any).auction_name ?? null,
      auctionDate: (i as any).auction_date ?? null,
      status: i.status,
      createdAt: i.created_at,
    }));

    const totalCards = dtoItems.reduce((s, i) => s + i.quantity, 0);
    const auctionCount = dtoItems.filter((i) => i.auctionName).length;

    return {
      id: stack.id,
      startedAt: stack.started_at,
      expiresAt: stack.expires_at,
      status: stack.status,
      totalCards,
      totalOrders: orderIds.length + auctionCount,
      items: dtoItems,
    };
}
