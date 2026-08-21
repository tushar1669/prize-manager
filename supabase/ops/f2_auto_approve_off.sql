-- ============================================================================
-- f2_auto_approve_off.sql — EMERGENCY BRAKE
-- ============================================================================
--
--   cd ~/Desktop/prize-manager
--   supabase db query --linked -f supabase/ops/f2_auto_approve_off.sql
--
-- Run this the moment anything looks wrong. It is safe to run at any time,
-- including when auto-approval is already off. It affects one row.
--
-- WHAT IT DOES: every new payment claim goes back to the pending queue for
-- manual approval, exactly as before F2. Nothing else changes.
--
-- WHAT IT DOES NOT DO: it does not take back Pro from anyone already
-- auto-approved. Those entitlements stay active. Revoking one is a separate
-- action — see f2_auto_approval_report.sql to find them first.
-- ============================================================================

UPDATE public.platform_feature_flags
   SET enabled    = false,
       updated_at = now()
 WHERE key = 'payment_auto_approve';

SELECT key, enabled, updated_at
  FROM public.platform_feature_flags
 WHERE key = 'payment_auto_approve';
