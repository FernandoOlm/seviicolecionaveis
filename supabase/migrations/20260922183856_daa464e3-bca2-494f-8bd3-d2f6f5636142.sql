CREATE OR REPLACE FUNCTION public.find_user_by_phone(_digits text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    SELECT CASE
      WHEN length(d) >= 12 AND left(d, 2) = '55' THEN substr(d, 3)
      ELSE d
    END AS n
    FROM (SELECT regexp_replace(coalesce(_digits, ''), '\D', '', 'g') AS d) s
  ),
  cand AS (
    SELECT p.user_id, p.updated_at,
      CASE WHEN length(x) >= 12 AND left(x, 2) = '55' THEN substr(x, 3) ELSE x END AS n
    FROM public.profiles p,
      LATERAL unnest(ARRAY[
        regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'),
        regexp_replace(coalesce(p.whatsapp, ''), '\D', '', 'g')
      ]) AS x
    WHERE x <> ''
  )
  SELECT c.user_id
  FROM cand c, target t
  WHERE length(t.n) >= 10 AND c.n = t.n
  ORDER BY c.updated_at DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.find_user_by_phone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_by_phone(text) TO service_role;