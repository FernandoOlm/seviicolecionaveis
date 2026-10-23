import { z } from 'zod';
import { defineAdminTool, adminVisible, writeAnnotations, adminWrite } from '../access';
import { uuid, chave, definedFields } from '../write-rules';
export default defineAdminTool({ name: 'editar_leilao', title: 'Editar leilão', description: 'Edita título, descrição, mensagem de encerramento ou datas de um leilão que ainda não está ao vivo nem encerrado.', enabled: adminVisible, annotations: writeAnnotations,
  inputSchema: { leilao_id: uuid, chave_idempotencia: chave, titulo: z.string().trim().min(3).max(200).optional(), descricao: z.string().max(4000).optional(), mensagem_encerramento: z.string().max(2000).optional(), inicio: z.string().datetime({ offset: true }).optional(), fim: z.string().datetime({ offset: true }).optional() },
  handler: (a, ctx) => {
    const patch = definedFields({ title: a.titulo, description: a.descricao, closing_message: a.mensagem_encerramento, scheduled_start: a.inicio, scheduled_end: a.fim });
    return adminWrite(ctx, 'editar_leilao', { chave: a.chave_idempotencia, alvo: a.leilao_id, campos: Object.keys(patch) }, async db => {
      if (!Object.keys(patch).length) throw new Error('nada');
      const { data: cur, error: e1 } = await db.from('auctions').select('id,status,scheduled_start,scheduled_end').eq('id', a.leilao_id).maybeSingle();
      if (e1) throw e1;
      if (!cur) throw new Error('não encontrado');
      if (cur.status === 'live' || cur.status === 'finished') throw new Error('estado');
      if (new Date(patch.scheduled_end ?? cur.scheduled_end) <= new Date(patch.scheduled_start ?? cur.scheduled_start)) throw new Error('datas');
      const { data, error } = await db.from('auctions').update(patch).eq('id', a.leilao_id).select('id,title,status,scheduled_start,scheduled_end').single();
      if (error) throw error;
      return { leilao: data, campos_alterados: Object.keys(patch) };
    });
  },
});
