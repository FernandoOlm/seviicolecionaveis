ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS event_added_manually_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS event_added_by uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS event_previous jsonb;