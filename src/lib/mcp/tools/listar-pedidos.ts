import { z } from 'zod';
import { defineAdminTool, adminVisible, readAnnotations, adminRead } from '../access';
import { pagination } from '../read-rules';
export default defineAdminTool({ name: 'listar_pedidos', title: 'Pedidos da loja', description: 'Consulta pedidos e pedidos de leilão por status, com paginação e sem dados de pagamento secretos.', inputSchema: { ...pagination, status: z.string().max(40).optional().describe('Status exato do pedido.'), origem: z.enum(['site','auction','manual']).optional().describe('Origem do pedido.') }, enabled: adminVisible, annotations: readAnnotations,
  handler: ({ pagina, limite, status, origem }, ctx) => adminRead(ctx, 'listar_pedidos', async db => {
    let query = db.from('orders').select('id,status,total_cents,recipient_name,shipping_method,tracking_code,created_at,origin', { count: 'exact' }).order('created_at', { ascending: false }).range((pagina-1)*limite, pagina*limite-1);
    if (status) query = query.eq('status', status);
    if (origem) query = query.eq('origin', origem);
    const { data, count, error } = await query.abortSignal(ctx.signal);
    if (error) throw error;
    return { pedidos: data, total: count, pagina };
  }),
});
