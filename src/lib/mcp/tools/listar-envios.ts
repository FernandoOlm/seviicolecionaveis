import { defineAdminTool, adminVisible, readAnnotations, adminRead } from '../access';
import { pagination } from '../read-rules';
export default defineAdminTool({ name: 'listar_envios', title: 'Envios e retiradas', description: 'Consulta modalidade, status, rastreamento e agendamentos dos pedidos.', inputSchema: pagination, enabled: adminVisible, annotations: readAnnotations,
  handler: ({ pagina, limite }, ctx) => adminRead(ctx, 'listar_envios', async db => {
    const { data, count, error } = await db.from('orders').select('id,status,recipient_name,shipping_method,tracking_code,carrier,scheduled_at,schedule_kind,reschedule_required,created_at', { count:'exact' }).order('created_at', {ascending:false}).range((pagina-1)*limite,pagina*limite-1).abortSignal(ctx.signal);
    if (error) throw error;
    return { envios: data, total: count, pagina };
  }),
});
