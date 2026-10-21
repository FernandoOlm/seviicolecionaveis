import { PAID_ORDER_STATUSES } from "@/lib/order-status";
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

const Schema = z.object({ collection: z.string().min(1).max(255) })

/**
 * Returns the set of card composite keys (`name__collection__number`) the
 * current user has already purchased in this collection. Composite key matches
 * `Card.id` used in the client catalog.
 */
export const getOwnedCardKeysInCollection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context
    const { data: orders, error: ordersErr } = await (supabase as any)
      .from('orders')
      .select('id')
      .eq('user_id', userId)
      .in('status', PAID_ORDER_STATUSES)
    if (ordersErr) {
      console.error('[collection-progress] orders failed', ordersErr)
      return { ownedKeys: [] as string[] }
    }
    const orderIds = (orders ?? []).map((o: { id: string }) => o.id)
    if (orderIds.length === 0) return { ownedKeys: [] }

    const { data: items, error } = await (supabase as any)
      .from('order_items')
      .select('card_name, card_number, collection')
      .in('order_id', orderIds)
      .eq('collection', data.collection)
    if (error) {
      console.error('[collection-progress] items failed', error)
      return { ownedKeys: [] }
    }
    const keys = new Set<string>()
    for (const r of (items ?? []) as Array<{
      card_name: string | null
      card_number: string | null
      collection: string | null
    }>) {
      if (r.card_name && r.card_number && r.collection) {
        keys.add(`${r.card_name}__${r.collection}__${r.card_number}`)
      }
    }
    return { ownedKeys: Array.from(keys) }
  })
