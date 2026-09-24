CREATE OR REPLACE FUNCTION public.apply_recognized_stock(_items jsonb, _reason text DEFAULT 'Reconhecimento por foto')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  it jsonb;
  cid uuid;
  qty integer;
  applied integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM set_config('app.stock_change_reason', COALESCE(NULLIF(_reason, ''), 'Reconhecimento por foto'), true);

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    cid := (it->>'card_id')::uuid;
    qty := GREATEST(COALESCE((it->>'quantity')::int, 0), 0);
    IF qty = 0 THEN CONTINUE; END IF;

    UPDATE public.cards SET stock = stock + qty WHERE id = cid;
    IF FOUND THEN applied := applied + qty; END IF;
  END LOOP;

  PERFORM set_config('app.stock_change_reason', '', true);
  RETURN applied;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_recognized_stock(jsonb, text) TO authenticated;