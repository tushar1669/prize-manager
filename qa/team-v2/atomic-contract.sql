-- All identities and entries are synthetic and reside in ephemeral CI Postgres only.
-- Test exact unmodified draft SQL as service_role, without production keys.
DO $$
BEGIN
  IF has_function_privilege('authenticated',
     'public.commit_team_v2_adjudicated_version(uuid,integer,uuid,jsonb,jsonb,jsonb,text)','EXECUTE')
     OR has_function_privilege('anon',
     'public.commit_team_v2_adjudicated_version(uuid,integer,uuid,jsonb,jsonb,jsonb,text)','EXECUTE')
  THEN RAISE EXCEPTION 'FAIL direct client role can EXECUTE atomic writer'; END IF;
END $$;
-- Wrapper is a test-only fixture: it must still be rejected as non-service caller.
SET ROLE authenticated;
DO $$
BEGIN
  PERFORM qa.submit_version(0);
  RAISE EXCEPTION 'FAIL browser could execute atomic writer';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%permission denied%' AND
     SQLERRM NOT LIKE '%team_v2_service_role_required%'
  THEN RAISE; END IF;
END $$;
RESET ROLE;

SET ROLE service_role;
-- A changed source row must fail even when expected version is still zero.
DO $source_check$
DECLARE prior_token text;
BEGIN
 prior_token := public.team_v2_source_fingerprint('00000000-0000-4000-8000-000000000001'::uuid);
 UPDATE public.players SET points=6
  WHERE id='00000000-0000-4000-8000-000000000004';
 BEGIN
  PERFORM qa.submit_version(0,'00000000-0000-4000-8000-000000000010',
    9,false,prior_token);
  RAISE EXCEPTION 'FAIL player mutation accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'team_v2_source_changed' THEN RAISE; END IF;
 END;
 UPDATE public.players SET points=5
  WHERE id='00000000-0000-4000-8000-000000000004';
 IF EXISTS(SELECT 1 FROM public.allocations) OR
    EXISTS(SELECT 1 FROM public.team_allocations) THEN
  RAISE EXCEPTION 'FAIL partial allocations after source mismatch';
 END IF;
 prior_token := public.team_v2_source_fingerprint('00000000-0000-4000-8000-000000000001'::uuid);
 UPDATE public.institution_prizes SET cash_amount=200
  WHERE id='00000000-0000-4000-8000-000000000007';
 BEGIN
  PERFORM qa.submit_version(0,'00000000-0000-4000-8000-000000000010',
    9,false,prior_token);
  RAISE EXCEPTION 'FAIL changed prize accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'team_v2_source_changed' THEN RAISE; END IF;
 END;
 UPDATE public.institution_prizes SET cash_amount=100
  WHERE id='00000000-0000-4000-8000-000000000007';
END $source_check$;

DO $$
BEGIN
  PERFORM qa.submit_version(0, '00000000-0000-4000-8000-000000000099');
  RAISE EXCEPTION 'FAIL unauthorized actor committed';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%team_v2_forbidden%' THEN RAISE; END IF;
END $$;
DO $$
BEGIN
  PERFORM qa.submit_version(1);
  RAISE EXCEPTION 'FAIL stale version accepted';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%team_v2_stale_allocation_version%' THEN RAISE; END IF;
END $$;
DO $$
BEGIN
  PERFORM qa.submit_version(0, '00000000-0000-4000-8000-000000000010', 8);
  RAISE EXCEPTION 'FAIL incorrect roster total accepted';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%team_v2_invalid_team_roster_or_scores%'
  THEN RAISE; END IF;
END $$;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.allocations) <> 0 OR
     (SELECT count(*) FROM public.team_allocations) <> 0
  THEN RAISE EXCEPTION 'FAIL invalid team write partially created individual awards'; END IF;
END $$;
-- A fully resolved ranking requires NO invented arbiter ruling.
-- It must still commit atomically, and the old publication pin must survive.
SELECT qa.submit_version(
  0, '00000000-0000-4000-8000-000000000010', 9, false
) AS uncontested_version;
DO $no_tie_check$
BEGIN
  IF (SELECT count(*) FROM public.allocations WHERE version=1) <> 1 OR
     (SELECT count(*) FROM public.team_allocations WHERE version=1) <> 1 OR
     (SELECT count(*) FROM public.team_allocations
        WHERE ranking_snapshot ? 'ruling') <> 0 OR
     (SELECT count(*) FROM public.publications
        WHERE allocation_version=0) <> 1
  THEN RAISE EXCEPTION 'FAIL no-ruling resolved award or publication pin'; END IF;
END $no_tie_check$;
TRUNCATE public.allocations, public.team_allocations;

-- A submitted ruling must still match the prize-specific saved award.
SELECT qa.submit_version(0) AS version_created;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.allocations WHERE version=1) <> 1 OR
     (SELECT count(*) FROM public.team_allocations WHERE version=1) <> 1 OR
     (SELECT count(*) FROM public.publications WHERE allocation_version=0) <> 1 OR
     (SELECT count(*) FROM public.publications WHERE allocation_version=1) <> 0
  THEN RAISE EXCEPTION 'FAIL successful atomic write or pinned publication changed'; END IF;
END $$;
DO $$
BEGIN
  PERFORM qa.submit_version(0);
  RAISE EXCEPTION 'FAIL duplicate version accepted';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%team_v2_stale_allocation_version%' THEN RAISE; END IF;
END $$;
RESET ROLE;
-- Restore blank synthetic state for separate parallel-sessions race test.
TRUNCATE public.allocations, public.team_allocations;
