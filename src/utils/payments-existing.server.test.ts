import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  order: { id: '11111111-1111-4111-8111-111111111111', user_id: 'owner', status: 'pending', total_cents: 4900, email: 'shadow@whatsapp.seviicolecionaveis.com.br', recipient_name: 'Bot name', cpf: null as string | null },
  profile: { cpf: '52998224725' as string | null, full_name: 'Account name' },
  pix: vi.fn(), card: vi.fn(), paid: vi.fn(), update: vi.fn(),
}));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'orders' ? mocks.order : table === 'profiles' ? mocks.profile : null, error: null }), eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    update: (data: unknown) => { mocks.update(data); return { eq: async () => ({ error: null }) }; },
  }),
  auth: { admin: { getUserById: async () => ({ data: { user: { email: 'customer@example.com' } }, error: null }) } },
} }));
vi.mock('@/lib/mercadopago.server', () => ({ createPixPayment: mocks.pix, createCardPaymentMP: mocks.card, getPixPayment: vi.fn() }));
vi.mock('@/lib/orders.server', () => ({ markOrderPaid: mocks.paid, cancelOrder: vi.fn() }));
vi.mock('@/lib/email/send.server', () => ({ sendTransactionalEmailSafe: vi.fn() }));
vi.mock('@/lib/stripe.server', () => ({ createStripeClient: vi.fn() }));
vi.mock('@/lib/event-mode.server', () => ({ assertSalesOpen: vi.fn() }));
import { regeneratePixForExistingOrderServer, payExistingOrderWithCardServer } from './payments.server';
describe('existing auction payments', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.order.status = 'pending'; mocks.profile.cpf = '52998224725';
    mocks.pix.mockResolvedValue({ id: 10, qr_code: 'copy-code', qr_code_base64: 'qr', date_of_expiration: '2099-01-01T00:00:00Z' });
    mocks.card.mockResolvedValue({ id: 11, status: 'approved' });
  });
  it('generates Pix from account CPF and email without modifying the auction amount', async () => {
    const result = await regeneratePixForExistingOrderServer(mocks.order.id, 'owner');
    expect(mocks.pix).toHaveBeenCalledWith(expect.objectContaining({ payerCpf: '52998224725', payerEmail: 'customer@example.com', payerFirstName: 'Account', amountCents: 4900 }));
    expect(result).toMatchObject({ totalCents: 4900, qrCode: 'copy-code' });
    expect(mocks.update.mock.calls[0]?.[0]).not.toHaveProperty('total_cents');
  });
  it('blocks a different customer before sending personal data to the provider', async () => {
    await expect(regeneratePixForExistingOrderServer(mocks.order.id, 'stranger')).rejects.toThrow('Pedido não encontrado');
    expect(mocks.pix).not.toHaveBeenCalled();
  });
  it('requires CPF correction when missing from both the account and order', async () => {
    mocks.profile.cpf = null;
    await expect(regeneratePixForExistingOrderServer(mocks.order.id, 'owner')).rejects.toThrow('Minha conta');
    expect(mocks.pix).not.toHaveBeenCalled();
  });
  it('does not generate payments for finalized orders', async () => {
    mocks.order.status = 'paid';
    await expect(regeneratePixForExistingOrderServer(mocks.order.id, 'owner')).rejects.toThrow('pendente');
    expect(mocks.pix).not.toHaveBeenCalled();
  });
  it('uses the same card payment and paid pipeline with account CPF', async () => {
    const result = await payExistingOrderWithCardServer(mocks.order.id, 'owner', { token: 'test-card-token', paymentMethodId: 'visa', installments: 1 });
    expect(mocks.card).toHaveBeenCalledWith(expect.objectContaining({ payerCpf: '52998224725', amountCents: 4900 }));
    expect(result.status).toBe('approved');
    expect(mocks.paid).toHaveBeenCalledWith(mocks.order.id, { mercadopagoPaymentId: '11' });
  });
});