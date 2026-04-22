-- Atomic unpublish RPC: keep tournaments/publications publish state in sync in one transaction.
DROP FUNCTION IF EXISTS public.unpublish_tournament(uuid);

CREATE OR REPLACE FUNCTION public.unpublish_tournament(tournament_id uuid)
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
  WHERE t.id = tournament_id
    AND (t.owner_id = v_uid OR v_is_master)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.publications
     SET is_active = false
   WHERE tournament_id = unpublish_tournament.tournament_id
     AND is_active = true;

  UPDATE public.tournaments
     SET is_published = false,
         status = 'draft'
   WHERE id = unpublish_tournament.tournament_id;
END;
$$;
