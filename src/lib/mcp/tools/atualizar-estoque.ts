import { ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { defineAdminTool, adminVisible, writeAnnotations, adminWrite, requireConfirmation } from '../access';
import { uuid, chave, confirmacao, estoque, PRODUCT_TABLES } from '../write-rules';
export default defineAdminTool({ name: 'atualizar_estoque', title: 'Atualizar estoque', description: 'Define a quantidade em estoque de um produto (valor absoluto; o histórico de estoque é registrado automaticamente). Zerar estoque exige confirmação.', enabled: adminVisible, annotations: writeAnnotations,
  inputSchema: { produto_id: uuid, tipo: z.enum(['cartas','lacrados','acessorios','videogames']), quantidade: estoque, chave_idempotencia: chave, confirmacao },
  handler: (a, ctx) => adminWrite(ctx, 'atualizar_estoque', { chave: a.chave_idempotencia, alvo: a.produto_id, campos: ['stock'] }, async db => {
    if (a.quantidade === 0) requireConfirmation(a.confirmacao, a.produto_id, 'zerar estoque');
    const table = a.tipo === 'cartas' ? 'cards' : PRODUCT_TABLES[a.tipo];
    const { data: before, error: e1 } = await db.from(table).select('id,stock').eq('id', a.produto_id).maybeSingle();
    if (e1) throw e1;
    if (!before) throw new ToolError('Registro não encontrado.');
    const { error } = await db.from(table).update({ stock: a.quantidade }).eq('id', a.produto_id);
    if (error) throw error;
    return { produto_id: a.produto_id, tipo: a.tipo, estoque_anterior: before.stock, estoque_novo: a.quantidade };
  }),
});
