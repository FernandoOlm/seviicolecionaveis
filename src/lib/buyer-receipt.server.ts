import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendTransactionalEmailSafe } from '@/lib/email/send.server'
import { SCHEDULE_EMAIL_SETTING } from './schedule-confirmation'

export async function notifyStoreOfBuyerReceipt(order: { id: string; recipient_name: string; email: string; buyer_received_at: string; buyer_received_by: string }) {
  const { data, error } = await supabaseAdmin.from('app_settings').select('value').eq('key', SCHEDULE_EMAIL_SETTING).maybeSingle()
  if (error) throw new Error('Store email settings unavailable')
  const value = data?.value
  const configured = value && typeof value === 'object' && !Array.isArray(value) && typeof value.email === 'string' ? value.email.trim() : ''
  return sendTransactionalEmailSafe({
    templateName: 'buyer-receipt-confirmed',
    recipientEmail: configured || 'seviicolecionaveis@gmail.com',
    idempotencyKey: `buyer-receipt-${order.id}-${order.buyer_received_at}`,
    templateData: { orderId: order.id, recipientName: order.recipient_name, customerEmail: order.email, confirmedAt: order.buyer_received_at, userId: order.buyer_received_by },
  })
}