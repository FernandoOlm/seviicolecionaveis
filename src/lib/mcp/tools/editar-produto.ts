import { z } from 'zod';
import { defineAdminTool, adminVisible, writeAnnotations, adminWrite, requireConfirmation } from '../access';
import { uuid, chave, confirmacao, centavos, definedFields, PRODUCT_TABLES } from '../write-rules';
export default defineAdminTool({ name: 'editar_produto', title: 'Editar produto', description: 'Edita nome, preço, descrição ou ativação de um produto. Desativar produto exige confirmação. Estoque usa atualizar_estoque.', enabled: adminVisible, annotations: writeAnnotations,
  inputSchema: { produto_id: uuid, tipo: z.enum(['cartas','lacrados','acessorios','videogames']), chave_idempotencia: chave, confirmacao, nome: z.string().trim().min(2).max(200).optional(), preco_centavos: centavos.optional(), descricao: z.string().max(4000).optional().describe('Não se aplica a cartas.'), ativo: z.boolean().optional().describe('Não se aplica a cartas.') },
  handler: (a, ctx) => {
    const card = a.tipo === 'cartas';
    const patch = card ? definedFields({ name: a.nome, base_price_cents: a.preco_centavos }) : definedFields({ title: a.nome, price_cents: a.preco_centavos, description: a.descricao, active: a.ativo });
    return adminWrite(ctx, 'editar_produto', { chave: a.chave_idempotencia, alvo: a.produto_id, campos: Object.keys(patch) }, async db => {
      if (!Object.keys(patch).length) throw new Error('nada');
      if (a.ativo === false) requireConfirmation(a.confirmacao, a.produto_id, 'desativar produto');
      const { data, error } = card
        ? await db.from('cards').update(patch).eq('id', a.produto_id).select('id,name,base_price_cents,stock').maybeSingle()
        : await db.from(PRODUCT_TABLES[a.tipo as keyof typeof PRODUCT_TABLES]).update(patch).eq('id', a.produto_id).select('id,title,price_cents,stock,active').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('não encontrado');
      return { tipo: a.tipo, produto: data, campos_alterados: Object.keys(patch) };
    });
  },
});
