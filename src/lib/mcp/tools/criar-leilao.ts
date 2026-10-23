import { z } from 'zod';
import { defineAdminTool, adminVisible, writeAnnotations, adminWrite } from '../access';
import { chave } from '../write-rules';
export default defineAdminTool({ name: 'criar_leilao', title: 'Criar leilão (rascunho)', description: 'Cria um leilão em rascunho para um grupo de WhatsApp conectado. Lotes e disparo continuam pelo painel.', enabled: adminVisible, annotations: writeAnnotations,
  inputSchema: { chave_idempotencia: chave, titulo: z.string().trim().min(3).max(200), descricao: z.string().max(4000).optional(), grupo_jid: z.string().trim().min(5).max(120).describe('Identificador do grupo do bot (veja no painel).'), inicio: z.string().datetime({ offset: true }), fim: z.string().datetime({ offset: true }) },
  handler: (a, ctx) => adminWrite(ctx, 'criar_leilao', { chave: a.chave_idempotencia, alvo: null, campos: ['novo'] }, async db => {
    if (new Date(a.fim) <= new Date(a.inicio)) throw new Error('datas');
    const { data: group } = await db.from('bot_groups').select('group_jid').eq('group_jid', a.grupo_jid).maybeSingle();
    if (!group) throw new Error('grupo');
    const { data, error } = await db.from('auctions').insert({ title: a.titulo, description: a.descricao ?? null, group_jid: a.grupo_jid, scheduled_start: a.inicio, scheduled_end: a.fim, status: 'draft' }).select('id,auction_number,title,status,scheduled_start,scheduled_end').single();
    if (error) throw error;
    return { leilao: data };
  }),
});
