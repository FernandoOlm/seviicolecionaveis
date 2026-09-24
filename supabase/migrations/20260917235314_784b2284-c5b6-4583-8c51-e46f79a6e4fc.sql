ALTER TABLE public.site_popups ADD COLUMN IF NOT EXISTS popup_key text;
CREATE UNIQUE INDEX IF NOT EXISTS site_popups_popup_key_key ON public.site_popups (popup_key) WHERE popup_key IS NOT NULL;
UPDATE public.site_popups SET popup_key = 'event-mode' WHERE title = 'Estamos em evento' AND popup_key IS NULL;