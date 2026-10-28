# Stage 4 — Explicit access rules for 4 internal tables

## Goal
Remove the 4 "RLS Enabled No Policy" notices by writing down the existing intent ("backend only") as explicit rules. No change to who can access what.

## Current live state (verified this turn)
| Table | RLS | Policies | anon / authenticated table grants | service_role access |
|---|---|---|---|---|
| platform_feature_flags | on | 0 | none | yes |
| tournament_player_watermark | on | 0 | none | yes |
| payment_invariant_verdicts | on | 0 | none | yes (11 rows, last write 2026-10-11) |
| payment_auto_approval_audit | on | 0 | none | yes |

App usage:
- Frontend never queries these tables directly; access goes through security-definer RPCs (`get_brochure_import_rollout_state`, `tournament_billing_basis`, `master_reset_player_watermark`, `record_auto_approval_audit`, `list_auto_approvals`, the watermark trigger).
- `extract` edge function inserts into `payment_invariant_verdicts` with the service role.

So these tables are already "deny all" for visitors and signed-in users. The linter only flags that the intent isn't written down.

## Change
One migration that adds one policy per table, scoped `TO service_role`, `FOR ALL USING (true) WITH CHECK (true)`, with a comment explaining backend-only intent.

- No new grants to anon or authenticated.
- service_role already bypasses RLS, so behavior does not change. The policy only documents intent.
- Security-definer RPCs and triggers keep working as before (they run as the function owner).

## Technical details
Forward SQL:
```sql
-- Stage 4: document backend-only intent. No anon/authenticated grants exist or are added.
CREATE POLICY "service_role only" ON public.platform_feature_flags       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role only" ON public.tournament_player_watermark  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role only" ON public.payment_invariant_verdicts   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role only" ON public.payment_auto_approval_audit  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

Rollback SQL:
```sql
DROP POLICY "service_role only" ON public.platform_feature_flags;
DROP POLICY "service_role only" ON public.tournament_player_watermark;
DROP POLICY "service_role only" ON public.payment_invariant_verdicts;
DROP POLICY "service_role only" ON public.payment_auto_approval_audit;
```

Verification:
- `pg_policies` shows exactly 1 policy per table, roles = `{service_role}`.
- `has_table_privilege('anon'|'authenticated', table, 'SELECT')` stays false for all 4.
- Linter: "RLS Enabled No Policy" count goes 4 → 0 (expected total 40 → 36).

## Risks
Very low. Nothing gets broader access. The only theoretical risk is a name clash with an existing policy, and there are 0 policies today.

## Not changed
Table data, RPCs, triggers, the extract function, billing or watermark logic, the allocation engine, frontend.

## Remaining after Stage 4
- 32 signed-in-callable security-definer functions. They're by design: each checks the caller itself.
- 3 visitor-callable functions needed for public results and access rules.
- Leaked-password protection, which you turn on in the Supabase Auth dashboard.
