CREATE TABLE IF NOT EXISTS public.auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_number SERIAL,
  title TEXT NOT NULL,
  description TEXT,
  group_jid TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
  scheduled_end TIMESTAMP WITH TIME ZONE NOT NULL,
  closing_message TEXT DEFAULT 'Os links de pagamento foram enviados no privado!',
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auctions TO authenticated;
GRANT ALL ON public.auctions TO service_role;
ALTER TABLE public.auctions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam leiloes" ON public.auctions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER auctions_updated_at BEFORE UPDATE ON public.auctions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.auction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  sequence INT NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  starting_price NUMERIC(10,2) NOT NULL DEFAULT 1.00,
  bid_increment NUMERIC(10,2) NOT NULL DEFAULT 1.00,
  buyout_price NUMERIC(10,2),
  quantity INT NOT NULL DEFAULT 1,
  winner_phone TEXT,
  winner_name TEXT,
  final_bid NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auction_items TO authenticated;
GRANT ALL ON public.auction_items TO service_role;
ALTER TABLE public.auction_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam lotes" ON public.auction_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS auction_items_auction_idx ON public.auction_items(auction_id, sequence);

CREATE TABLE IF NOT EXISTS public.auction_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
  group_jid TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auction_schedules TO authenticated;
GRANT ALL ON public.auction_schedules TO service_role;
ALTER TABLE public.auction_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam agendamentos de leilao" ON public.auction_schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS auction_schedules_pending_idx ON public.auction_schedules(status, scheduled_time);
CREATE TRIGGER auction_schedules_updated_at BEFORE UPDATE ON public.auction_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.auction_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.auction_items(id) ON DELETE SET NULL,
  sequence INT NOT NULL DEFAULT 1,
  item_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  bidder_name TEXT,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  order_id UUID,
  announced BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auction_bids TO authenticated;
GRANT ALL ON public.auction_bids TO service_role;
ALTER TABLE public.auction_bids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam lances" ON public.auction_bids FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS auction_bids_auction_idx ON public.auction_bids(auction_id, status);

ALTER PUBLICATION supabase_realtime ADD TABLE public.auctions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.auction_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.auction_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.auction_bids;