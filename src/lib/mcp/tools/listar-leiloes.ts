import { z } from 'zod';
import { defineAdminTool, adminVisible, readAnnotations, adminRead } from '../access';
import { pagination } from '../read-rules';
export default defineAdminTool({ name: 'listar_leiloes', title: 'Leilões cadastrados', description: 'Consulta leilões cadastrados, ativos e encerrados, com filtro opcional por status.', inputSchema: { ...pagination, status: z.string().max(40).optional().describe('Status exato do leilão.') }, enabled: adminVisible, annotations: readAnnotations,
  handler: ({ pagina, limite, status }, ctx) => adminRead(ctx, 'listar_leiloes', async db => {
    let query = db.from('auctions').select('id,auction_number,title,status,scheduled_start,scheduled_end,closed_at', { count:'exact' }).order('created_at',{ascending:false}).range((pagina-1)*limite,pagina*limite-1);
    if (status) query = query.eq('status',status);
    const { data, count, error } = await query.abortSignal(ctx.signal);
    if (error) throw error;
    return { leiloes: data, total: count, pagina };
  }),
});
