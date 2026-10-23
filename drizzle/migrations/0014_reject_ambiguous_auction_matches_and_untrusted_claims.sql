CREATE OR REPLACE FUNCTION public.find_user_by_phone(_digits text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE real_ids uuid[]; shadow_ids uuid[];
BEGIN
 SELECT array_agg(DISTINCT p.user_id) FILTER (WHERE u.email NOT ILIKE '%@whatsapp.seviicolecionaveis.com.br'), array_agg(DISTINCT p.user_id) FILTER (WHERE u.email ILIKE '%@whatsapp.seviicolecionaveis.com.br') INTO real_ids,shadow_ids
 FROM public.profiles p JOIN auth.users u ON u.id=p.user_id
 WHERE public.normalize_br_phone(_digits) IS NOT NULL AND (public.normalize_br_phone(p.phone)=public.normalize_br_phone(_digits) OR public.normalize_br_phone(p.whatsapp)=public.normalize_br_phone(_digits));
 IF coalesce(array_length(real_ids,1),0)>1 THEN RAISE EXCEPTION 'Mais de uma conta usa este WhatsApp. A loja precisa confirmar a identidade antes de vincular o pedido.'; END IF;
 IF coalesce(array_length(real_ids,1),0)=1 THEN RETURN real_ids[1]; END IF;
 IF coalesce(array_length(shadow_ids,1),0)>1 THEN RAISE EXCEPTION 'Mais de um cadastro usa este WhatsApp. Confirme o vínculo com a loja.'; END IF;
 RETURN shadow_ids[1];
END;
$$;
REVOKE ALL ON FUNCTION public.find_user_by_phone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_by_phone(text) TO service_role;
CREATE OR REPLACE FUNCTION public.merge_whatsapp_accounts_into(_real uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE moved integer := 0;
BEGIN
 IF _real IS NULL OR coalesce(auth.role(),'') <> 'service_role' THEN RETURN 0; END IF;
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
COMMENT ON FUNCTION public.merge_whatsapp_accounts_into(uuid) IS 'Only trusted bot/service calls may transfer ownership; customer-editable phone fields and sign-in claims cannot reassign orders.';