-- Master bypass for organizer access-state checks.
CREATE OR REPLACE FUNCTION public.get_tournament_access_state(tournament_id uuid)
RETURNS TABLE (
  has_full_access boolean,
  is_free_small_tournament boolean,
  players_count integer,
  preview_main_limit integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_players_count integer := 0;
  v_has_active_entitlement boolean := false;
  v_is_master boolean := false;
BEGIN
  SELECT COUNT(*)::integer
  INTO v_players_count
  FROM public.players p
  WHERE p.tournament_id = get_tournament_access_state.tournament_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_entitlements te
    WHERE te.tournament_id = get_tournament_access_state.tournament_id
      AND now() >= te.starts_at
      AND now() < te.ends_at
  )
  INTO v_has_active_entitlement;

  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'master'::public.app_role) THEN
    v_is_master := true;
  END IF;

  is_free_small_tournament := (v_players_count BETWEEN 1 AND 100);
  has_full_access := is_free_small_tournament OR v_has_active_entitlement;

  IF v_is_master THEN
    has_full_access := true;
    is_free_small_tournament := false;
    preview_main_limit := NULL;
  ELSE
    preview_main_limit := CASE WHEN has_full_access THEN NULL ELSE 8 END;
  END IF;

  players_count := v_players_count;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tournament_access_state(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tournament_access_state(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tournament_access_state(uuid) TO authenticated, service_role;
