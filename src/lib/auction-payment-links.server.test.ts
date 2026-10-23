import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  link: { order_id: 'order-a', expires_at: '2099-01-01T00:00:00Z' },
  query: vi.fn(),
  match: vi.fn(),
}));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  from: (table: string) => ({ select: () => ({ eq: (_column: string, value: string) => {
    if (table === 'orders') return { maybeSingle: async () => ({ data: { origin: 'auction', user_id: 'owner-a', phone: '557988666663' } }) };
    return { eq: () => ({ maybeSingle: async () => ({ data: value === mock.link.order_id ? mock.link : null }) }) };
  } }) }),
  rpc: () => mock.match(),
} }));
import { assertAuctionPaymentLink } from './auction-payment-links.server';
describe('order scoped auction links', () => {
  beforeEach(() => { mock.link = { order_id: 'order-a', expires_at: '2099-01-01T00:00:00Z' }; mock.match.mockResolvedValue({ data: 'owner-a', error: null }); });
  it('accepts a live link only for its order', async () => {
    await expect(assertAuctionPaymentLink('order-a', 'a'.repeat(64))).resolves.toBeUndefined();
    await expect(assertAuctionPaymentLink('order-b', 'a'.repeat(64))).rejects.toThrow();
  });
  it('rejects expired links', async () => {
    mock.link.expires_at = '2020-01-01T00:00:00Z';
    await expect(assertAuctionPaymentLink('order-a', 'a'.repeat(64))).rejects.toThrow();
  });
  it('rejects malformed or ambiguous identity', async () => {
    await expect(assertAuctionPaymentLink('order-a', 'order-a')).rejects.toThrow();
    mock.match.mockResolvedValue({ data: null, error: null });
    await expect(assertAuctionPaymentLink('order-a', 'a'.repeat(64))).rejects.toThrow();
  });
});