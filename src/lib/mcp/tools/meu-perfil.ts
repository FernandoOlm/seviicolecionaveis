import { defineAdminTool, adminVisible, readAnnotations, adminRead } from '../access';
export default defineAdminTool({ name: 'meu_perfil', title: 'Minha conta administrativa', description: 'Consulta a identidade verificada e a permissão administrativa atual da sua conta.', inputSchema: {}, enabled: adminVisible, annotations: readAnnotations,
  handler: (_, ctx) => adminRead(ctx, 'meu_perfil', async db => {
    const { data, error } = await db.from('profiles').select('full_name').eq('user_id', ctx.getUserId() ?? '').maybeSingle();
    if (error) throw error;
    return { user_id: ctx.getUserId(), nome: data?.full_name, loja: 'Sevii Colecionáveis', administrador: true };
  }),
});
