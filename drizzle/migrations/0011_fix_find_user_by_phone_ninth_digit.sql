CREATE OR REPLACE FUNCTION public.find_user_by_phone(_digits text)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH norm AS (
    SELECT CASE WHEN length(d) >= 12 AND left(d,2)='55' THEN substr(d,3) ELSE d END AS n
    FROM (SELECT regexp_replace(coalesce(_digits,''),'\D','','g') AS d) s
  ),
  target AS (SELECT left(n,2) AS ddd, right(n,8) AS tail, length(n) AS len FROM norm),
  cand AS (
    SELECT p.user_id, p.updated_at, u.email,
      CASE WHEN length(x)>=12 AND left(x,2)='55' THEN substr(x,3) ELSE x END AS n
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.user_id,
    LATERAL unnest(ARRAY[
      regexp_replace(coalesce(p.phone,''),'\D','','g'),
      regexp_replace(coalesce(p.whatsapp,''),'\D','','g')]) AS x
    WHERE x <> ''
  )
  SELECT c.user_id FROM cand c, target t
  WHERE t.len >= 10 AND length(c.n) >= 10
    AND left(c.n,2) = t.ddd AND right(c.n,8) = t.tail
  ORDER BY (c.email NOT LIKE '%@whatsapp.seviicolecionaveis.com.br') DESC, c.updated_at DESC
  LIMIT 1
$function$;

UPDATE public.orders SET user_id='f32c7d67-c195-4e0a-92c3-c7a973c6e41e'
WHERE user_id='f8c5338d-cc64-441e-993d-e387df3e2948';