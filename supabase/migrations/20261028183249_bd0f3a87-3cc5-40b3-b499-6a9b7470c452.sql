-- Stage 1: lock search_path on two non-definer helpers
ALTER FUNCTION public.normalize_utr(text) SET search_path TO 'public', 'pg_catalog';
ALTER FUNCTION public.tournament_pro_tier(integer) SET search_path TO 'public', 'pg_catalog';

-- Stage 2: internal-only (trigger/helper) functions must not be callable via the Data API.
-- Trigger functions are permission-checked only at CREATE TRIGGER, so triggers keep firing.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.players_normalize_dob_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_publication_requires_team_snapshots() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_team_snapshots_on_publication_activate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_coupons_set_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_dob_input(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_dob_input(text) TO service_role;

-- Rollback:
-- ALTER FUNCTION public.normalize_utr(text) RESET search_path;
-- ALTER FUNCTION public.tournament_pro_tier(integer) RESET search_path;
-- GRANT EXECUTE ON FUNCTION <the 8 functions above> TO PUBLIC, anon, authenticated;