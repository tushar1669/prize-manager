# Deploy and Publish Runbook

This runbook splits **technical deployment** from **organizer publishing**. All steps are grounded in repository scripts/routes.

## A) Deploy sequence (app + DB + edge functions)

## 1. Pre-deploy quality gate
Run:
```bash
npm run lint
npm run test:unit
npm run build
npm run test:smoke
```

CI also runs `test:swiss`, `test:alloc`, `test:ux`, and `assert:no-csv` (`.github/workflows/ci.yml`, `package.json`).

## 2. Apply migrations
Use Supabase CLI in your target project.

Canonical command in this repo is **UNKNOWN** (team-specific). Verify against your environment and the migration set in `supabase/migrations/`.

## 3. Deploy edge functions
Functions in scope (`supabase/functions/*`):
- `allocatePrizes`
- `allocateInstitutionPrizes`
- `finalize`
- `generatePdf`
- `parseWorkbook`
- `pmPing`
- `publicTeamPrizes`

JWT expectations are configured in `supabase/config.toml` and must remain aligned with deployment.

## 4. Deploy/publish frontend
Frontend deploy mechanism is **UNKNOWN** in repo (no single hosting script). Verify with your hosting platform process.

## 5. Post-deploy smoke checks
- Auth: `/auth` and `/auth/callback` (`src/App.tsx`, `src/pages/AuthCallback.tsx`).
- Private flow: `/t/:id/import` -> `/t/:id/review` -> `/t/:id/finalize`.
- Public flow: `/public`, `/p/:slug`, `/p/:slug/results`.
- Edge function health: UI component `EdgeFunctionStatus` checks `/functions/v1/pmPing` and function versions.

## B) Organizer publish workflow (Lovable app usage)

These are in-product steps for operators using the deployed app.

1. Run preview in `/t/:id/review` (calls `allocatePrizes`).
2. Finalize from review (`finalize` function) and move to `/t/:id/finalize`.
3. Publish from finalize (RPC `publish_tournament`, then status/version updates), then redirect to `/t/:id/publish`.
4. Confirm generated public URL is shown in Publish Success (`src/pages/PublishSuccess.tsx`).

## C) Rollback checklist
- Frontend rollback process: **UNKNOWN** (hosting dependent).
- Database rollback: use migration rollback strategy for your Supabase environment (**UNKNOWN**, team policy).
- Edge function rollback: redeploy last known-good function revisions.
- Validate:
  - Private routes still work for organizers.
  - Public routes only show published tournaments (`src/pages/PublicHome.tsx`, `src/pages/PublicResults.tsx`).

## D) Ownership handoff checklist
- Release owner records commit SHA + deployed environment (**UNKNOWN location; verify team runbook**).
- QA owner records smoke result for private/public flows.
- Organizer confirms tournament publish URL and version.

## Cross-links
- `docs/OPERATIONS_RELEASE_TESTING.md`
- `docs/PUBLIC_PAGES_QA.md`
- `docs/TROUBLESHOOTING.md`
