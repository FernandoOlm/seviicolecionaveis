GRANT SELECT, INSERT, UPDATE, DELETE ON public.auctions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auction_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auction_bids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auction_schedules TO authenticated;
GRANT ALL ON public.auctions TO service_role;
GRANT ALL ON public.auction_items TO service_role;
GRANT ALL ON public.auction_bids TO service_role;
GRANT ALL ON public.auction_schedules TO service_role;