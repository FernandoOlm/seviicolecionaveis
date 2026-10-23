import { ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { ORDER_STATUSES } from '@/lib/order-status';
import { defineAdminTool, adminVisible, criticalAnnotations, adminWrite, requireConfirmation } from '../access';
import { uuid, chave, confirmacao, isCriticalStatusChange } from '../write-rules';
export default defineAdminTool({ name: 'alterar_status_pedido', title: 'Alterar status do pedido', description: 'Muda o status de um pedido com as mesmas regras do painel (estoque, pontos, e-mails). Cancelar, marcar pago, entregue ou reabrir cancelado exige confirmação explícita.', enabled: adminVisible, annotations: criticalAnnotations,
  inputSchema: { pedido_id: uuid, status: z.enum(ORDER_STATUSES), chave_idempotencia: chave, confirmacao },
  handler: (a, ctx) => adminWrite(ctx, 'alterar_status_pedido', { chave: a.chave_idempotencia, alvo: a.pedido_id, campos: ['status'] }, async (db, userId) => {
    const { data: order, error } = await db.from('orders').select('id,status').eq('id', a.pedido_id).maybeSingle();
    if (error) throw error;
    if (!order) throw new ToolError('Registro não encontrado.');
    if (isCriticalStatusChange(order.status, a.status)) requireConfirmation(a.confirmacao, a.pedido_id, `${order.status} → ${a.status}`);
    const { applyAdminOrderStatus } = await import('@/lib/admin-order-status.server');
    await applyAdminOrderStatus(userId, { order_id: a.pedido_id, status: a.status });
    return { pedido_id: a.pedido_id, status_anterior: order.status, status_novo: a.status };
  }),
});
