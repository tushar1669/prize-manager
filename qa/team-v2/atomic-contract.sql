-- All identities and entries are synthetic and reside in ephemeral CI Postgres only.
-- Test exact unmodified draft SQL as service_role, without production keys.
-- Production catalog contract: the fixture must NOT silently provide a
-- stronger allocation uniqueness rule than the real database. This test
-- deliberately checks physical indexes, not only named constraints.
DO $allocation_catalog$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index ix
    WHERE ix.indrelid = 'public.allocations'::regclass
      AND ix.indisunique
      AND pg_get_indexdef(ix.indexrelid)
        LIKE '%(tournament_id, version, prize_id)%'
  ) THEN
    RAISE EXCEPTION 'FAIL isolated individual allocation has nonexistent production uniqueness';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index ix
    WHERE ix.indrelid = 'public.allocations'::regclass
      AND NOT ix.indisunique
      AND pg_get_indexdef(ix.indexrelid) LIKE '%(tournament_id, version)%'
  ) THEN
    RAISE EXCEPTION 'FAIL missing production individual allocation lookup index';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index ix
    WHERE ix.indrelid = 'public.team_allocations'::regclass
      AND ix.indisunique
      AND pg_get_indexdef(ix.indexrelid)
        LIKE '%(tournament_id, version, group_id, place)%'
  ) THEN
    RAISE EXCEPTION 'FAIL missing production team award uniqueness';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_index ix
    WHERE ix.indrelid = 'public.team_allocations'::regclass
      AND ix.indisunique
      AND pg_get_indexdef(ix.indexrelid)
        LIKE '%(tournament_id, version, prize_id)%'
  ) THEN
    RAISE EXCEPTION 'FAIL isolated team award has nonexistent production prize uniqueness';
  END IF;
END $allocation_catalog$;

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
-- RED: A global schema must start with ALL team v2 tournaments disabled.
-- No table, no enabled row, or stale owner setting may silently opt a user in.
DO $no_canary$
BEGIN
  IF public.team_v2_canary_active('00000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL tournament enabled by default';
  END IF;
  BEGIN
    PERFORM qa.submit_version(0);
    RAISE EXCEPTION 'FAIL atomic Save permitted without canary opt in';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'team_v2_canary_disabled' THEN RAISE; END IF;
  END;
END $no_canary$;
RESET ROLE;
-- Only service-role backend may read the canary boundary or change its rows.
DO $privileges$
BEGIN
 IF has_table_privilege('authenticated','public.team_v2_canary_tournaments','SELECT') OR
    has_table_privilege('anon','public.team_v2_canary_tournaments','SELECT') OR
    has_table_privilege('authenticated','public.team_v2_canary_tournaments','INSERT') OR
    has_function_privilege('authenticated','public.team_v2_canary_active(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'FAIL public role can control or enumerate v2 canaries'; END IF;
END $privileges$;
-- The operator permits one synthetic tournament ONLY after the deny test.
INSERT INTO public.team_v2_canary_tournaments (tournament_id, enabled)
 VALUES ('00000000-0000-4000-8000-000000000001', true);
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

-- Non-canary events must retain prior production allocation behavior.
-- The canary restriction must affect ONLY the opted-in event.
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
        '00000000-0000-4000-8000-000000000007',1,'Club A',9,
        ARRAY['00000000-0000-4000-8000-000000000004'::uuid],'[]'::jsonb);
DO $noncanary_legacy$
BEGIN
 IF (SELECT count(*) FROM public.allocations
   WHERE tournament_id='00000000-0000-4000-8000-000000000011') <> 1 OR
    (SELECT count(*) FROM public.team_allocations
   WHERE tournament_id='00000000-0000-4000-8000-000000000011') <> 1 THEN
   RAISE EXCEPTION 'FAIL legacy non-canary payout changed by v2 canary';
 END IF;
 IF public.team_v2_canary_active('00000000-0000-4000-8000-000000000011') THEN
   RAISE EXCEPTION 'FAIL non-canary was auto-activated';
 END IF;
END $noncanary_legacy$;
DELETE FROM public.allocations WHERE tournament_id='00000000-0000-4000-8000-000000000011';
DELETE FROM public.team_allocations WHERE tournament_id='00000000-0000-4000-8000-000000000011';
-- A noncanary player edit cannot bump the event tournament MVCC lineage.
DO $noncanary_epoch$
DECLARE
 before_xmin text;
 after_xmin text;
BEGIN
 SELECT xmin::text INTO before_xmin FROM public.tournaments
 WHERE id='00000000-0000-4000-8000-000000000011';
 INSERT INTO public.players(id,tournament_id,points,club)
 VALUES('00000000-0000-4000-8000-000000000030',
        '00000000-0000-4000-8000-000000000011',1,'Club Z');
 SELECT xmin::text INTO after_xmin FROM public.tournaments
 WHERE id='00000000-0000-4000-8000-000000000011';
 IF before_xmin IS DISTINCT FROM after_xmin THEN
  RAISE EXCEPTION 'FAIL source trigger touched noncanary tournament';
 END IF;
END $noncanary_epoch$;

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
-- A real event can have genuine unfilled individual prizes. The caller
-- explicitly documents each without inserting a fabricated player winner.
SELECT qa.submit_version(
  0, '00000000-0000-4000-8000-000000000010', 9, false, NULL, true
) AS version_with_unfilled_individual;
DO $unfilled_acceptance$
BEGIN
 IF (SELECT count(*) FROM public.allocations WHERE version=1) <> 1 OR
    (SELECT count(*) FROM public.allocations WHERE player_id IS NULL) <> 0 OR
    (SELECT count(*) FROM public.team_allocations WHERE version=1) <> 1 OR
    (SELECT count(*) FROM public.publications WHERE allocation_version=0) <> 1
 THEN RAISE EXCEPTION 'FAIL explicit unfilled prize wrote fabricated/partial awards'; END IF;
END $unfilled_acceptance$;
TRUNCATE public.allocations, public.team_allocations;
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

-- Production-compatible player import interaction. The live import RPC
-- deletes tournament players then inserts replacements in ONE transaction.
-- Real production has AFTER INSERT/UPDATE STATEMENT watermark triggers with
-- transition tables as well as BEFORE ROW hooks. The isolated fixture must
-- preserve these statements when exercising the new AFTER ROW V2 epoch trigger.
DO $import_trigger_contract$
BEGIN
  IF to_regclass('public.tournament_player_watermark') IS NULL THEN
    RAISE EXCEPTION 'FAIL missing production player watermark fixture';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.players'::regclass
      AND t.tgname = 'trg_players_bump_watermark_ins'
      AND t.tgenabled = 'O'
      AND pg_get_triggerdef(t.oid) LIKE '%FOR EACH STATEMENT%'
      AND pg_get_triggerdef(t.oid) LIKE '%REFERENCING NEW TABLE AS new_players%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.players'::regclass
      AND t.tgname = 'trg_players_bump_watermark_upd'
      AND t.tgenabled = 'O'
      AND pg_get_triggerdef(t.oid) LIKE '%FOR EACH STATEMENT%'
      AND pg_get_triggerdef(t.oid) LIKE '%REFERENCING NEW TABLE AS new_players%'
  ) THEN
    RAISE EXCEPTION 'FAIL missing production statement-level player hooks';
  END IF;
  IF (SELECT players_count_max FROM public.tournament_player_watermark
      WHERE tournament_id = '00000000-0000-4000-8000-000000000001') <> 4 THEN
    RAISE EXCEPTION 'FAIL seeded player import did not update production watermark';
  END IF;
END $import_trigger_contract$;

-- Simulate the real import RPC's DELETE-then-INSERT shape on the canary,
-- without executing any live import or introducing customer data. This is
-- intentionally rolled back after verifying mutation lineage.
BEGIN;
SELECT pg_catalog.set_config('qa.import_pre_digest',
 public.team_v2_source_fingerprint('00000000-0000-4000-8000-000000000001'::uuid), true);
DELETE FROM public.players
 WHERE tournament_id='00000000-0000-4000-8000-000000000001';
INSERT INTO public.players(id,tournament_id,points,club) VALUES
 ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001',5,'Club A'),
 ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001',4,'Club A'),
 ('00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000001',5,'Club B'),
 ('00000000-0000-4000-8000-000000000025','00000000-0000-4000-8000-000000000001',4,'Club B');
DO $import_lineage$
BEGIN
 IF (SELECT players_count_max FROM public.tournament_player_watermark
     WHERE tournament_id='00000000-0000-4000-8000-000000000001') <> 4 OR
    (SELECT count(*) FROM public.players
     WHERE tournament_id='00000000-0000-4000-8000-000000000001') <> 4 THEN
   RAISE EXCEPTION 'FAIL import replacement broke watermark/roster consistency';
 END IF;
 IF public.team_v2_source_fingerprint('00000000-0000-4000-8000-000000000001'::uuid)
    IS NOT DISTINCT FROM pg_catalog.current_setting('qa.import_pre_digest') THEN
   RAISE EXCEPTION 'FAIL same-data replacement retained stale scorer fingerprint';
 END IF;
END $import_lineage$;
ROLLBACK;
DO $import_rollback$
BEGIN
  IF (SELECT count(*) FROM public.players
      WHERE tournament_id='00000000-0000-4000-8000-000000000001') <> 4
  THEN RAISE EXCEPTION 'FAIL rollback changed preexisting players'; END IF;
END $import_rollback$;

-- ABA INSERT+DELETE: after two successful statements the prize rows are
-- byte-identical to the starting state. A source digest relying on row bytes
-- and surviving xmin values cannot detect this without a durable epoch.
SELECT pg_catalog.set_config(
 'qa.team_v2_deleted_prize_digest',
 public.team_v2_source_fingerprint('00000000-0000-4000-8000-000000000001'::uuid),
 false
);
INSERT INTO public.institution_prizes
 (id,group_id,place,cash_amount,has_trophy,has_medal,is_active)
 VALUES('00000000-0000-4000-8000-000000000020',
        '00000000-0000-4000-8000-000000000006',9,25,false,false,true);
DELETE FROM public.institution_prizes
 WHERE id='00000000-0000-4000-8000-000000000020';
DO $delete_aba$
BEGIN
 IF EXISTS (SELECT 1 FROM public.institution_prizes
    WHERE id='00000000-0000-4000-8000-000000000020') THEN
   RAISE EXCEPTION 'FAIL transient synthetic prize still exists';
 END IF;
 IF public.team_v2_source_fingerprint('00000000-0000-4000-8000-000000000001'::uuid)
    IS NOT DISTINCT FROM pg_catalog.current_setting('qa.team_v2_deleted_prize_digest')
 THEN RAISE EXCEPTION 'FAIL transient insert-delete kept original source token'; END IF;
 BEGIN
  PERFORM qa.submit_version(0,
   '00000000-0000-4000-8000-000000000010',9,false,
    pg_catalog.current_setting('qa.team_v2_deleted_prize_digest'));
  RAISE EXCEPTION 'FAIL transient insertion and deletion accepted as fresh';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'team_v2_source_changed' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM public.allocations) OR
    EXISTS (SELECT 1 FROM public.team_allocations) THEN
   RAISE EXCEPTION 'FAIL stale transient-source Save partially wrote awards';
 END IF;
END $delete_aba$;

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

-- Exact next-version Save must copy existing individual awards, not
-- let a caller replace any previously published individual winner.
SELECT qa.submit_version(
  1, '00000000-0000-4000-8000-000000000010', 9, false
) AS unchanged_winners_version_two;
DO $v2_history$
BEGIN
 IF (SELECT count(*) FROM public.allocations WHERE version=1) <> 1 OR
    (SELECT count(*) FROM public.allocations WHERE version=2) <> 1 OR
    (SELECT count(*) FROM public.team_allocations WHERE version=1) <> 1 OR
    (SELECT count(*) FROM public.team_allocations WHERE version=2) <> 1 OR
    (SELECT count(*) FROM public.publications WHERE allocation_version=0) <> 1 OR
    (SELECT player_id FROM public.allocations WHERE version=1 LIMIT 1)
       IS DISTINCT FROM (SELECT player_id FROM public.allocations WHERE version=2 LIMIT 1)
 THEN RAISE EXCEPTION 'FAIL follow-up Save overwrote historical winners/pin'; END IF;
END $v2_history$;

-- Two equal-score clubs are eligible for the same cash place.
-- A documented regulation-bound official ruling can correct the team winner
-- only by creating a NEW allocation version. Earlier team/individual versions
-- and their publication pins must remain bit-for-bit unchanged.
SELECT qa.submit_version(
  2, '00000000-0000-4000-8000-000000000010', 9, true, NULL, false, true
) AS official_ruling_version_three;
DO $official_changed_winner$
BEGIN
 IF (SELECT count(*) FROM public.allocations WHERE version IN (1,2,3)) <> 3 OR
    (SELECT count(*) FROM public.team_allocations WHERE version IN (1,2,3)) <> 3 OR
    (SELECT institution_key FROM public.team_allocations WHERE version=1) <> 'Club A' OR
    (SELECT institution_key FROM public.team_allocations WHERE version=2) <> 'Club A' OR
    (SELECT institution_key FROM public.team_allocations WHERE version=3) <> 'Club B' OR
    (SELECT count(*) FROM public.team_allocations
      WHERE version=3 AND ranking_snapshot ? 'ruling') <> 1 OR
    (SELECT count(*) FROM public.publications WHERE allocation_version=0) <> 1
 THEN RAISE EXCEPTION 'FAIL official ruling did not create protected new version'; END IF;
END $official_changed_winner$;
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
-- Deactivation is a kill switch for NEW V2 commits, NOT permission to
-- reopen obsolete writers against historical V2 cash awards.
UPDATE public.team_v2_canary_tournaments SET enabled=false
 WHERE tournament_id='00000000-0000-4000-8000-000000000001';
DO $deactivated_history$
BEGIN
  IF public.team_v2_canary_active('00000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL disabled canary still active';
  END IF;
  BEGIN
    PERFORM qa.submit_version(1);
    RAISE EXCEPTION 'FAIL disabled canary accepted fresh v2 Save';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'team_v2_canary_disabled' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.allocations(tournament_id,version,prize_id,player_id)
      VALUES('00000000-0000-4000-8000-000000000001',2,
             '00000000-0000-4000-8000-000000000003',
             '00000000-0000-4000-8000-000000000004');
    RAISE EXCEPTION 'FAIL deactivated V2 allowed legacy cash writer';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'team_v2_atomic_writer_required' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.team_allocations WHERE version=1) <> 1 OR
     (SELECT count(*) FROM public.allocations WHERE version=1) <> 1
  THEN RAISE EXCEPTION 'FAIL kill switch mutated saved version'; END IF;
END $deactivated_history$;
UPDATE public.team_v2_canary_tournaments SET enabled=true
 WHERE tournament_id='00000000-0000-4000-8000-000000000001';
RESET ROLE;
-- Restore blank synthetic state for separate parallel-sessions race test.
TRUNCATE public.allocations, public.team_allocations;
