ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS schedule_kind text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS hand_delivery_fee_status text;