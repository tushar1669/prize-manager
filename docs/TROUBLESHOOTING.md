# Troubleshooting Playbooks

Scenario-based first response for common failures.

## 1) Preview/allocation failures (`/t/:id/review`)
**Symptoms**
- Preview action fails or returns empty/unexpected winners.
- Coverage/unfilled diagnostics do not match expectations.

**Likely causes**
- Edge function invocation/auth issue for `allocatePrizes`.
- Tournament data/rule config mismatch.
- Prior import data quality issues.

**Where to inspect**
- UI invocation flow: `src/pages/ConflictReview.tsx`.
- Edge function: `supabase/functions/allocatePrizes/index.ts`.
- Import quality context: `src/pages/PlayerImport.tsx`.

**First-response steps**
1. Re-run preview and capture exact error text.
2. Verify session/auth is active.
3. Check edge function health widget (`src/components/EdgeFunctionStatus.tsx`).
4. Export Coverage + RCA to isolate conflicts/unfilled causes.

---

## 2) Build/dev startup failures
**Symptoms**
- `npm ci`, `npm run dev`, or `npm run build` fails.

**Likely causes**
- Node version mismatch (`package.json` requires `>=20 <21`).
- Registry/proxy/network issues during install.
- Dependency lock drift.

**Where to inspect**
- `package.json` scripts + engines.
- `scripts/bootstrap.sh` install diagnostics.

**First-response steps**
1. Run `npm run bootstrap`.
2. If install fails, use mirror/registry guidance printed by bootstrap script.
3. Re-run `npm run build` once install succeeds.

---

## 3) Auth callback/session problems (`/auth/callback`)
**Symptoms**
- Redirect loops, callback errors, or missing session after sign-in.

**Likely causes**
- Callback token parsing/session exchange issues.
- Invalid/expired callback params.
- Environment mismatch for auth configuration (**UNKNOWN in repo, verify deployment config**).

**Where to inspect**
- `src/pages/AuthCallback.tsx`.
- `docs/AUTH_CALLBACK.md`.

**First-response steps**
1. Reproduce using a fresh login session.
2. Inspect callback URL params/hash and console errors.
3. Validate redirect path resolves to protected route after callback.

---

## 4) Edge function authorization/ownership failures
**Symptoms**
- Function returns authorization/forbidden errors.
- Operation works for one user but not another.

**Likely causes**
- JWT verification mismatch per function.
- Missing role/ownership check in caller context.
- Service-role function behavior depends on tournament ownership validation.

**Where to inspect**
- `supabase/config.toml` (`verify_jwt` per function).
- Function entrypoints under `supabase/functions/*/index.ts`.
- Role guards in `src/components/ProtectedRoute.tsx` and `src/hooks/useUserRole.tsx`.
- `docs/SECURITY_ACCESS_CONTROL.md`.

**First-response steps**
1. Confirm affected route is protected as expected.
2. Confirm function has expected JWT policy in config.
3. Confirm user owns the tournament/resource being modified.
4. For master/admin-only actions, verify master role path is enforced server-side.

---

## 5) Export failures (Coverage/RCA/PDF/XLSX)
**Symptoms**
- Export button does nothing or file is empty/missing.

**Likely causes**
- No preview data yet for review exports.
- RCA export skipped because no unfilled rows.
- Popup blocking for print/PDF flow.

**Where to inspect**
- Coverage export: `src/utils/allocationCoverageExport.ts`.
- RCA export: `src/utils/allocationRcaExport.ts`.
- Finalize export/PDF flow: `src/pages/Finalize.tsx`.

**First-response steps**
1. Confirm preview completed in current session.
2. Check for unfilled rows before expecting RCA output.
3. Allow popups for print/PDF flows.
4. Retry export and inspect console warnings.

## Related docs
- `docs/AUTH_CALLBACK.md`
- `docs/SECURITY_ACCESS_CONTROL.md`
- `docs/EXPORTS_COVERAGE_VS_RCA.md`
- `docs/KEY_USER_FLOWS.md`
