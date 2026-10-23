import { ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { defineAdminTool, adminVisible, writeAnnotations, adminWrite } from '../access';
import { uuid, chave } from '../write-rules';
export default defineAdminTool({ name: 'atualizar_cliente', title: 'Atualizar cliente', description: 'Atualiza nome, telefone, WhatsApp ou data de nascimento de um cliente. CPF, e-mail de login, senha e permissões não podem ser alterados por aqui.', enabled: adminVisible, annotations: writeAnnotations,
  inputSchema: { cliente_id: uuid.describe('user_id retornado por listar_clientes.'), chave_idempotencia: chave, nome: z.string().trim().min(2).max(120).optional(), telefone: z.string().trim().regex(/^[0-9 ()+-]{8,20}$/).optional(), whatsapp: z.string().trim().regex(/^[0-9 ()+-]{8,20}$/).optional(), nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() },
  handler: (a, ctx) => {
    const campos = Object.entries({ full_name: a.nome, phone: a.telefone, whatsapp: a.whatsapp, birth_date: a.nascimento }).filter(([, v]) => v !== undefined).map(([k]) => k);
    return adminWrite(ctx, 'atualizar_cliente', { chave: a.chave_idempotencia, alvo: a.cliente_id, campos }, async db => {
      if (!campos.length) throw new ToolError('Informe ao menos um campo para alterar.');
      const { data, error } = await db.rpc('mcp_update_customer', { _user_id: a.cliente_id, _full_name: a.nome ?? '', _phone: a.telefone ?? '', _whatsapp: a.whatsapp ?? '', _birth_date: a.nascimento as string });
      if (error) throw error;
      return { cliente: data, campos_alterados: campos };
    });
  },
});
