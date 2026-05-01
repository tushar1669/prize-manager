CREATE OR REPLACE FUNCTION public.archive_own_draft_tournament(_tournament_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_master boolean := false;
  v_updated integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_is_master := public.is_master();

  UPDATE public.tournaments t
  SET
    is_archived = true,
    deleted_at = now(),
    is_published = false
  WHERE t.id = _tournament_id
    AND t.status = 'draft'
    AND t.is_archived = false
    AND t.deleted_at IS NULL
    AND t.is_published = false
    AND (t.owner_id = v_uid OR v_is_master);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_own_draft_tournament(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_own_draft_tournament(uuid) TO authenticated;
