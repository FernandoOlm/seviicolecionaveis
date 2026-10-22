ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS manual_created_by uuid,
  ADD COLUMN IF NOT EXISTS manual_created_by_email text,
  ADD COLUMN IF NOT EXISTS manual_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_source text,
  ADD COLUMN IF NOT EXISTS payment_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_note text,
  ADD COLUMN IF NOT EXISTS manual_adjustments jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.order_admin_notes (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  internal_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_admin_notes TO authenticated;
GRANT ALL ON public.order_admin_notes TO service_role;
ALTER TABLE public.order_admin_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage order admin notes" ON public.order_admin_notes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));