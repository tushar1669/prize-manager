# Stage 3 — Lock admin / signed-in-only database functions away from visitors

## Goal
Stop logged-out visitors (anon) from calling functions that only make sense for signed-in organizers or the master admin. Signed-in access stays as-is, because the app calls these from the browser and each function already checks the caller (`is_master()` / `auth.uid()`) inside. No behavior change for real users.

## Live state (read today)
14 security-definer functions are callable by anon. Classified:

**Revoke from anon (require sign-in; internally reject anon anyway)**
- admin_create_coupon, admin_list_coupons, detect_missing_team_snapshots (master-only)
- import_replace_players, list_my_tournaments, redeem_coupon_for_tournament, apply_coupon_for_tournament
- get_or_create_my_referral_code, bootstrap_master

**Revoke from anon AND authenticated (backend/cron only)**
- expire_stuck_extraction_documents — no caller check at all; only a scheduled job should run it. Verify cron/edge usage first; keep service_role.

**Keep anon (needed)**
- get_public_tournament_results — public results page.
- has_role, is_master — used inside RLS policies evaluated for anon reads of published data; revoking breaks public pages.

**Flag, do not change in Stage 3**
- import_dedup_candidates — callable by anon, no `auth.uid()`/ownership check found. Needs source review; candidate for Stage 3b (add ownership check or revoke anon).

## Steps
1. Pre-check: grep frontend/edge functions for every RPC above to confirm no logged-out caller; check `cron.job` for expire_stuck_extraction_documents.
2. One migration: `REVOKE EXECUTE ... FROM anon` (and PUBLIC) for the 9 listed; additionally FROM authenticated for expire_stuck_extraction_documents; ensure `GRANT EXECUTE ... TO authenticated, service_role` remains for the 9.
3. Verify: re-run grant query (anon=false for the 10), rerun linter (expect ~52 → ~42), confirm public results page still loads signed-out.

## Rollback
`GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO anon;` per function (and to authenticated for the cron one).

## Not touched
Function bodies, RLS policies, allocation engine, payment/publish logic, data, frontend code. The 33 signed-in warnings for master functions remain by design (they self-check `is_master()`); Stage 4 (internal table policies) and leaked-password toggle stay separate.
