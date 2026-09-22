ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS max_uses_per_user integer;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_max_uses_per_user_positive CHECK (max_uses_per_user IS NULL OR max_uses_per_user >= 1);
UPDATE public.coupons SET max_uses_per_user = 1 WHERE upper(code) = 'SEVII5';