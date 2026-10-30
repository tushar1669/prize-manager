-- Private deterministic fingerprint of all scorer-read tournament data.
-- Whole-row projections include active/inactive flags, source ranking tags,
-- gift/rule metadata and the MVCC row-creation xid (xmin).
-- xmin detects an update followed by a reversion of the visible row bytes,
-- but NOT a temporary insert+delete: a durable mutation journal would be
-- needed for a full no-ABA guarantee. No source data leaves this function.
CREATE FUNCTION public.team_v2_source_fingerprint(p_tournament_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $source$
 SELECT encode(sha256(convert_to(
   jsonb_build_array(
      (SELECT COALESCE(jsonb_agg((to_jsonb(t) || jsonb_build_object('_mvcc_xmin', t.xmin::text)) ORDER BY t.id), '[]'::jsonb)
       FROM public.tournaments t WHERE t.id = p_tournament_id),
      (SELECT COALESCE(jsonb_agg((to_jsonb(t) || jsonb_build_object('_mvcc_xmin', t.xmin::text)) ORDER BY t.id), '[]'::jsonb)
       FROM public.categories t WHERE t.tournament_id = p_tournament_id),
      (SELECT COALESCE(jsonb_agg((to_jsonb(t) || jsonb_build_object('_mvcc_xmin', t.xmin::text)) ORDER BY t.id), '[]'::jsonb)
       FROM public.prizes t WHERE t.category_id IN (SELECT c.id FROM public.categories c WHERE c.tournament_id = p_tournament_id)),
      (SELECT COALESCE(jsonb_agg((to_jsonb(t) || jsonb_build_object('_mvcc_xmin', t.xmin::text)) ORDER BY t.id), '[]'::jsonb)
       FROM public.players t WHERE t.tournament_id = p_tournament_id),
      (SELECT COALESCE(jsonb_agg((to_jsonb(t) || jsonb_build_object('_mvcc_xmin', t.xmin::text)) ORDER BY t.tournament_id), '[]'::jsonb)
       FROM public.rule_config t WHERE t.tournament_id = p_tournament_id),
      (SELECT COALESCE(jsonb_agg((to_jsonb(t) || jsonb_build_object('_mvcc_xmin', t.xmin::text)) ORDER BY t.id), '[]'::jsonb)
       FROM public.institution_prize_groups t WHERE t.tournament_id = p_tournament_id),
      (SELECT COALESCE(jsonb_agg((to_jsonb(t) || jsonb_build_object('_mvcc_xmin', t.xmin::text)) ORDER BY t.id), '[]'::jsonb)
       FROM public.institution_prizes t WHERE t.group_id IN (SELECT g.id FROM public.institution_prize_groups g WHERE g.tournament_id = p_tournament_id))
   )::text, 'UTF8')), 'hex');
$source$;
REVOKE EXECUTE ON FUNCTION public.team_v2_source_fingerprint(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.team_v2_source_fingerprint(uuid)
  TO service_role;

-- DRAFT ONLY — Team Ranking v2 adjudicated allocation version.
-- Prerequisite: 20261025193000_team_tiebreak_v2_additive.sql (ranking_snapshot).
-- Never deploy this migration before protected finalize routing, legacy-RPC
-- fencing, isolated integration/rollback evidence and owner release approval.
--
-- PostgREST function calls are a single PostgreSQL statement/transaction.
-- Any RAISE EXCEPTION reverts all individual/team inserts together.
-- This RPC is ONLY for a server-owned, JWT-authenticated and re-scored caller
-- using the service role; a browser may NEVER submit the row arrays.
--
-- This procedure does not prove regulations/arbiter authenticity; the server
-- must call validateTeamRulingV2 against freshly computed partitions before
-- submitting the corresponding ruling and exact computed award payload.
-- Do not route calls here until that server gate has been implemented.
CREATE FUNCTION public.commit_team_v2_adjudicated_version(
  p_tournament_id uuid,
  p_expected_version integer,
  p_actor_id uuid,
  p_individual_rows jsonb,
  p_team_rows jsonb,
  p_rulings jsonb,
  p_expected_source_fingerprint text
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_owner uuid;
  v_canary_enabled boolean;
  v_latest integer;
  v_new integer;
  v_ruling jsonb;
  v_award jsonb;
  v_inserted integer;
BEGIN
  -- Defense in depth: only the private service-role Edge caller can commit.
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'team_v2_service_role_required';
  END IF;
  IF p_actor_id IS NULL OR p_tournament_id IS NULL OR
     p_expected_version IS NULL OR p_expected_version < 0 OR
     p_expected_version >= 2147483647 OR
     p_expected_source_fingerprint IS NULL OR
     p_expected_source_fingerprint !~ '^[0-9a-f]{64}$' OR
     jsonb_typeof(p_team_rows) IS DISTINCT FROM 'array' OR
     -- An uncontested, fully resolved rank has no official tie ruling.
     -- Nonempty entries are individually validated below, and no award may
     -- reference an unsubmitted ruling.
     jsonb_typeof(p_rulings) IS DISTINCT FROM 'array' OR
     jsonb_typeof(p_individual_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'team_v2_invalid_request';
  END IF;

  -- Cheap permission preflight before taking globally contended table locks.
  -- Re-check the owner under the row lock below (ownership may change).
  SELECT owner_id INTO v_owner
  FROM public.tournaments WHERE id = p_tournament_id;
  IF v_owner IS NULL OR NOT (
    v_owner = p_actor_id OR public.has_role(p_actor_id, 'master'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'team_v2_forbidden';
  END IF;

  -- Tournament-specific serialization only. Six scorer-input table
  -- AFTER-row triggers update this same tournament row for an ENABLED canary.
  -- Never acquire table-wide SHARE locks that stall unrelated organizers.
  -- A source change during the two HTTP scorer reads invalidates the digest;
  -- a pending source change cannot commit between this row lock and Save.
  SELECT owner_id INTO v_owner
  FROM public.tournaments WHERE id = p_tournament_id
  FOR UPDATE;
  IF v_owner IS NULL OR NOT (
    v_owner = p_actor_id OR public.has_role(p_actor_id, 'master'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'team_v2_forbidden';
  END IF;
  -- Lock the allowlist entry until commit: deactivation cannot race an award.
  SELECT enabled INTO v_canary_enabled
    FROM public.team_v2_canary_tournaments
    WHERE tournament_id = p_tournament_id FOR SHARE;
  IF v_canary_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'team_v2_canary_disabled';
  END IF;

  SELECT GREATEST(
    COALESCE((SELECT MAX(version) FROM public.allocations
      WHERE tournament_id = p_tournament_id), 0),
    COALESCE((SELECT MAX(version) FROM public.team_allocations
      WHERE tournament_id = p_tournament_id), 0)
  ) INTO v_latest;
  IF v_latest <> p_expected_version THEN
    RAISE EXCEPTION 'team_v2_stale_allocation_version';
  END IF;
  IF public.team_v2_source_fingerprint(p_tournament_id)
       IS DISTINCT FROM p_expected_source_fingerprint THEN
    RAISE EXCEPTION 'team_v2_source_changed';
  END IF;
  -- Only this reviewed atomic RPC may write v2 allocation rows. The
  -- transaction-local marker is checked by both allocation-table triggers;
  -- the old finalize/tie writers never set it and remain rejected.
  PERFORM pg_catalog.set_config('prize_manager.team_v2_atomic_writer', '1', true);
  v_new := v_latest + 1;

  -- First ever finalized version: use the individual winners independently
  -- reviewed by the existing authorized individual engine. Do not invent a
  -- previous version to clone. The Edge caller validates the individual
  -- preview before invoking this RPC.
  IF v_latest = 0 THEN
    -- Explicit NULL-player rows represent trusted, genuinely unfilled prizes.
    -- They satisfy prize-inventory coverage but are NEVER allocated a player.
    -- At least one genuine individual winner is required for initial Save.
    IF jsonb_array_length(p_individual_rows) = 0 OR
       NOT EXISTS (
         SELECT 1 FROM jsonb_to_recordset(p_individual_rows)
           AS j(player_id uuid) WHERE j.player_id IS NOT NULL
       ) OR EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_individual_rows)
        AS j(prize_id uuid, player_id uuid, reason_codes text[], is_manual boolean)
      LEFT JOIN public.prizes pz ON pz.id = j.prize_id
      LEFT JOIN public.categories cat ON cat.id = pz.category_id
      LEFT JOIN public.players pl ON pl.id = j.player_id
      WHERE j.prize_id IS NULL OR
        cat.tournament_id IS DISTINCT FROM p_tournament_id OR
        cat.is_active IS DISTINCT FROM true OR
        pz.is_active IS DISTINCT FROM true OR
        (j.player_id IS NOT NULL AND pl.tournament_id IS DISTINCT FROM p_tournament_id) OR
        (j.player_id IS NULL AND (
          j.is_manual IS DISTINCT FROM false OR
          j.reason_codes IS NULL OR cardinality(j.reason_codes) = 0
        ))
    ) THEN
      RAISE EXCEPTION 'team_v2_invalid_initial_individuals';
    END IF;
    -- Prevent duplicate first-version prizes. The caller must still use
    -- independently verified individual-engine winners (not user awards).
    IF EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_individual_rows) AS j(prize_id uuid)
      GROUP BY j.prize_id HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'team_v2_duplicate_initial_prize';
    END IF;
    -- Independent DB prize coverage prevents an otherwise valid truncated
    -- scorer response from creating a money-bearing partial version.
    IF jsonb_array_length(p_individual_rows) <> (
      SELECT count(*)
      FROM public.prizes pz
      JOIN public.categories cat ON cat.id = pz.category_id
      WHERE cat.tournament_id = p_tournament_id
        AND cat.is_active IS TRUE AND pz.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'team_v2_incomplete_initial_individual_awards';
    END IF;
    INSERT INTO public.allocations (
      tournament_id, version, prize_id, player_id, reason_codes,
      is_manual, decided_by, decided_at
    )
    SELECT p_tournament_id, v_new, j.prize_id, j.player_id,
      COALESCE(j.reason_codes, ARRAY[]::text[]),
      COALESCE(j.is_manual, false), p_actor_id, now()
    FROM jsonb_to_recordset(p_individual_rows)
      AS j(prize_id uuid, player_id uuid, reason_codes text[], is_manual boolean)
    WHERE j.player_id IS NOT NULL;
  ELSE
    -- Later manual ruling: keep *all* individual winners exactly as they were.
    -- Do not accept caller-supplied individual changes at this boundary.
    IF jsonb_array_length(p_individual_rows) <> 0 OR
       NOT EXISTS (SELECT 1 FROM public.allocations
         WHERE tournament_id = p_tournament_id AND version = v_latest) THEN
      RAISE EXCEPTION 'team_v2_missing_individual_baseline';
    END IF;
    INSERT INTO public.allocations (
      tournament_id, version, prize_id, player_id, reason_codes,
      is_manual, decided_by, decided_at
    )
    SELECT tournament_id, v_new, prize_id, player_id, reason_codes,
      is_manual, decided_by, decided_at
    FROM public.allocations
    WHERE tournament_id = p_tournament_id AND version = v_latest;
  END IF;

  -- All team winners in this new version must come from the server's verified
  -- *full* scorer response, not a list of changed payouts supplied by a user.
  IF jsonb_array_length(p_team_rows) = 0 OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_team_rows)
      AS j(group_id uuid, prize_id uuid, place integer,
           institution_key text, total_points numeric, player_ids uuid[],
           player_snapshot jsonb, ranking_snapshot jsonb)
    LEFT JOIN public.institution_prize_groups g ON g.id = j.group_id
    LEFT JOIN public.institution_prizes p ON p.id = j.prize_id
    WHERE j.group_id IS NULL OR j.prize_id IS NULL OR
      j.place IS NULL OR j.place < 1 OR
      NULLIF(btrim(j.institution_key), '') IS NULL OR
      j.total_points IS NULL OR
      j.player_ids IS NULL OR cardinality(j.player_ids) = 0 OR
      jsonb_typeof(j.player_snapshot) IS DISTINCT FROM 'array' OR
      jsonb_array_length(j.player_snapshot) <> cardinality(j.player_ids) OR
      jsonb_typeof(j.ranking_snapshot) IS DISTINCT FROM 'object' OR
      j.ranking_snapshot ->> 'schema_version' <> '2' OR
      j.ranking_snapshot ->> 'group_id' IS DISTINCT FROM j.group_id::text OR
      j.ranking_snapshot ->> 'winner_key' IS DISTINCT FROM j.institution_key OR
      j.ranking_snapshot -> 'award' ->> 'id' IS DISTINCT FROM j.prize_id::text OR
      j.ranking_snapshot ->> 'allocation_version' IS DISTINCT FROM v_new::text OR
      j.ranking_snapshot ->> 'finalized_by' IS DISTINCT FROM p_actor_id::text OR
      j.ranking_snapshot -> 'declared_rules' IS DISTINCT FROM g.ranking_rules OR
      j.ranking_snapshot -> 'declared_rules' ->> 'organizer_confirmed' IS DISTINCT FROM 'true' OR
      NULLIF(btrim(j.ranking_snapshot -> 'declared_rules' ->> 'published_reference'), '') IS NULL OR
      j.ranking_snapshot -> 'group_rule' IS DISTINCT FROM jsonb_build_object(
        'group_by', g.group_by, 'team_size', g.team_size,
        'female_slots', g.female_slots, 'male_slots', g.male_slots,
        'scoring_mode', g.scoring_mode
      ) OR
      g.tournament_id IS DISTINCT FROM p_tournament_id OR
      g.is_active IS DISTINCT FROM true OR
      p.group_id IS DISTINCT FROM g.id OR
      p.is_active IS DISTINCT FROM true OR
      p.place IS DISTINCT FROM j.place OR
      (j.ranking_snapshot -> 'award' ->> 'cash_amount')::numeric IS DISTINCT FROM p.cash_amount OR
      (j.ranking_snapshot -> 'award' ->> 'has_trophy')::boolean IS DISTINCT FROM p.has_trophy OR
      (j.ranking_snapshot -> 'award' ->> 'has_medal')::boolean IS DISTINCT FROM p.has_medal
  ) THEN
    RAISE EXCEPTION 'team_v2_invalid_team_rows';
  END IF;

  -- Every active prize-bearing group must have all its prize slots covered.
  -- Above, each submitted prize has been validated as active and unique, so
  -- an exact inventory count proves that no prize was silently omitted.
  IF jsonb_array_length(p_team_rows) <> (
    SELECT count(*) FROM public.institution_prizes p
    JOIN public.institution_prize_groups g ON g.id = p.group_id
    WHERE g.tournament_id = p_tournament_id
      AND g.is_active IS TRUE AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'team_v2_incomplete_team_awards';
  END IF;

  -- Check submitted K-player roster against current player records. These
  -- checks do NOT replicate the trusted rank/slot picker, provenance-aware TB
  -- scorer, or full winner eligibility/ordering of the server-derived plan.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_team_rows) AS j(prize_id uuid)
    GROUP BY j.prize_id HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_team_rows) AS j(group_id uuid, place integer)
    GROUP BY j.group_id, j.place HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_team_rows) AS j(group_id uuid, institution_key text)
    GROUP BY j.group_id, j.institution_key HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'team_v2_duplicate_team_award';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_team_rows)
      AS j(group_id uuid, institution_key text, total_points numeric,
           player_ids uuid[], player_snapshot jsonb)
    JOIN public.institution_prize_groups g ON g.id = j.group_id
    WHERE g.group_by NOT IN ('team','club','city','state','group_label','type_label')
      OR cardinality(j.player_ids) IS DISTINCT FROM g.team_size
      OR (SELECT COUNT(DISTINCT selected.id)
          FROM unnest(j.player_ids) AS selected(id)) <> g.team_size
      OR (SELECT COUNT(DISTINCT snap.value ->> 'player_id')
          FROM jsonb_array_elements(j.player_snapshot) AS snap(value)) <> g.team_size
      OR EXISTS (
        SELECT 1 FROM unnest(j.player_ids) AS selected(id)
        LEFT JOIN public.players pl ON pl.id = selected.id
        WHERE pl.tournament_id IS DISTINCT FROM p_tournament_id
          OR pl.points IS NULL
          OR btrim(CASE g.group_by
            WHEN 'team' THEN pl.team
            WHEN 'club' THEN pl.club
            WHEN 'city' THEN pl.city
            WHEN 'state' THEN pl.state
            WHEN 'group_label' THEN pl.group_label
            WHEN 'type_label' THEN pl.type_label
          END) IS DISTINCT FROM j.institution_key
          OR NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(j.player_snapshot) AS snap(value)
            WHERE snap.value ->> 'player_id' = selected.id::text
              AND (snap.value ->> 'points')::numeric IS NOT DISTINCT FROM pl.points
          )
      )
      OR j.total_points IS DISTINCT FROM (
        SELECT SUM(pl.points) FROM public.players pl WHERE pl.id = ANY(j.player_ids)
      )
  ) THEN
    RAISE EXCEPTION 'team_v2_invalid_team_roster_or_scores';
  END IF;

  -- Preserve previously recorded team winners when amending a version. A
  -- separate rule/config change must go through full reviewed finalization.
  IF v_latest > 0 AND EXISTS (
    SELECT 1 FROM public.team_allocations old
    WHERE old.tournament_id = p_tournament_id AND old.version = v_latest
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_team_rows)
          AS j(prize_id uuid, institution_key text, place integer)
        WHERE j.prize_id = old.prize_id AND j.place = old.place
          AND j.institution_key = old.institution_key
      )
      -- A changed cash winner is permitted ONLY in a NEW version and ONLY
      -- for an exactly prize-matched documented official ruling. The
      -- authenticated Edge caller must independently validate this ruling
      -- against fresh scorer partitions and published regulations.
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_team_rows)
          AS j(prize_id uuid, group_id uuid, place integer,
               institution_key text, ranking_snapshot jsonb)
        JOIN LATERAL jsonb_array_elements(p_rulings) AS ruling(value)
          ON ruling.value = j.ranking_snapshot -> 'ruling'
        WHERE j.prize_id = old.prize_id
          AND j.group_id = old.group_id
          AND j.place = old.place
          AND j.institution_key IS DISTINCT FROM old.institution_key
          AND ruling.value ->> 'group_id' = j.group_id::text
          AND ruling.value ->> 'allocation_version' = v_new::text
          AND ruling.value ->> 'supersedes_allocation_version' = v_latest::text
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(
              ruling.value -> 'award_instructions'
            ) AS instruction(value)
            WHERE instruction.value ->> 'place' = j.place::text
              AND instruction.value ->> 'institution_key' = j.institution_key
          )
      )
  ) THEN
    RAISE EXCEPTION 'team_v2_previous_winner_changed';
  END IF;

  -- A row must not sneak in an undocumented/manual override absent from
  -- the independently checked rulings array. The Edge scorer must supply
  -- ALL award rows and must not permit arbitrary user-built snapshots.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_team_rows)
      AS j(ranking_snapshot jsonb)
    WHERE j.ranking_snapshot ? 'ruling'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_rulings) AS r(value)
        WHERE r.value = j.ranking_snapshot -> 'ruling'
      )
  ) THEN
    RAISE EXCEPTION 'team_v2_unreferenced_ruling';
  END IF;

  -- The server-reviewed ruling is stored on each affected award, never
  -- separately in a mutable free-text note. Reject unaccounted instructions.
  FOR v_ruling IN SELECT value FROM jsonb_array_elements(p_rulings) LOOP
    IF jsonb_typeof(v_ruling) <> 'object' OR
       v_ruling ->> 'schema_version' <> '2' OR
       (v_ruling ->> 'allocation_version')::integer IS DISTINCT FROM v_new OR
       (v_ruling ->> 'supersedes_allocation_version')::integer IS DISTINCT FROM v_latest OR
       v_ruling ->> 'actor_id' IS DISTINCT FROM p_actor_id::text OR
       v_ruling ->> 'method' <> 'documented_arbiter_ruling' OR
       NULLIF(btrim(v_ruling ->> 'regulation_reference'), '') IS NULL OR
       NULLIF(btrim(v_ruling ->> 'arbiter_decision_reference'), '') IS NULL OR
       NULLIF(btrim(v_ruling ->> 'explanation'), '') IS NULL OR
       jsonb_typeof(v_ruling -> 'award_instructions') IS DISTINCT FROM 'array' OR
       jsonb_array_length(v_ruling -> 'award_instructions') = 0 OR
       jsonb_typeof(v_ruling -> 'affected_places') IS DISTINCT FROM 'array' OR
       jsonb_array_length(v_ruling -> 'affected_places') IS DISTINCT FROM
         jsonb_array_length(v_ruling -> 'award_instructions') OR
       NOT EXISTS (
         SELECT 1 FROM public.institution_prize_groups g
         WHERE g.id = (v_ruling ->> 'group_id')::uuid
           AND g.tournament_id = p_tournament_id
           AND g.is_active = true
           AND g.ranking_rules ->> 'published_reference' =
             v_ruling ->> 'regulation_reference'
           AND g.ranking_rules ->> 'organizer_confirmed' = 'true'
       ) THEN
      RAISE EXCEPTION 'team_v2_invalid_ruling';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_ruling -> 'award_instructions') AS a(value)
      GROUP BY a.value ->> 'place' HAVING COUNT(*) > 1
    ) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_ruling -> 'award_instructions') AS a(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_ruling -> 'affected_places') AS ap(value)
        WHERE ap.value = a.value -> 'place'
      )
    ) THEN
      RAISE EXCEPTION 'team_v2_invalid_ruling_places';
    END IF;
    FOR v_award IN SELECT value
      FROM jsonb_array_elements(v_ruling -> 'award_instructions') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_team_rows)
          AS j(group_id uuid, place integer, institution_key text, ranking_snapshot jsonb)
        WHERE j.group_id = (v_ruling ->> 'group_id')::uuid
          AND j.place = (v_award ->> 'place')::integer
          AND j.institution_key = v_award ->> 'institution_key'
          AND j.ranking_snapshot -> 'ruling' = v_ruling
      ) THEN
        RAISE EXCEPTION 'team_v2_ruling_award_mismatch';
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO public.team_allocations (
    tournament_id, version, group_id, prize_id, place, institution_key,
    total_points, player_ids, player_snapshot, ranking_snapshot
  )
  SELECT p_tournament_id, v_new, j.group_id, j.prize_id, j.place,
    j.institution_key, j.total_points, j.player_ids, j.player_snapshot,
    j.ranking_snapshot
  FROM jsonb_to_recordset(p_team_rows)
    AS j(group_id uuid, prize_id uuid, place integer, institution_key text,
         total_points numeric, player_ids uuid[], player_snapshot jsonb,
         ranking_snapshot jsonb);
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> jsonb_array_length(p_team_rows) THEN
    RAISE EXCEPTION 'team_v2_team_write_incomplete';
  END IF;
  -- NEVER update old allocation versions, publication pins, or old tie notes.
  RETURN v_new;
END;
$fn$;

-- A service-role-only invocation; do not expose this to logged-in browsers.
-- Even if PUBLIC has automatic function EXECUTE privileges, revoke them.
REVOKE EXECUTE ON FUNCTION public.commit_team_v2_adjudicated_version(
  uuid, integer, uuid, jsonb, jsonb, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_team_v2_adjudicated_version(
  uuid, integer, uuid, jsonb, jsonb, jsonb, text
) TO service_role;


-- Fence legacy direct/MULTI-request allocation writers at the database boundary.
-- Noncanary legacy groups continue unchanged. Enabled canary groups are fenced. The flag cannot be
-- supplied through any browser field; it is set inside the authorized atomic RPC
-- only after ownership, version and source-fingerprint validation.
CREATE FUNCTION public.reject_team_v2_legacy_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $guard$
BEGIN
  -- Enrollment is permanent for write-fencing even when Save is OFF.
  -- A kill switch must never reopen legacy writers on a V2-paid tournament.
  -- Historical V2 snapshots add defense if an allowlist entry was lost.
  IF (
    EXISTS (SELECT 1 FROM public.team_v2_canary_tournaments marker
      WHERE marker.tournament_id = NEW.tournament_id)
    OR EXISTS (SELECT 1 FROM public.team_allocations history
      WHERE history.tournament_id = NEW.tournament_id
        AND history.ranking_snapshot IS NOT NULL)
  ) AND (
    current_user <> 'service_role'
    OR pg_catalog.current_setting('prize_manager.team_v2_atomic_writer', true)
      IS DISTINCT FROM '1'
  ) THEN
    RAISE EXCEPTION 'team_v2_atomic_writer_required';
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE EXECUTE ON FUNCTION public.reject_team_v2_legacy_allocation()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER protect_v2_individual_allocations
BEFORE INSERT ON public.allocations
FOR EACH ROW EXECUTE FUNCTION public.reject_team_v2_legacy_allocation();

CREATE TRIGGER protect_v2_team_allocations
BEFORE INSERT ON public.team_allocations
FOR EACH ROW EXECUTE FUNCTION public.reject_team_v2_legacy_allocation();


