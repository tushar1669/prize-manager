# Getting Started (Dev)

This guide is repo-grounded and intentionally conservative. If something is not explicit in this repo, it is marked **UNKNOWN** with a file to verify.

## 1) Prerequisites
- Node.js: `>=20 <21`. Source: `package.json` `engines.node`.
- npm: required for `npm ci` and all scripts.
- Optional: Supabase CLI for migration/function deployment workflows (see `docs/DEPLOY_AND_PUBLISH.md`).

## 2) Bootstrap options
### Standard
```bash
npm ci
```

### Scripted bootstrap (adds common registry diagnostics)
```bash
npm run bootstrap
```

The bootstrap script runs `npm ci` and prints guidance for registry/proxy failures. Source: `scripts/bootstrap.sh`.

## 3) Environment setup
### Required for app runtime
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Type declarations live in `src/vite-env.d.ts`. Import/runtime usage is visible in `src/pages/PlayerImport.tsx`.

### Optional feature flags
Defined in `src/vite-env.d.ts` and consumed by `src/utils/featureFlags.ts`:
- `VITE_IMPORT_LOGS_ENABLED`
- `VITE_IMPORT_DEDUP_ENABLED`
- `VITE_SERVER_IMPORT_ENABLED`
- `VITE_IMPORT_SIZE_THRESHOLD_MB`
- `VITE_ENABLE_REACT_PDF` (consumed in feature flags helper)
- `VITE_ALLOC_VERBOSE_LOGS` (consumed in feature flags helper)

### Source of truth note
`src/integrations/supabase/client.ts` currently hardcodes URL/key values in this repo snapshot. Verify deployment values in your environment/secrets manager before release.

### Debug flags
- **`?debug_referrals=1`**: Adds `[referral-hook]` console logs showing referral capture source, code, and RPC result. Works in dev/preview environments.

## 4) Run locally
```bash
npm run dev
```

Key routes are declared in `src/App.tsx`:
- `/t/:id/import` (Player Import)
- `/t/:id/review` (Conflict Review)
- `/t/:id/finalize` (Finalize / publish entry)
- `/t/:id/upgrade` (Pro upgrade — UPI or coupon)
- `/public`, `/p/:slug`, `/p/:slug/results` (public surfaces)
- `/account` (profile, referrals, rewards)
- `/reset-password` (password reset after email link)

Admin routes (master-only):
- `/master-dashboard` — organizer approvals + payment approvals
- `/admin/coupons` — coupon management + analytics
- `/admin/martech` — platform growth funnels + drilldowns
- `/admin/audit` — searchable audit event log
- `/admin/tournaments` — tournament management
- `/admin/users` — user approvals

## 5) Quick sanity path (before opening PR)
```bash
npm run build
```

Recommended additional checks (required by repo AGENTS before merging):
```bash
npm run lint
npm run test:unit
npm run test:smoke
```

## 6) First-run failures
- Dependency install issues (registry/proxy): see script guidance in `scripts/bootstrap.sh`.
- Auth redirect/session issues: see [Auth Callback](./AUTH_CALLBACK.md) and [Troubleshooting](./TROUBLESHOOTING.md).
- Preview/edge function failures: see [Troubleshooting](./TROUBLESHOOTING.md) and `src/components/EdgeFunctionStatus.tsx`.
- Public pages not visible: verify publish flow at `/t/:id/finalize` and `/t/:id/publish`.
- Referral not captured: see [Troubleshooting](./TROUBLESHOOTING.md) playbook #6 and use `?debug_referrals=1`.
- Coupon issues: see [Coupons Lifecycle](./COUPONS_LIFECYCLE.md) and [Troubleshooting](./TROUBLESHOOTING.md) playbook #7.
