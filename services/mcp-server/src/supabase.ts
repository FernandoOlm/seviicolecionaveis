import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zuypkggpecsqormwculg.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1eXBrZ2dwZWNzcW9ybXdjdWxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NDY4MDMsImV4cCI6MjA5MzUyMjgwM30.poDv3khFEu-Cg3v1zPwDr4k8CNuahn66hsb_rgq69n4';

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
