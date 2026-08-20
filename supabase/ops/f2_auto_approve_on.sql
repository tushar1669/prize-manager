-- ============================================================================
-- f2_auto_approve_on.sql — TURN CONDITIONAL AUTO-APPROVAL ON
-- ============================================================================
--
--   supabase db query --linked -f supabase/ops/f2_auto_approve_on.sql
--
-- This is NOT a migration. Do not `migration repair` it. It is an operational
-- action against one row, and it takes effect the instant it commits.
--
-- Preconditions, all met 20 Aug 2026:
--   - f2_gate_checks.sql passes 24/24
--   - extract is at v47 and writing checker_version 1 verdicts
--   - submit_tournament_payment_claim carries the F2 gate, raise census 15
--
-- To reverse: supabase db query --linked -f supabase/ops/f2_auto_approve_off.sql
-- ============================================================================

UPDATE public.platform_feature_flags
   SET enabled    = true,
       updated_at = now()
 WHERE key = 'payment_auto_approve';

SELECT key, enabled, updated_at
  FROM public.platform_feature_flags
 WHERE key = 'payment_auto_approve';
