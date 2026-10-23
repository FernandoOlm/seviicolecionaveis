import { supabaseAdmin } from '@/integrations/supabase/client.server';
async function hashToken(token: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function createAuctionPaymentLink(orderId: string): Promise<string> {
  const { data: order, error } = await supabaseAdmin.from('orders').select('origin, status, user_id, phone').eq('id', orderId).maybeSingle();
  if (error || !order) throw new Error('Não foi possível preparar o link de pagamento.');
  const base = `https://seviicolecionaveis.com.br/pay/${orderId}`;
  if (order.origin !== 'auction' || order.status !== 'pending') return base;
  const { data: matched, error: matchError } = await supabaseAdmin.rpc('find_user_by_phone', { _digits: order.phone ?? '' });
  const { data: account } = await supabaseAdmin.auth.admin.getUserById(order.user_id);
  if (matchError || matched !== order.user_id || !account.user?.email || account.user.email.endsWith('@whatsapp.seviicolecionaveis.com.br')) return base;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  const { error: insertError } = await supabaseAdmin.from('auction_payment_links').insert({ order_id: orderId, token_hash: await hashToken(token), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() });
  if (insertError) throw new Error('Não foi possível preparar o link de pagamento.');
  return `${base}#payment=${token}`;
}
export async function assertAuctionPaymentLink(orderId: string, token: string): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Link inválido ou expirado. Entre na sua conta para pagar.');
  const { data, error } = await supabaseAdmin.from('auction_payment_links').select('order_id, expires_at').eq('order_id', orderId).eq('token_hash', await hashToken(token)).maybeSingle();
  if (error || !data || new Date(data.expires_at).getTime() <= Date.now()) throw new Error('Link inválido ou expirado. Entre na sua conta para pagar.');
  const { data: order } = await supabaseAdmin.from('orders').select('origin, user_id, phone').eq('id', orderId).maybeSingle();
  if (!order || order.origin !== 'auction') throw new Error('Link inválido ou expirado.');
  const { data: matched, error: matchError } = await supabaseAdmin.rpc('find_user_by_phone', { _digits: order.phone ?? '' });
  if (matchError || matched !== order.user_id) throw new Error('Confirme sua conta antes de pagar este pedido.');
}