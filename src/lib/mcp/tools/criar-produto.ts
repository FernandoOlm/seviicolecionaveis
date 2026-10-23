import { z } from 'zod';
import { Constants } from '@/integrations/supabase/types';
import { defineAdminTool, adminVisible, writeAnnotations, adminWrite } from '../access';
import { chave, centavos, estoque, PRODUCT_TABLES } from '../write-rules';
export default defineAdminTool({ name: 'criar_produto', title: 'Criar produto', description: 'Cadastra uma carta avulsa ou um produto lacrado/acessório/videogame. Produtos não-carta são criados inativos para revisão no painel.', enabled: adminVisible, annotations: { ...writeAnnotations, idempotentHint: true },
  inputSchema: { chave_idempotencia: chave, tipo: z.enum(['cartas','lacrados','acessorios','videogames']), nome: z.string().trim().min(2).max(200), preco_centavos: centavos, estoque: estoque.default(0), descricao: z.string().max(4000).optional(),
    colecao: z.string().trim().max(80).optional().describe('Cartas: coleção.'), numero: z.string().trim().max(20).optional().describe('Cartas: número.'),
    idioma: z.enum(Constants.public.Enums.card_language).optional(), acabamento: z.enum(Constants.public.Enums.card_finish).optional(), condicao: z.enum(Constants.public.Enums.card_condition).optional(), categoria: z.string().trim().max(60).optional().describe('Acessórios: categoria (obrigatória).') },
  handler: (a, ctx) => adminWrite(ctx, 'criar_produto', { chave: a.chave_idempotencia, alvo: null, campos: ['novo'] }, async (db, userId) => {
    if (a.tipo === 'cartas') {
      if (!a.colecao || !a.numero || !a.idioma || !a.acabamento) throw new Error('campos');
      const { data, error } = await db.from('cards').insert({ name: a.nome, collection: a.colecao, card_number: a.numero, language: a.idioma, finish: a.acabamento, condition: a.condicao ?? 'NM', base_price_cents: a.preco_centavos, stock: a.estoque, created_by: userId }).select('id,name,collection,card_number,stock,base_price_cents').single();
      if (error) throw error;
      return { tipo: a.tipo, produto: data };
    }
    const base = { title: a.nome, description: a.descricao ?? null, price_cents: a.preco_centavos, stock: a.estoque, active: false };
    const q = a.tipo === 'acessorios'
      ? db.from(PRODUCT_TABLES.acessorios).insert({ ...base, category: a.categoria ?? 'Outros' })
      : db.from(PRODUCT_TABLES[a.tipo]).insert(base);
    const { data, error } = await q.select('id,title,price_cents,stock,active').single();
    if (error) throw error;
    return { tipo: a.tipo, produto: data };
  }),
});
