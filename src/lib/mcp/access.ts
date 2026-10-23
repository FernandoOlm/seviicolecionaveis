import { defineTool, ToolError, type AuthContext, type ToolContext } from '@lovable.dev/mcp-js';
import { supabaseForUser } from './supabase';
export interface AdminContext { canReadAdmin: boolean }
export const defineAdminTool = defineTool.withAppContext<AdminContext>();
export type UserClient = ReturnType<typeof supabaseForUser>;
export type AuditAction = WriteAction | 'catalog' | 'consent' | 'meu_perfil' | 'resumo_vendas' | 'listar_pedidos' | 'obter_pedido' | 'listar_envios' | 'listar_leiloes' | 'listar_clientes' | 'listar_produtos' | 'relatorio_operacional';

export async function audit(db: UserClient, action: AuditAction, outcome: 'allowed' | 'denied' | 'error') {
  const { error } = await db.rpc('record_mcp_access', { _action: action, _outcome: outcome });
  if (error) throw new ToolError('Não foi possível registrar a consulta com segurança.');
}
export async function currentAdmin(db: UserClient): Promise<boolean> {
  // No privilege cache: the RPC checks the same user_roles rows as the site plus bans/deletion.
  const { data, error } = await db.rpc('mcp_admin_access');
  if (error) throw new ToolError('Não foi possível validar sua permissão.');
  return data === true;
}
export async function loadAdminContext(auth: AuthContext): Promise<AdminContext> {
  if (!auth.isAuthenticated()) return { canReadAdmin: false };
  const db = supabaseForUser(auth);
  const allowed = await currentAdmin(db);
  await audit(db, 'catalog', allowed ? 'allowed' : 'denied');
  return { canReadAdmin: allowed };
}
export async function adminRead(ctx: ToolContext<AdminContext>, action: AuditAction, read: (db: UserClient) => Promise<unknown>) {
  const db = supabaseForUser(ctx);
  try {
    if (!await currentAdmin(db)) {
      await audit(db, action, 'denied');
      throw new ToolError('Acesso permitido somente para administradores ativos da Sevii.');
    }
    const result = await read(db);
    // Revalidate before releasing results as well as before querying.
    if (!await currentAdmin(db)) {
      await audit(db, action, 'denied');
      throw new ToolError('Sua permissão administrativa foi removida.');
    }
    await audit(db, action, 'allowed');
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  } catch (error) {
    if (error instanceof ToolError) throw error;
    await audit(db, action, 'error');
    throw new ToolError('Não foi possível concluir a consulta. Tente novamente.');
  }
}
export const adminVisible = ({ appContext }: { appContext: AdminContext }) => appContext.canReadAdmin;
export const readAnnotations = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };

export type WriteAction = 'atualizar_pedido' | 'alterar_status_pedido' | 'atualizar_rastreamento' | 'criar_produto' | 'editar_produto' | 'atualizar_estoque' | 'criar_leilao' | 'editar_leilao' | 'encerrar_leilao' | 'atualizar_cliente';
export const writeAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const criticalAnnotations = { ...writeAnnotations, destructiveHint: true };

/** Expected phrase for critical actions, bound to the exact target. */
export const confirmationPhrase = (targetId: string) => `CONFIRMAR ${targetId.slice(0, 8).toUpperCase()}`;
export function requireConfirmation(confirmacao: string | undefined, targetId: string, what: string) {
  const expected = confirmationPhrase(targetId);
  if ((confirmacao ?? '').trim().toUpperCase() !== expected) {
    throw new ToolError(`Ação crítica (${what}) não executada. Confirme com o administrador e repita a chamada com confirmacao="${expected}".`);
  }
}

export async function adminWrite(
  ctx: ToolContext<AdminContext>, action: WriteAction,
  meta: { chave: string; alvo: string | null; campos: string[] },
  write: (db: UserClient, userId: string) => Promise<Record<string, unknown>>,
) {
  const db = supabaseForUser(ctx);
  const userId = ctx.getUserId();
  if (!userId || !await currentAdmin(db)) {
    await audit(db, action, 'denied');
    throw new ToolError('Acesso permitido somente para administradores ativos da Sevii.');
  }
  // Durable idempotency: the same key from the same admin replays the stored result.
  const { data: prior } = await db.from('mcp_write_log').select('id,outcome,result,action').eq('user_id', userId).eq('idempotency_key', meta.chave).maybeSingle();
  if (prior) {
    if (prior.action !== action) throw new ToolError('Chave de idempotência já usada em outra ação.');
    if (prior.outcome === 'done') return { content: [{ type: 'text' as const, text: JSON.stringify({ repetido: true, ...(prior.result as object) }) }] };
    if (prior.outcome === 'started') throw new ToolError('Esta operação já está em andamento ou foi interrompida; verifique antes de tentar com nova chave.');
  }
  const logId = prior?.id ?? (await (async () => {
    const { data, error } = await db.from('mcp_write_log').insert({ user_id: userId, idempotency_key: meta.chave, action, target_id: meta.alvo, changed_fields: meta.campos }).select('id').single();
    if (error) throw new ToolError('Não foi possível registrar a operação com segurança.');
    return data.id;
  })());
  try {
    const result = await write(db, userId);
    await db.from('mcp_write_log').update({ outcome: 'done', result: result as never }).eq('id', logId);
    await audit(db, action, 'allowed');
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  } catch (error) {
    await db.from('mcp_write_log').update({ outcome: 'error' }).eq('id', logId);
    await audit(db, action, 'error');
    if (error instanceof ToolError) throw error;
    if (error instanceof Response) throw new ToolError(await error.text().catch(() => 'Operação recusada.'));
    throw new ToolError('Não foi possível concluir a alteração. Nada foi confirmado; verifique e tente novamente.');
  }
}
