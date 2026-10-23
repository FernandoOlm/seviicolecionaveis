import { ToolError } from '@lovable.dev/mcp-js';
import { defineAdminTool, adminVisible, criticalAnnotations, adminWrite, requireConfirmation } from '../access';
import { uuid, chave, confirmacao } from '../write-rules';
export default defineAdminTool({ name: 'encerrar_leilao', title: 'Encerrar leilão', description: 'Solicita ao bot o encerramento imediato do leilão (mesmo botão "Encerrar" do painel). Irreversível: exige confirmação explícita.', enabled: adminVisible, annotations: criticalAnnotations,
  inputSchema: { leilao_id: uuid, chave_idempotencia: chave, confirmacao },
  handler: (a, ctx) => adminWrite(ctx, 'encerrar_leilao', { chave: a.chave_idempotencia, alvo: a.leilao_id, campos: ['close_schedule'] }, async db => {
    const { data: auction, error: e1 } = await db.from('auctions').select('id,status,group_jid').eq('id', a.leilao_id).maybeSingle();
    if (e1) throw e1;
    if (!auction) throw new ToolError('Registro não encontrado.');
    if (auction.status === 'finished') return { leilao_id: a.leilao_id, status: 'finished', mensagem: 'Leilão já estava encerrado.' };
    requireConfirmation(a.confirmacao, a.leilao_id, 'encerrar leilão');
    const { error } = await db.from('auction_schedules').insert({ auction_id: a.leilao_id, action: 'CLOSE', scheduled_time: new Date().toISOString(), group_jid: auction.group_jid });
    if (error) throw error;
    return { leilao_id: a.leilao_id, mensagem: 'Encerramento solicitado ao bot.' };
  }),
});
