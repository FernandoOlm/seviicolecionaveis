import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  send: vi.fn(async (_params: { recipientEmail: string; idempotencyKey?: string; templateData?: Record<string, unknown> }) => ({ success: true })),
  setting: vi.fn(async (): Promise<{ data: { value: { email: string } } | null; error: null }> => ({ data: { value: { email: 'loja@example.com' } }, error: null })),
}))
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.setting }) }) }) } }))
vi.mock('@/lib/email/send.server', () => ({ sendTransactionalEmailSafe: mocks.send }))
import { notifyStoreOfBuyerReceipt } from './buyer-receipt.server'
const order = { id: '12345678-abcd-abcd-abcd-123456789abc', recipient_name: 'Comprador', email: 'cliente@example.com', buyer_received_at: '2026-10-22T01:15:00Z', buyer_received_by: 'aaaaaaaa-abcd-abcd-abcd-123456789abc' }
describe('buyer receipt store notification', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.setting.mockResolvedValue({ data: { value: { email: 'loja@example.com' } }, error: null }) })
  it('notifies only the store with buyer, order and audit data', async () => {
    expect((await notifyStoreOfBuyerReceipt(order)).success).toBe(true)
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ templateName: 'buyer-receipt-confirmed', recipientEmail: 'loja@example.com', idempotencyKey: `buyer-receipt-${order.id}-${order.buyer_received_at}`, templateData: { orderId: order.id, recipientName: 'Comprador', customerEmail: 'cliente@example.com', confirmedAt: '2026-10-22T01:15:00Z', userId: order.buyer_received_by } })
  })
  it('uses the existing operational store mailbox when settings are missing', async () => {
    mocks.setting.mockResolvedValue({ data: null, error: null })
    await notifyStoreOfBuyerReceipt(order)
    expect(mocks.send.mock.calls[0]?.[0].recipientEmail).toBe('seviicolecionaveis@gmail.com')
  })
})