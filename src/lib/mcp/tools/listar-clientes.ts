import { defineAdminTool, adminVisible, readAnnotations, adminRead } from '../access';
import { pagination } from '../read-rules';
export default defineAdminTool({ name: 'listar_clientes', title: 'Clientes da loja', description: 'Consulta identificadores, nomes e datas de cadastro dos clientes; não expõe CPF, telefone ou credenciais.', inputSchema: pagination, enabled: adminVisible, annotations: readAnnotations,
  handler: ({ pagina, limite }, ctx) => adminRead(ctx, 'listar_clientes', async db => {
    // Existing profile RLS is owner-only; this narrow RPC rechecks the live site admin role.
    const { data, error } = await db.rpc('mcp_list_customers',{_limit:limite,_offset:(pagina-1)*limite}).abortSignal(ctx.signal);
    if (error) throw error;
    return { clientes:data, pagina };
  }),
});
