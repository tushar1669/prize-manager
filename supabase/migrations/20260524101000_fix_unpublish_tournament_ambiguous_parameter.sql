-- Production-synced corrective migration: avoid PL/pgSQL parameter/column ambiguity.
CREATE OR REPLACE FUNCTION public.unpublish_tournament(_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_master boolean := public.has_role(v_uid, 'master'::public.app_role);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM 1
  FROM public.tournaments t
  WHERE t.id = _tournament_id
    AND (t.owner_id = v_uid OR v_is_master)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.publications
     SET is_active = false
   WHERE tournament_id = _tournament_id
     AND is_active = true;

  UPDATE public.tournaments
     SET is_published = false,
         status = 'draft'
   WHERE id = _tournament_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unpublish_tournament(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unpublish_tournament(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.unpublish_tournament(uuid) TO authenticated;
