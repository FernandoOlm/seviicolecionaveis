import { createClient } from '@supabase/supabase-js';
import type { AuthContext } from '@lovable.dev/mcp-js';
import type { Database } from '@/integrations/supabase/types';

export function supabaseForUser(ctx: AuthContext) {
  const token = ctx.getToken();
  if (!token) throw new Error('Autenticação OAuth obrigatória.');
  const url = process.env['SUPABASE_URL'] ?? import.meta.env['VITE_SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['SUPABASE_ANON_KEY'] ?? import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('Integração indisponível.');
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
