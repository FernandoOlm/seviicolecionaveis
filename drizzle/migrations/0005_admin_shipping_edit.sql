ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_edited_by_admin_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_edit_history jsonb NOT NULL DEFAULT '[]'::jsonb;