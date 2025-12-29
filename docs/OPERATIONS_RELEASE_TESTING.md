# Operations, Release & Testing (repo-grounded)

## Release gate checklist (required)
- **Build:** `npm run build` (package.json → scripts.build).
- **Lint:** `npm run lint` (package.json → scripts.lint).
- **Unit tests:** `npm run test:unit` (package.json → scripts.test:unit).
- **Playwright smoke:** `npm run test:smoke` (package.json → scripts.test:smoke). If Playwright browsers are unavailable, record as not executed.
- **CI e2e subsets:** CI also runs `npm run test:swiss`, `npm run test:alloc`, `npm run test:ux`, plus `npm run assert:no-csv`. (package.json → scripts.*)

## Local testing commands (quick copy/paste)
```bash
npm run lint
npm run test:unit
npm run build
npm run test:smoke
```

## What “good” looks like (manual verification)
1) **Preview allocation succeeds** with non‑empty winners and no critical errors. (src/pages/ConflictReview.tsx → `allocateMutation`, lines ~184–226)
2) **Finalize writes allocations** and increments version. (supabase/functions/finalize/index.ts → `Deno.serve`, lines ~150–214)
3) **Public results render** from published tournaments only (no drafts). (supabase/migrations/20251226184159_c2405569-73f6-4622-827f-3183c54b8645.sql → `published_tournaments` view, lines ~6–28; src/pages/PublicResults.tsx → `PublicResults`, lines ~28–120)
4) **Team prizes appear** when configured and active. (supabase/functions/allocateInstitutionPrizes/index.ts → `Deno.serve`, lines ~278–606; src/components/team-prizes/useTeamPrizeResults.ts → `useTeamPrizeResults`, lines ~74–152)

## Playwright coverage map (selected suites)
- `e2e/allocate-flow.spec.ts`: Allocation review flow.
- `e2e/allocator-null-safety.spec.ts`: Allocator null‑safety scenarios.
- `e2e/allocator-tie-break.spec.ts`: Tie‑break determinism.
- `e2e/public-smoke.spec.ts`: Public navigation smoke.
- `e2e/import-conflicts.spec.ts`: Import conflict review.

## Common pitfalls
- **Playwright browsers missing:** `pretest:smoke` runs `scripts/ensure-playwright-browsers.mjs`. If `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is set, browsers are not installed and the smoke suite will fail. (scripts/ensure-playwright-browsers.mjs → skipDownload logic)
github/workflows/ci.yml → CSV Guard; package.json → scripts)
