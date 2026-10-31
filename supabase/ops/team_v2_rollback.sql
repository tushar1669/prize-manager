-- Team V2 rollback — removes every object added by migrations
--   20261025193000_team_tiebreak_v2_additive.sql
--   20261025194000_team_v2_canary_activation.sql
--   20261027080000_team_v2_adjudicated_atomic_version.sql
--   20261027110000_team_v2_source_epoch.sql
-- One transaction. Never deletes award rows or publications.
--
-- STEP 1 (always safe): fence off V2 and restore legacy behaviour for every
-- tournament by removing triggers, functions and the canary allowlist.
-- STEP 2 (guarded): the two additive columns are dropped ONLY when they hold
-- no V2 data. If V2 awards or rules exist, the columns are KEPT (they are
-- inert without the functions) so saved V2 history is never destroyed.
--
-- After running: also unset the Edge Function secret ENABLE_TEAM_V2_ATOMIC_SAVE
-- and delete the four ledger rows (see bottom) so the repo and ledger agree.
BEGIN;

DROP TRIGGER IF EXISTS team_v2_epoch_categories         ON public.categories;
DROP TRIGGER IF EXISTS team_v2_epoch_prizes             ON public.prizes;
DROP TRIGGER IF EXISTS team_v2_epoch_players            ON public.players;
DROP TRIGGER IF EXISTS team_v2_epoch_rule_config        ON public.rule_config;
DROP TRIGGER IF EXISTS team_v2_epoch_institution_groups ON public.institution_prize_groups;
DROP TRIGGER IF EXISTS team_v2_epoch_institution_prizes ON public.institution_prizes;
DROP TRIGGER IF EXISTS protect_v2_individual_allocations ON public.allocations;
DROP TRIGGER IF EXISTS protect_v2_team_allocations       ON public.team_allocations;

DROP FUNCTION IF EXISTS public.team_v2_record_source_change();
DROP FUNCTION IF EXISTS public.reject_team_v2_legacy_allocation();
DROP FUNCTION IF EXISTS public.commit_team_v2_adjudicated_version(uuid, integer, uuid, jsonb, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.team_v2_source_fingerprint(uuid);
DROP FUNCTION IF EXISTS public.team_v2_canary_active(uuid);
DROP TABLE    IF EXISTS public.team_v2_canary_tournaments;

DO $guarded_columns$
DECLARE g bigint := 0; a bigint := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
             AND table_name='institution_prize_groups' AND column_name='ranking_rules') THEN
    EXECUTE 'SELECT count(*) FROM public.institution_prize_groups WHERE ranking_rules IS NOT NULL' INTO g;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
             AND table_name='team_allocations' AND column_name='ranking_snapshot') THEN
    EXECUTE 'SELECT count(*) FROM public.team_allocations WHERE ranking_snapshot IS NOT NULL' INTO a;
  END IF;
  IF g = 0 AND a = 0 THEN
    ALTER TABLE public.team_allocations DROP COLUMN IF EXISTS ranking_snapshot;
    ALTER TABLE public.institution_prize_groups DROP COLUMN IF EXISTS ranking_rules;
    RAISE NOTICE 'team_v2_rollback: columns dropped (no V2 data present)';
  ELSE
    RAISE NOTICE 'team_v2_rollback: columns KEPT — % groups with rules, % V2 award rows', g, a;
  END IF;
END $guarded_columns$;

-- Self-verification: no V2 function, trigger or table may remain.
DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname='public' AND (p.proname LIKE 'team_v2_%'
               OR p.proname IN ('commit_team_v2_adjudicated_version','reject_team_v2_legacy_allocation')))
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal
               AND (tgname LIKE 'team_v2_epoch_%' OR tgname LIKE 'protect_v2_%'))
     OR to_regclass('public.team_v2_canary_tournaments') IS NOT NULL THEN
    RAISE EXCEPTION 'team_v2_rollback: V2 objects remain — transaction aborted';
  END IF;
END $verify$;

COMMIT;

-- Ledger cleanup (run after COMMIT, production only):
-- DELETE FROM supabase_migrations.schema_migrations
--  WHERE version IN ('20261025193000','20261025194000','20261027080000','20261027110000');
