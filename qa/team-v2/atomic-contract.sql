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
-- An old finalize or tie writer cannot insert either half of a v2 allocation.
DO $legacy_fence$
BEGIN
 BEGIN
  INSERT INTO public.allocations(tournament_id,version,prize_id,player_id)
    VALUES('00000000-0000-4000-8000-000000000001',1,
           '00000000-0000-4000-8000-000000000003',
           '00000000-0000-4000-8000-000000000004');
  RAISE EXCEPTION 'FAIL legacy individual writer bypassed v2 fence';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'team_v2_atomic_writer_required' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.team_allocations(tournament_id,version,group_id,prize_id,
      place,institution_key,total_points,player_ids,player_snapshot)
    VALUES('00000000-0000-4000-8000-000000000001',1,
           '00000000-0000-4000-8000-000000000006',
           '00000000-0000-4000-8000-000000000007',
           1,'Club A',9,ARRAY['00000000-0000-4000-8000-000000000004'::uuid],
           '[]'::jsonb);
  RAISE EXCEPTION 'FAIL legacy team writer bypassed v2 fence';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'team_v2_atomic_writer_required' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM public.allocations)
    OR EXISTS (SELECT 1 FROM public.team_allocations) THEN
  RAISE EXCEPTION 'FAIL blocked legacy writer left a partial allocation';
 END IF;
END $legacy_fence$;

-- Negative guard must not change the existing legacy (NULL-rules) contract.
INSERT INTO public.tournaments(id,owner_id)
 VALUES('00000000-0000-4000-8000-000000000011',
        '00000000-0000-4000-8000-000000000010');
INSERT INTO public.institution_prize_groups
 (id,tournament_id,name,group_by,team_size,female_slots,male_slots,scoring_mode,is_active,ranking_rules)
 VALUES('00000000-0000-4000-8000-000000000012',
        '00000000-0000-4000-8000-000000000011',
        'Legacy synthetic group','club',2,0,0,'by_top_k_score',true,NULL);
INSERT INTO public.allocations(tournament_id,version,prize_id,player_id)
 VALUES('00000000-0000-4000-8000-000000000011',1,
        '00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000004');
INSERT INTO public.team_allocations
 (tournament_id,version,group_id,prize_id,place,institution_key,total_points,player_ids,player_snapshot)
 VALUES('00000000-0000-4000-8000-000000000011',1,
        '00000000-0000-4000-8000-000000000012',
        '00000000-0000-4000-8000-000000000007',
        1,'Club A',9,ARRAY['00000000-0000-4000-8000-000000000004'::uuid],
        '[]'::jsonb);
DELETE FROM public.allocations
 WHERE tournament_id='00000000-0000-4000-8000-000000000011';
DELETE FROM public.team_allocations
 WHERE tournament_id='00000000-0000-4000-8000-000000000011';
-- A partial scorer response cannot silently pay only 1 of 2 configured
-- individual prizes, even if its submitted award row is valid.
INSERT INTO public.prizes(id,category_id,is_active)
VALUES('00000000-0000-4000-8000-000000000008',
       '00000000-0000-4000-8000-000000000002',true);
DO $individual_coverage$
BEGIN
  PERFORM qa.submit_version(0,
    '00000000-0000-4000-8000-000000000010',9,false);
  RAISE EXCEPTION 'FAIL incomplete individual awards accepted';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'team_v2_incomplete_initial_individual_awards' THEN RAISE; END IF;
END $individual_coverage$;
DO $coverage_rollback$
BEGIN
  IF EXISTS (SELECT 1 FROM public.allocations) OR
     EXISTS (SELECT 1 FROM public.team_allocations) THEN
    RAISE EXCEPTION 'FAIL incomplete individual awards partially written';
  END IF;
END $coverage_rollback$;
DELETE FROM public.prizes
WHERE id='00000000-0000-4000-8000-000000000008';

-- A partial team scorer response cannot pay just one of two configured
-- cash-prize places, even when the award payload for place one is valid.
INSERT INTO public.institution_prizes
 (id,group_id,place,cash_amount,has_trophy,has_medal,is_active)
VALUES('00000000-0000-4000-8000-000000000009',
       '00000000-0000-4000-8000-000000000006',2,80,false,false,true);
DO $team_coverage$
BEGIN
  PERFORM qa.submit_version(0,
    '00000000-0000-4000-8000-000000000010',9,false);
  RAISE EXCEPTION 'FAIL incomplete team awards accepted';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'team_v2_incomplete_team_awards' THEN RAISE; END IF;
END $team_coverage$;
DO $team_rollback$
BEGIN
  IF EXISTS (SELECT 1 FROM public.allocations) OR
     EXISTS (SELECT 1 FROM public.team_allocations) THEN
    RAISE EXCEPTION 'FAIL incomplete team awards partially written';
  END IF;
END $team_rollback$;
DELETE FROM public.institution_prizes
WHERE id='00000000-0000-4000-8000-000000000009';

-- An update followed by reversion across TWO committed transactions must
-- not masquerade as the original scorer snapshot. Equal points are not a
-- sufficient consistency proof; the original row creation xid must differ.
SELECT pg_catalog.set_config(
  'qa.team_v2_prior_digest',
  public.team_v2_source_fingerprint('00000000-0000-4000-8000-000000000001'::uuid),
  false
);
UPDATE public.players SET points=6 WHERE id='00000000-0000-4000-8000-000000000004';
UPDATE public.players SET points=5 WHERE id='00000000-0000-4000-8000-000000000004';
DO $aba_check$
BEGIN
  IF (SELECT points FROM public.players
      WHERE id='00000000-0000-4000-8000-000000000004') <> 5
  THEN RAISE EXCEPTION 'FAIL ABA fixture did not revert points'; END IF;
  IF public.team_v2_source_fingerprint('00000000-0000-4000-8000-000000000001'::uuid)
      IS NOT DISTINCT FROM pg_catalog.current_setting('qa.team_v2_prior_digest')
  THEN RAISE EXCEPTION 'FAIL update-and-revert source digest was reused'; END IF;
  BEGIN
    PERFORM qa.submit_version(
      0, '00000000-0000-4000-8000-000000000010', 9, false,
      pg_catalog.current_setting('qa.team_v2_prior_digest')
    );
    RAISE EXCEPTION 'FAIL ABA source digest committed awards';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'team_v2_source_changed' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.allocations) OR
     EXISTS (SELECT 1 FROM public.team_allocations)
  THEN RAISE EXCEPTION 'FAIL ABA conflict left partial awards'; END IF;
END $aba_check$;

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
