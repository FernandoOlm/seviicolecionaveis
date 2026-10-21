ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reschedule_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS schedule_reopened_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS schedule_history jsonb NOT NULL DEFAULT '[]'::jsonb;