-- Team prizes use the usual flow only: Finalize saves them, ties go to the
-- usual tie dialog (resolve_team_tie). Step B of
-- claude/TEAM_V2_ORGANIZER_PLAN_2026-11-01.md. Drops the leftovers of the
-- separate Team V2 save path, which no deployed code uses after 2 Nov 2026:
--   * the six team_v2_epoch_* source-change triggers and
--     team_v2_record_source_change()
--   * team_v2_canary_active() and the team_v2_canary_tournaments list
--   * team_v2_source_fingerprint()
--   * commit_team_v2_adjudicated_version() (the separate writer)
-- Kept, because they hold data: institution_prize_groups.ranking_rules and
-- team_allocations.ranking_snapshot. resolve_team_tie is untouched.
-- Apply only AFTER the edge functions without the canary lookup are live.
-- One statement, self-verifying: any mismatch aborts and nothing changes.
DO $side_flow$
DECLARE
  v_epoch_triggers constant text[] := ARRAY[
    'team_v2_epoch_categories', 'team_v2_epoch_prizes', 'team_v2_epoch_players',
    'team_v2_epoch_rule_config', 'team_v2_epoch_institution_groups',
    'team_v2_epoch_institution_prizes'];
  v_writer constant text :=
    'public.commit_team_v2_adjudicated_version(uuid,integer,uuid,jsonb,jsonb,jsonb,text)';
  v_count integer;
BEGIN
  -- Pre-flight: the audited state.
  SELECT count(*) INTO v_count FROM pg_trigger
   WHERE tgname = ANY (v_epoch_triggers) AND NOT tgisinternal
     AND tgfoid = to_regprocedure('public.team_v2_record_source_change()');
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'preflight: expected 6 team_v2_epoch_* triggers, found %', v_count;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger
             WHERE tgfoid = to_regprocedure('public.team_v2_record_source_change()')
               AND NOT (tgname = ANY (v_epoch_triggers))) THEN
    RAISE EXCEPTION 'preflight: team_v2_record_source_change() is used by another trigger';
  END IF;
  IF to_regclass('public.team_v2_canary_tournaments') IS NULL
     OR to_regprocedure('public.team_v2_canary_active(uuid)') IS NULL
     OR to_regprocedure('public.team_v2_source_fingerprint(uuid)') IS NULL
     OR to_regprocedure(v_writer) IS NULL THEN
    RAISE EXCEPTION 'preflight: Team V2 side-flow objects are not in the audited state';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger
             WHERE tgname IN ('protect_v2_individual_allocations', 'protect_v2_team_allocations'))
     OR to_regprocedure('public.reject_team_v2_legacy_allocation()') IS NOT NULL THEN
    RAISE EXCEPTION 'preflight: step A (drop the write fence) has not been applied';
  END IF;

  DROP TRIGGER team_v2_epoch_categories ON public.categories;
  DROP TRIGGER team_v2_epoch_prizes ON public.prizes;
  DROP TRIGGER team_v2_epoch_players ON public.players;
  DROP TRIGGER team_v2_epoch_rule_config ON public.rule_config;
  DROP TRIGGER team_v2_epoch_institution_groups ON public.institution_prize_groups;
  DROP TRIGGER team_v2_epoch_institution_prizes ON public.institution_prizes;
  DROP FUNCTION public.team_v2_record_source_change();
  DROP FUNCTION public.commit_team_v2_adjudicated_version(uuid, integer, uuid, jsonb, jsonb, jsonb, text);
  DROP FUNCTION public.team_v2_source_fingerprint(uuid);
  DROP FUNCTION public.team_v2_canary_active(uuid);
  DROP TABLE public.team_v2_canary_tournaments;

  -- Post-check: all gone, and the data columns and the tie RPC remain.
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname LIKE 'team_v2_%')
     OR to_regprocedure('public.team_v2_record_source_change()') IS NOT NULL
     OR to_regprocedure(v_writer) IS NOT NULL
     OR to_regprocedure('public.team_v2_source_fingerprint(uuid)') IS NOT NULL
     OR to_regprocedure('public.team_v2_canary_active(uuid)') IS NOT NULL
     OR to_regclass('public.team_v2_canary_tournaments') IS NOT NULL THEN
    RAISE EXCEPTION 'postcheck: a Team V2 side-flow object is still present';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'institution_prize_groups'
                   AND column_name = 'ranking_rules')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'team_allocations'
                   AND column_name = 'ranking_snapshot')
     OR to_regprocedure('public.resolve_team_tie(uuid,integer,uuid,integer[],jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'postcheck: a kept object is missing';
  END IF;
END
$side_flow$;
