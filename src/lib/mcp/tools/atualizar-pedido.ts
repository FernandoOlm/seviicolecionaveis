import { ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { defineAdminTool, adminVisible, writeAnnotations, adminWrite } from '../access';
import { uuid, chave, definedFields } from '../write-rules';
export default defineAdminTool({ name: 'atualizar_pedido', title: 'Atualizar dados do pedido', description: 'Atualiza nome do destinatário, telefone, e-mail ou observações de um pedido. Endereço, frete e itens continuam pelo painel.', enabled: adminVisible, annotations: writeAnnotations,
  inputSchema: { pedido_id: uuid, chave_idempotencia: chave, nome_destinatario: z.string().trim().min(2).max(120).optional(), telefone: z.string().trim().max(30).optional(), email: z.string().trim().email().max(200).optional(), observacoes: z.string().max(2000).optional(), nota_pagamento: z.string().max(500).optional() },
  handler: (a, ctx) => {
    const patch = definedFields({ recipient_name: a.nome_destinatario, phone: a.telefone, email: a.email, notes: a.observacoes, payment_note: a.nota_pagamento });
    return adminWrite(ctx, 'atualizar_pedido', { chave: a.chave_idempotencia, alvo: a.pedido_id, campos: Object.keys(patch) }, async db => {
      if (!Object.keys(patch).length) throw new ToolError('Informe ao menos um campo para alterar.');
      const { data, error } = await db.from('orders').update(patch).eq('id', a.pedido_id).select('id,recipient_name,email,phone,notes').maybeSingle();
      if (error) throw error;
      if (!data) throw new ToolError('Registro não encontrado.');
      return { pedido: data, campos_alterados: Object.keys(patch) };
    });
  },
});
