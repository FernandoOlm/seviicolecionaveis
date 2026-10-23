import { ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { defineAdminTool, adminVisible, writeAnnotations, adminWrite } from '../access';
import { uuid, chave } from '../write-rules';
export default defineAdminTool({ name: 'atualizar_rastreamento', title: 'Atualizar rastreamento', description: 'Salva código/link de rastreio e marca o pedido como enviado, como o botão de rastreio do painel (envia e-mail ao cliente).', enabled: adminVisible, annotations: writeAnnotations,
  inputSchema: { pedido_id: uuid, chave_idempotencia: chave, codigo_rastreio: z.string().trim().min(3).max(60), transportadora: z.enum(['correios','latam','pickup']).default('correios'), link_rastreio: z.string().trim().url().max(500).optional() },
  handler: (a, ctx) => adminWrite(ctx, 'atualizar_rastreamento', { chave: a.chave_idempotencia, alvo: a.pedido_id, campos: ['tracking_code','carrier','tracking_url','status'] }, async (db, userId) => {
    const { data: order, error } = await db.from('orders').select('id,status').eq('id', a.pedido_id).maybeSingle();
    if (error) throw error;
    if (!order) throw new ToolError('Registro não encontrado.');
    const { applyAdminOrderStatus } = await import('@/lib/admin-order-status.server');
    await applyAdminOrderStatus(userId, { order_id: a.pedido_id, status: 'shipped', tracking_code: a.codigo_rastreio, carrier: a.transportadora, tracking_url: a.link_rastreio ?? null });
    return { pedido_id: a.pedido_id, status: 'shipped', codigo_rastreio: a.codigo_rastreio };
  }),
});
