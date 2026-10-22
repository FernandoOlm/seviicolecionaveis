CREATE TABLE public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  action text,
  source text,
  title text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  target_code text,
  customer_name text,
  customer_email text,
  modality text,
  scheduled_at timestamptz,
  event_id uuid,
  event_name text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL UNIQUE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_notifications_unread_idx ON public.admin_notifications (created_at DESC) WHERE read_at IS NULL;
CREATE INDEX admin_notifications_target_idx ON public.admin_notifications (target_type, target_id);
GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read notifications" ON public.admin_notifications FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update notifications" ON public.admin_notifications FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));