ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'site',
  ADD COLUMN IF NOT EXISTS auction_id uuid REFERENCES public.auctions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_auction_id ON public.orders(auction_id);
CREATE INDEX IF NOT EXISTS idx_orders_origin ON public.orders(origin);