import { z } from 'zod';
import { defineAdminTool, adminVisible, readAnnotations, adminRead } from '../access';
export default defineAdminTool({ name: 'obter_pedido', title: 'Detalhes operacionais de pedido', description: 'Consulta valores, itens e rastreamento de um pedido, sem CPF, endereço, QR Pix ou credenciais.', inputSchema: { orderId: z.string().uuid().describe('Identificador do pedido.') }, enabled: adminVisible, annotations: readAnnotations,
  handler: ({ orderId }, ctx) => adminRead(ctx, 'obter_pedido', async db => {
    const { data, error } = await db.from('orders').select('id,status,total_cents,subtotal_cents,discount_cents,shipping_cost_cents,refunded_cents,recipient_name,shipping_method,tracking_code,carrier,created_at,payment_paid_at,scheduled_at,origin,auction_id').eq('id', orderId).abortSignal(ctx.signal).maybeSingle();
    if (error || !data) throw error ?? new Error('Order not found');
    const items = await db.from('order_items').select('id,card_name,quantity,unit_price_cents,cancelled_quantity,collection,finish,language,condition').eq('order_id', orderId).limit(500).abortSignal(ctx.signal);
    if (items.error) throw items.error;
    return { pedido: data, itens: items.data };
  }),
});
