import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
const linkInput = z.object({ orderId: z.string().uuid(), token: z.string().regex(/^[a-f0-9]{64}$/) });
export const readLinkedAuctionPayment = createServerFn({ method: 'POST' }).inputValidator((data: unknown) => linkInput.parse(data)).handler(async ({ data }) => {
  const { assertAuctionPaymentLink } = await import('./auction-payment-links.server');
  await assertAuctionPaymentLink(data.orderId, data.token);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: order, error } = await supabaseAdmin.from('orders').select('id, status, total_cents, payment_method, pix_qr_code, pix_qr_code_base64, pix_expires_at').eq('id', data.orderId).maybeSingle();
  if (error || !order) throw new Error('Pedido não encontrado.');
  return order;
});
export const generateLinkedAuctionPix = createServerFn({ method: 'POST' }).inputValidator((data: unknown) => linkInput.parse(data)).handler(async ({ data }) => {
  const { assertAuctionPaymentLink } = await import('./auction-payment-links.server');
  await assertAuctionPaymentLink(data.orderId, data.token);
  const { regeneratePixForExistingOrderServer } = await import('@/utils/payments.server');
  return regeneratePixForExistingOrderServer(data.orderId, null, data.token);
});
export const checkLinkedAuctionPayment = createServerFn({ method: 'POST' }).inputValidator((data: unknown) => linkInput.parse(data)).handler(async ({ data }) => {
  const { assertAuctionPaymentLink } = await import('./auction-payment-links.server');
  await assertAuctionPaymentLink(data.orderId, data.token);
  const { checkPixOrderStatusServer } = await import('@/utils/payments.server');
  return checkPixOrderStatusServer(data.orderId, null, data.token);
});