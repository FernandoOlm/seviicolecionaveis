import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { canBuyerConfirmReceipt } from './order-status'

const receiptSchema = z.object({ id: z.string().uuid(), status: z.literal('delivered'), buyer_received_at: z.string(), buyer_received_by: z.string().uuid(), recipient_name: z.string(), email: z.string() })
export const confirmBuyerReceipt = createServerFn({ method: 'POST' })
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { data: order, error: readError } = await context.supabase.from('orders').select('user_id,status').eq('id', data.orderId).eq('user_id', context.userId).maybeSingle()
    if (readError || !order || order.user_id !== context.userId) throw new Error('Não foi possível encontrar este pedido na sua conta.')
    if (!canBuyerConfirmReceipt(order.status)) throw new Error('O status atual deste pedido não permite confirmar o recebimento. Atualize a página.')
    // The RPC locks the row and revalidates ownership/status before an atomic update.
    const { data: result, error } = await context.supabase.rpc('confirm_order_receipt', { _order_id: data.orderId })
    if (error) throw new Error('Não foi possível confirmar o recebimento. Atualize a página e tente novamente.')
    const receipt = receiptSchema.parse(result)
    let storeNotified = false
    try {
      const { notifyStoreOfBuyerReceipt } = await import('./buyer-receipt.server')
      storeNotified = (await notifyStoreOfBuyerReceipt(receipt)).success
    } catch (error) { console.error('[buyer-receipt] store notification failed', error) }
    return { status: receipt.status, buyer_received_at: receipt.buyer_received_at, buyer_received_by: receipt.buyer_received_by, storeNotified }
  })