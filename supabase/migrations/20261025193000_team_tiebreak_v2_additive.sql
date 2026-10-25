-- Team Prize ranking v2 — source values, editable rule order and versioned audit.
-- ADDITIVE ONLY: no existing rows changed, no default/backfill, no RLS/auth changes.
-- Do not apply until release ordering and deployment coordination are confirmed.
-- Existing team_allocations.player_snapshot and publications.allocation_version
-- remain load-bearing historical records.
BEGIN;

-- The original Swiss-Manager TB1..TBn numeric values keyed by source ordinal.
-- NULL is distinct from {} and means this import had no persisted TB metadata.
ALTER TABLE public.players
  ADD COLUMN individual_tiebreaks jsonb;

-- Organizer-declared ranking order + verified metric identity/direction/source.
-- NULL means legacy configuration; never interpret it as publication approval.
ALTER TABLE public.institution_prize_groups
  ADD COLUMN ranking_rules jsonb;

-- Optional new-version audit trace; legacy allocations remain untouched.
ALTER TABLE public.team_allocations
  ADD COLUMN ranking_snapshot jsonb;

COMMENT ON COLUMN public.players.individual_tiebreaks IS
  'v2 individual source TB ordinals/values and import provenance; never infer metric meaning from TB number';
COMMENT ON COLUMN public.institution_prize_groups.ranking_rules IS
  'v2 owner-declared ordered team tie-break criteria; checked by team-only server allocation path';
COMMENT ON COLUMN public.team_allocations.ranking_snapshot IS
  'v2 immutable allocation-time criteria and comparison audit; null on legacy records';

COMMIT;

-- Read-only post-deployment check (must be performed before any new v2 import):
-- SELECT table_name,column_name,data_type FROM information_schema.columns
-- WHERE table_schema='public' AND
-- ((table_name='players' AND column_name='individual_tiebreaks') OR
--  (table_name='institution_prize_groups' AND column_name='ranking_rules') OR
--  (table_name='team_allocations' AND column_name='ranking_snapshot'));
--
-- Rollback is NONDESTRUCTIVE ONLY BEFORE any v2 values are written:
-- SELECT
-- (SELECT count(*) FROM public.players WHERE individual_tiebreaks IS NOT NULL) AS p,
-- (SELECT count(*) FROM public.institution_prize_groups WHERE ranking_rules IS NOT NULL) AS g,
-- (SELECT count(*) FROM public.team_allocations WHERE ranking_snapshot IS NOT NULL) AS a;
-- If any count is nonzero, STOP: archive and reconcile the new data and version
-- dependencies first; never drop a column containing live/published decisions.
-- If all are zero, guarded rollback:
-- BEGIN;
-- ALTER TABLE public.team_allocations DROP COLUMN ranking_snapshot;
-- ALTER TABLE public.institution_prize_groups DROP COLUMN ranking_rules;
-- ALTER TABLE public.players DROP COLUMN individual_tiebreaks;
-- COMMIT;
