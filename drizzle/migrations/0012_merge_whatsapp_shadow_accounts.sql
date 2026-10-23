CREATE OR REPLACE FUNCTION public.merge_whatsapp_accounts_into(_real uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  sid uuid; moved integer := 0; n integer; real_stack uuid; sh_stack record;
BEGIN
  IF _real IS NULL THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id=_real AND email ILIKE '%@whatsapp.seviicolecionaveis.com.br') THEN RETURN 0; END IF;
  FOR sid IN
    WITH mine AS (
      SELECT CASE WHEN length(x)>=12 AND left(x,2)='55' THEN substr(x,3) ELSE x END AS n
      FROM public.profiles p, LATERAL unnest(ARRAY[
        regexp_replace(coalesce(p.phone,''),'\D','','g'),
        regexp_replace(coalesce(p.whatsapp,''),'\D','','g')]) x
      WHERE p.user_id=_real AND length(x)>=10
    )
    SELECT DISTINCT u.id FROM auth.users u, mine m,
      LATERAL (SELECT regexp_replace(split_part(u.email,'@',1),'\D','','g') d) s
    WHERE u.email ILIKE '%@whatsapp.seviicolecionaveis.com.br' AND u.id<>_real
      AND length(s.d)>=12 AND left(s.d,2)='55'
      AND substr(s.d,3,2)=left(m.n,2) AND right(s.d,8)=right(m.n,8)
  LOOP
    UPDATE public.orders SET user_id=_real WHERE user_id=sid;
    GET DIAGNOSTICS n = ROW_COUNT; moved := moved + n;
    UPDATE public.loyalty_points_ledger SET user_id=_real WHERE user_id=sid AND reason<>'signup';
    UPDATE public.service_orders SET user_id=_real WHERE user_id=sid;
    FOR sh_stack IN SELECT id FROM public.card_stacks WHERE user_id=sid LOOP
      SELECT id INTO real_stack FROM public.card_stacks WHERE user_id=_real AND status='active' ORDER BY created_at DESC LIMIT 1;
      IF real_stack IS NULL THEN
        UPDATE public.card_stacks SET user_id=_real WHERE id=sh_stack.id;
        UPDATE public.card_stack_items SET user_id=_real WHERE stack_id=sh_stack.id;
      ELSE
        UPDATE public.card_stack_items SET user_id=_real, stack_id=real_stack WHERE stack_id=sh_stack.id;
        UPDATE public.card_stacks SET status='completed' WHERE id=sh_stack.id;
      END IF;
    END LOOP;
    UPDATE public.card_stack_items SET user_id=_real WHERE user_id=sid;
  END LOOP;
  RETURN moved;
END $$;

REVOKE ALL ON FUNCTION public.merge_whatsapp_accounts_into(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_my_whatsapp_orders()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.merge_whatsapp_accounts_into(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.claim_my_whatsapp_orders() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_my_whatsapp_orders() TO authenticated;

CREATE OR REPLACE FUNCTION public.profiles_merge_whatsapp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  BEGIN
    PERFORM public.merge_whatsapp_accounts_into(NEW.user_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_merge_whatsapp ON public.profiles;
CREATE TRIGGER trg_profiles_merge_whatsapp
AFTER INSERT OR UPDATE OF phone, whatsapp ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_merge_whatsapp();