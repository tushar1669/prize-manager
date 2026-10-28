# Security linter fix — Stage 1 + Stage 2 (one focused migration)

## Goal
Clear 2 "search path mutable" warnings and remove direct API access to 8 internal-only functions (7 triggers + 1 helper). No app behavior change.

## Current live state (verified this turn)
| Function | Security definer | search_path | anon / authenticated can call | Called by |
|---|---|---|---|---|
| normalize_utr(text) | no | NOT set | yes | submit_tournament_payment_claim, utr_active_duplicate_exists, unique UTR index |
| tournament_pro_tier(integer) | no | NOT set | yes | expected_payment_amount_inr, get_tournament_access_state, get_tournament_pro_price |
| handle_new_user() | yes | public | yes / yes | auth signup trigger |
| players_normalize_dob_trigger() | yes | public | yes / yes | players trigger |
| guard_publication_requires_team_snapshots() | yes | public | yes / yes | publications trigger |
| enforce_team_snapshots_on_publication_activate() | yes | public | yes / yes | publications trigger |
| tg_coupons_set_snapshot() | yes | public, auth | yes / yes | coupons trigger |
| update_updated_at_column() | yes | public | yes / yes | updated_at triggers |
| set_updated_at() | yes | public | yes / yes | updated_at triggers |
| normalize_dob_input(text) | yes | public | yes / yes | only players_normalize_dob_trigger |

- No frontend or edge function code calls any of these 10 via RPC (searched `src/` and `supabase/functions/`).
- None appear in any RLS policy.

## Why this is safe
- Postgres checks EXECUTE on a trigger function only when the trigger is created, not each time it fires. Signup, player import, publish, coupon and timestamp triggers keep working.
- `normalize_dob_input` is only called from a security-definer trigger (it runs as the owner), so removing client access does not affect it.
- Fixing search_path does not change results, and the UTR unique index is unaffected.
- `service_role` and `postgres` keep access.

## Forward SQL
```sql
-- Stage 1: fixed search_path
ALTER FUNCTION public.normalize_utr(text)              SET search_path TO 'public', 'pg_catalog';
ALTER FUNCTION public.tournament_pro_tier(integer)     SET search_path TO 'public', 'pg_catalog';

-- Stage 2: internal-only functions — not callable via the API
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.players_normalize_dob_trigger()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_publication_requires_team_snapshots()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_team_snapshots_on_publication_activate()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_coupons_set_snapshot()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at()                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_dob_input(text)                         FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.normalize_dob_input(text) TO service_role;
```

## Rollback SQL
```sql
ALTER FUNCTION public.normalize_utr(text)          RESET search_path;
ALTER FUNCTION public.tournament_pro_tier(integer) RESET search_path;
GRANT EXECUTE ON FUNCTION public.handle_new_user(), public.players_normalize_dob_trigger(),
  public.guard_publication_requires_team_snapshots(), public.enforce_team_snapshots_on_publication_activate(),
  public.tg_coupons_set_snapshot(), public.update_updated_at_column(), public.set_updated_at(),
  public.normalize_dob_input(text) TO PUBLIC, anon, authenticated;
```

## Verification
1. Re-run the privilege query: the 8 functions show anon=false, authenticated=false; the 2 functions show a fixed search_path.
2. Re-run the linter: expect 2 search-path warnings gone and the anon/authenticated counts each down by 8 (70 → about 52).
3. Smoke checks: `select public.normalize_utr(' ab-12 ')`, `select * from public.tournament_pro_tier(200)` return the same values as before.
4. Manual QA (you): sign up a test account, import players with a DOB, publish a tournament. Each should behave as it does today.

## Not changed
Stage 3 (master RPCs), Stage 4 (table policies), the leaked-password setting, the allocation engine, app code, RLS, and data.

## Files
One new migration only.
