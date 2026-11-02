-- Team V2 is part of prize setup: Finalize saves team results as usual.
-- Step A of claude/TEAM_V2_ORGANIZER_PLAN_2026-11-01.md. Drops ONLY the write
-- fence added by 20261027080000_team_v2_adjudicated_atomic_version.sql:
-- triggers protect_v2_individual_allocations (allocations) and
-- protect_v2_team_allocations (team_allocations), and their function
-- reject_team_v2_legacy_allocation(). The canary list, the separate writer
-- and the source-change triggers stay until step B.
-- Safe with the code deployed on 2 Nov 2026: finalize still refuses Team V2
-- tournaments in code, so no new write path opens.
-- One statement, self-verifying: any mismatch aborts and nothing changes.
DO $fence$
BEGIN
  -- Pre-flight: the audited state.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'protect_v2_individual_allocations'
                   AND tgrelid = 'public.allocations'::regclass AND NOT tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'protect_v2_team_allocations'
                   AND tgrelid = 'public.team_allocations'::regclass AND NOT tgisinternal)
     OR to_regprocedure('public.reject_team_v2_legacy_allocation()') IS NULL THEN
    RAISE EXCEPTION 'preflight: the Team V2 write fence is not in the audited state';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger t
             WHERE t.tgfoid = to_regprocedure('public.reject_team_v2_legacy_allocation()')
               AND t.tgname NOT IN ('protect_v2_individual_allocations', 'protect_v2_team_allocations')) THEN
    RAISE EXCEPTION 'preflight: reject_team_v2_legacy_allocation() is used by another trigger';
  END IF;

  DROP TRIGGER protect_v2_individual_allocations ON public.allocations;
  DROP TRIGGER protect_v2_team_allocations ON public.team_allocations;
  DROP FUNCTION public.reject_team_v2_legacy_allocation();

  -- Post-check: the fence is gone and nothing else moved.
  IF EXISTS (SELECT 1 FROM pg_trigger
             WHERE tgname IN ('protect_v2_individual_allocations', 'protect_v2_team_allocations'))
     OR to_regprocedure('public.reject_team_v2_legacy_allocation()') IS NOT NULL THEN
    RAISE EXCEPTION 'postcheck: the write fence is still present';
  END IF;
  IF to_regclass('public.team_v2_canary_tournaments') IS NULL
     OR to_regprocedure('public.commit_team_v2_adjudicated_version(uuid,integer,uuid,jsonb,jsonb,jsonb,text)') IS NULL
     OR (SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'team_v2_epoch_%' AND NOT tgisinternal) <> 6 THEN
    RAISE EXCEPTION 'postcheck: an object other than the write fence changed';
  END IF;
END
$fence$;
