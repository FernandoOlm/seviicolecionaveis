import { defineTool, ToolError, type AuthContext, type ToolContext } from '@lovable.dev/mcp-js';
import { supabaseForUser } from './supabase';
export interface AdminContext { canReadAdmin: boolean }
export const defineAdminTool = defineTool.withAppContext<AdminContext>();
export type UserClient = ReturnType<typeof supabaseForUser>;
export type AuditAction = 'catalog' | 'consent' | 'meu_perfil' | 'resumo_vendas' | 'listar_pedidos' | 'obter_pedido' | 'listar_envios' | 'listar_leiloes' | 'listar_clientes' | 'listar_produtos' | 'relatorio_operacional';

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
