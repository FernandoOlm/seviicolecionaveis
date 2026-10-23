import { defineAdminTool, adminVisible, readAnnotations, adminRead } from '../access';
import { period, salesSummary } from '../read-rules';
export default defineAdminTool({ name: 'resumo_vendas', title: 'Vendas e relatório financeiro', description: 'Consolida pedidos criados no período, valores pagos e reembolsos; não inclui taxas do provedor nem custos de aquisição.', inputSchema: period, enabled: adminVisible, annotations: readAnnotations,
  handler: ({ dias }, ctx) => adminRead(ctx, 'resumo_vendas', async db => {
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const rows: { status: string; total_cents: number; refunded_cents: number }[] = [];
    // Bounded pagination avoids silently treating the Data API row cap as the full report.
    for (let offset = 0; offset < 20000; offset += 500) {
      const { data, error } = await db.from('orders').select('status,total_cents,refunded_cents').gte('created_at', desde).order('id').range(offset, offset + 499).abortSignal(ctx.signal);
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 500) return { dias, desde, ...salesSummary(rows) };
    }
    throw new Error('Report too large; reduce period');
  }),
});
