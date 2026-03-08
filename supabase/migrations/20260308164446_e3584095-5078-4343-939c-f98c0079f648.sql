CREATE OR REPLACE FUNCTION public.resolve_team_tie(
  p_tournament_id uuid,
  p_version integer,
  p_group_id uuid,
  p_affected_places integer[],
  p_rows jsonb,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  SELECT owner_id INTO v_owner
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  IF v_uid IS DISTINCT FROM v_owner
     AND NOT public.has_role(v_uid, 'master'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF p_affected_places IS NULL OR array_length(p_affected_places, 1) IS NULL THEN
    RAISE EXCEPTION 'affected_places must be non-empty';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'rows must be a non-empty JSON array';
  END IF;

  DELETE FROM public.team_allocations
  WHERE tournament_id = p_tournament_id
    AND version = p_version
    AND group_id = p_group_id
    AND place = ANY(p_affected_places);

  INSERT INTO public.team_allocations (
    tournament_id, version, group_id, prize_id,
    place, institution_key, total_points, player_ids, player_snapshot
  )
  SELECT
    p_tournament_id,
    p_version,
    p_group_id,
    (r->>'prize_id')::uuid,
    (r->>'place')::integer,
    r->>'institution_key',
    (r->>'total_points')::numeric,
    ARRAY(SELECT jsonb_array_elements_text(r->'player_ids'))::uuid[],
    r->'player_snapshot'
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.team_allocation_notes (
    tournament_id, version, group_id, note, created_by
  ) VALUES (
    p_tournament_id, p_version, p_group_id, p_note, v_uid
  )
  ON CONFLICT (tournament_id, version, group_id)
  DO UPDATE SET note = EXCLUDED.note, created_by = EXCLUDED.created_by;

  RETURN jsonb_build_object('ok', true, 'rows_inserted', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_team_tie(uuid, integer, uuid, integer[], jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_team_tie(uuid, integer, uuid, integer[], jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_team_tie(uuid, integer, uuid, integer[], jsonb, text) TO service_role;