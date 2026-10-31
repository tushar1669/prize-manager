-- DRAFT ONLY. Unapplied / uncalled. No deployment or SQL execution authorized.
-- Transactional replacement candidate for legacy finalize; NOT a v2 tie writer.
-- Precondition: review/verify on isolated DB, reroute existing legacy writer,
-- and fence legacy resolve_team_tie before any release. No source caller exists.
CREATE FUNCTION public.commit_finalize_version_atomic(
  p_tournament_id uuid, p_expected_version integer, p_actor_id uuid,
  p_individual_rows jsonb, p_team_rows jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $atomic$
DECLARE
  v_owner uuid;
  v_latest integer;
  v_new integer;
  v_written integer;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'finalize_atomic_service_required';
  END IF;
  IF p_tournament_id IS NULL OR p_actor_id IS NULL OR
     p_expected_version IS NULL OR p_expected_version < 0 OR
     p_expected_version = 2147483647 OR
     jsonb_typeof(p_individual_rows) IS DISTINCT FROM 'array' OR
     jsonb_typeof(p_team_rows) IS DISTINCT FROM 'array' OR
     jsonb_array_length(p_individual_rows) = 0 THEN
    RAISE EXCEPTION 'finalize_atomic_invalid_request';
  END IF;

  -- Same tournament row lock as commit_team_v2_adjudicated_version.
  -- All reads/writes below occur in one invocation transaction.
  SELECT owner_id INTO v_owner FROM public.tournaments
    WHERE id = p_tournament_id FOR UPDATE;
  IF v_owner IS NULL OR NOT (
    v_owner = p_actor_id OR public.has_role(p_actor_id, 'master'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'finalize_atomic_unauthorized';
  END IF;
  -- The separate v2 adjudicated writer must handle configured v2 groups.
  IF EXISTS (SELECT 1 FROM public.institution_prize_groups
    WHERE tournament_id = p_tournament_id AND is_active = true
      AND ranking_rules IS NOT NULL) THEN
    RAISE EXCEPTION 'finalize_atomic_v2_requires_adjudication';
  END IF;

  SELECT GREATEST(
    COALESCE((SELECT MAX(version) FROM public.allocations
      WHERE tournament_id = p_tournament_id), 0),
    COALESCE((SELECT MAX(version) FROM public.team_allocations
      WHERE tournament_id = p_tournament_id), 0)
  ) INTO v_latest;
  IF v_latest <> p_expected_version THEN
    RAISE EXCEPTION 'finalize_atomic_stale_version';
  END IF;
  v_new := v_latest + 1;

  -- This checks identity/ownership, NOT the correctness or completeness of
  -- individually allocated prizes: only a separate server engine can do so.
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_individual_rows)
       AS j(prize_id uuid, player_id uuid)
     LEFT JOIN public.prizes p ON p.id = j.prize_id
     LEFT JOIN public.categories c ON c.id = p.category_id
     LEFT JOIN public.players pl ON pl.id = j.player_id
     WHERE j.prize_id IS NULL OR j.player_id IS NULL OR
       c.tournament_id IS DISTINCT FROM p_tournament_id OR
       c.is_active IS DISTINCT FROM true OR
       p.is_active IS DISTINCT FROM true OR
       pl.tournament_id IS DISTINCT FROM p_tournament_id)
     OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_individual_rows)
       AS j(prize_id uuid) GROUP BY j.prize_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'finalize_atomic_invalid_individuals';
  END IF;

  -- Supplied team rows are server preview data, NOT browser awards.
  -- Completeness and source/ranking/slot evidence still require independent
  -- server proof, plus database integration tests before any caller is wired.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_team_rows)
      AS j(group_id uuid, prize_id uuid, place integer,
           institution_key text, total_points numeric,
           player_ids uuid[], player_snapshot jsonb, ranking_snapshot jsonb)
    LEFT JOIN public.institution_prize_groups g ON g.id = j.group_id
    LEFT JOIN public.institution_prizes p ON p.id = j.prize_id
    WHERE j.group_id IS NULL OR j.prize_id IS NULL OR
      j.place IS NULL OR j.place < 1 OR j.total_points IS NULL OR
      NULLIF(btrim(j.institution_key),'') IS NULL OR
      g.tournament_id IS DISTINCT FROM p_tournament_id OR
      g.is_active IS DISTINCT FROM true OR g.ranking_rules IS NOT NULL OR
      p.group_id IS DISTINCT FROM g.id OR p.is_active IS DISTINCT FROM true OR
      p.place IS DISTINCT FROM j.place OR
      g.group_by NOT IN ('team','club','city','state','group_label','type_label') OR
      cardinality(j.player_ids) IS DISTINCT FROM g.team_size OR
      (SELECT count(DISTINCT chosen.id)
        FROM unnest(j.player_ids) AS chosen(id)) IS DISTINCT FROM g.team_size OR
      jsonb_typeof(j.player_snapshot) IS DISTINCT FROM 'array' OR
      jsonb_array_length(j.player_snapshot) IS DISTINCT FROM g.team_size OR
      (SELECT count(DISTINCT snap.value ->> 'player_id')
        FROM jsonb_array_elements(j.player_snapshot) AS snap(value))
        IS DISTINCT FROM g.team_size OR
      EXISTS (
        SELECT 1 FROM unnest(j.player_ids) AS chosen(id)
        LEFT JOIN public.players pl ON pl.id = chosen.id
        WHERE pl.tournament_id IS DISTINCT FROM p_tournament_id OR
          pl.points IS NULL OR
          btrim(CASE g.group_by
            WHEN 'team' THEN pl.team WHEN 'club' THEN pl.club
            WHEN 'city' THEN pl.city WHEN 'state' THEN pl.state
            WHEN 'group_label' THEN pl.group_label
            WHEN 'type_label' THEN pl.type_label
          END) IS DISTINCT FROM j.institution_key OR
          NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(j.player_snapshot) AS snap(value)
            WHERE snap.value ->> 'player_id' = chosen.id::text
              AND (snap.value ->> 'points')::numeric IS NOT DISTINCT FROM pl.points
          )
      ) OR
      j.total_points IS DISTINCT FROM (
        SELECT SUM(pl.points) FROM public.players pl WHERE pl.id = ANY(j.player_ids)
      ) OR
      jsonb_typeof(j.ranking_snapshot) IS DISTINCT FROM 'object' OR
      j.ranking_snapshot ->> 'schema_version' IS DISTINCT FROM '2' OR
      j.ranking_snapshot ->> 'group_id' IS DISTINCT FROM j.group_id::text OR
      j.ranking_snapshot ->> 'winner_key' IS DISTINCT FROM j.institution_key OR
      j.ranking_snapshot -> 'declared_rules' IS DISTINCT FROM 'null'::jsonb OR
      j.ranking_snapshot ->> 'allocation_version' IS DISTINCT FROM v_new::text OR
      j.ranking_snapshot ->> 'finalized_by' IS DISTINCT FROM p_actor_id::text OR
      j.ranking_snapshot -> 'group_rule' IS DISTINCT FROM jsonb_build_object(
        'group_by', g.group_by, 'team_size', g.team_size,
        'female_slots', g.female_slots, 'male_slots', g.male_slots,
        'scoring_mode', g.scoring_mode
      ) OR
      j.ranking_snapshot -> 'award' IS DISTINCT FROM jsonb_build_object(
        'id', p.id, 'place', p.place, 'cash_amount', p.cash_amount,
        'has_trophy', p.has_trophy, 'has_medal', p.has_medal
      )
  ) OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_team_rows)
      AS j(prize_id uuid) GROUP BY j.prize_id HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_team_rows)
      AS j(group_id uuid, place integer)
      GROUP BY j.group_id, j.place HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'finalize_atomic_invalid_teams';
  END IF;

  INSERT INTO public.allocations (
    tournament_id, version, prize_id, player_id, reason_codes,
    is_manual, decided_by, decided_at
  ) SELECT p_tournament_id, v_new, j.prize_id, j.player_id,
    COALESCE(j.reason_codes, ARRAY[]::text[]),
    COALESCE(j.is_manual, false), p_actor_id, now()
  FROM jsonb_to_recordset(p_individual_rows)
    AS j(prize_id uuid, player_id uuid, reason_codes text[], is_manual boolean);
  GET DIAGNOSTICS v_written = ROW_COUNT;
  IF v_written <> jsonb_array_length(p_individual_rows) THEN
    RAISE EXCEPTION 'finalize_atomic_individual_write_incomplete';
  END IF;

  INSERT INTO public.team_allocations (
    tournament_id, version, group_id, prize_id, place, institution_key,
    total_points, player_ids, player_snapshot, ranking_snapshot
  ) SELECT p_tournament_id, v_new, j.group_id, j.prize_id, j.place,
    j.institution_key, j.total_points, j.player_ids, j.player_snapshot,
    j.ranking_snapshot
  FROM jsonb_to_recordset(p_team_rows)
    AS j(group_id uuid, prize_id uuid, place integer, institution_key text,
         total_points numeric, player_ids uuid[], player_snapshot jsonb,
         ranking_snapshot jsonb);
  GET DIAGNOSTICS v_written = ROW_COUNT;
  IF v_written <> jsonb_array_length(p_team_rows) THEN
    RAISE EXCEPTION 'finalize_atomic_team_write_incomplete';
  END IF;

  -- One transaction, including legacy status/conflict changes. Published
  -- status and all publications.allocation_version pins remain unchanged.
  UPDATE public.tournaments SET updated_at = now(),
    status = CASE WHEN is_published OR status = 'published'
      THEN status ELSE 'finalized' END
    WHERE id = p_tournament_id;
  UPDATE public.conflicts SET status = 'resolved'
    WHERE tournament_id = p_tournament_id AND status = 'open';
  RETURN v_new;
END;
$atomic$;

REVOKE EXECUTE ON FUNCTION public.commit_finalize_version_atomic(
  uuid, integer, uuid, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_finalize_version_atomic(
  uuid, integer, uuid, jsonb, jsonb
) TO service_role;
