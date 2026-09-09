CREATE TABLE IF NOT EXISTS public.bot_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_name TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'STARTING',
  qr_code_base64 TEXT,
  bot_number TEXT,
  command TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_instances TO authenticated;
GRANT ALL ON public.bot_instances TO service_role;
ALTER TABLE public.bot_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam bot_instances" ON public.bot_instances FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.bot_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_jid TEXT UNIQUE NOT NULL,
  group_name TEXT,
  group_type TEXT NOT NULL DEFAULT 'principal',
  status TEXT NOT NULL DEFAULT 'active',
  activated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_groups TO authenticated;
GRANT ALL ON public.bot_groups TO service_role;
ALTER TABLE public.bot_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam bot_groups" ON public.bot_groups FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  group_name TEXT,
  group_type TEXT NOT NULL DEFAULT 'principal',
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_by_jid TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activation_codes TO authenticated;
GRANT ALL ON public.activation_codes TO service_role;
ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam activation_codes" ON public.activation_codes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.bot_command_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command TEXT NOT NULL,
  target_group TEXT,
  target_bot TEXT DEFAULT 'bot_seviicolecionaveis',
  args JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_command_queue TO authenticated;
GRANT ALL ON public.bot_command_queue TO service_role;
ALTER TABLE public.bot_command_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam bot_command_queue" ON public.bot_command_queue FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS bot_command_queue_status_idx ON public.bot_command_queue (status, target_bot);
CREATE INDEX IF NOT EXISTS bot_groups_status_idx ON public.bot_groups (status);

ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_instances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_command_queue;