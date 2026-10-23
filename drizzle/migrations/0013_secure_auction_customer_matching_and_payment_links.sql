CREATE OR REPLACE FUNCTION public.normalize_br_phone(_raw text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 WITH digits AS (SELECT regexp_replace(coalesce(_raw,''),'[^0-9]','','g') AS d), national AS (SELECT CASE WHEN length(d) IN (12,13) AND left(d,2)='55' THEN substr(d,3) ELSE d END AS n FROM digits)
 SELECT CASE WHEN n ~ '^[1-9][0-9][0-9]{8}$' THEN n WHEN n ~ '^[1-9][0-9]9[0-9]{8}$' THEN left(n,2)||right(n,8) ELSE NULL END FROM national;
$$;
REVOKE ALL ON FUNCTION public.normalize_br_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_br_phone(text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.find_user_by_phone(_digits text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH candidates AS (
 SELECT DISTINCT p.user_id, (u.email ILIKE '%@whatsapp.seviicolecionaveis.com.br') AS shadow
 FROM public.profiles p JOIN auth.users u ON u.id=p.user_id
 WHERE public.normalize_br_phone(_digits) IS NOT NULL
 AND (public.normalize_br_phone(p.phone)=public.normalize_br_phone(_digits) OR public.normalize_br_phone(p.whatsapp)=public.normalize_br_phone(_digits))
 ), real AS (SELECT user_id FROM candidates WHERE NOT shadow), placeholder AS (SELECT user_id FROM candidates WHERE shadow)
 SELECT CASE WHEN (SELECT count(*) FROM real)=1 THEN (SELECT user_id FROM real LIMIT 1)
 WHEN (SELECT count(*) FROM real)=0 AND (SELECT count(*) FROM placeholder)=1 THEN (SELECT user_id FROM placeholder LIMIT 1) ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.find_user_by_phone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_by_phone(text) TO service_role;
CREATE OR REPLACE FUNCTION public.merge_whatsapp_accounts_into(_real uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE moved integer := 0;
BEGIN
 IF _real IS NULL THEN RETURN 0; END IF;
 IF coalesce(auth.role(),'') <> 'service_role' AND auth.uid() IS DISTINCT FROM _real THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=_real AND email NOT ILIKE '%@whatsapp.seviicolecionaveis.com.br') THEN RETURN 0; END IF;
 UPDATE public.orders o SET user_id=_real, email=u.email, recipient_name=coalesce(nullif(trim(p.full_name),''),o.recipient_name)
 FROM auth.users u JOIN public.profiles p ON p.user_id=u.id
 WHERE u.id=_real AND o.origin='auction' AND o.status='pending' AND o.payment_paid_at IS NULL AND NOT o.stock_decremented
 AND o.user_id<>_real AND EXISTS (SELECT 1 FROM auth.users sh WHERE sh.id=o.user_id AND sh.email ILIKE '%@whatsapp.seviicolecionaveis.com.br')
 AND public.find_user_by_phone(o.phone)=_real;
 GET DIAGNOSTICS moved = ROW_COUNT;
 RETURN moved;
END;
$$;
REVOKE ALL ON FUNCTION public.merge_whatsapp_accounts_into(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_whatsapp_accounts_into(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_my_whatsapp_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_my_whatsapp_orders() TO authenticated;
CREATE TABLE public.auction_payment_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.orders(id),
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.auction_payment_links TO service_role;
ALTER TABLE public.auction_payment_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX auction_payment_links_order_idx ON public.auction_payment_links(order_id);
COMMENT ON TABLE public.auction_payment_links IS 'Order-scoped payment capabilities: only SHA-256 hashes persist; no personal data or account login access.';