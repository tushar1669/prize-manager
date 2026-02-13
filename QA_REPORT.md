> **Archive Snapshot:** This QA report is historical point-in-time evidence and is not the operational source of truth.

# QA Report: Prize-Manager Release Audit

**Report Generated:** 2026-02-09
**Scope:** Build/test health, routing inventory, asset audit, button/link wiring, Supabase/Edge functions, performance/DX

---

## 1) Automated checks (from repo root)

| Command | Result | Notes |
| --- | --- | --- |
| `npm ci` | ✅ Pass | Warnings: unsupported engine (expects Node 20), deprecated `node-domexception`, proxy env warning. |
| `npm run build` | ✅ Pass | Warning: Browserslist data outdated; Rollup chunk >500kB warning (largest chunk ~540kB, xlsx chunk ~425kB). |
| `npm run test:unit` | ✅ Pass | 27 files, 246 tests. |
| `npm run test:smoke` | ⚠️ Failed | Playwright dependency install failed (apt 502 from proxy). See RCA below. |
| `npm run lint` | ❌ Failed | `@typescript-eslint/no-explicit-any` error in `supabase/functions/parseWorkbook/index.ts`. Warnings in `ImportQualityNotes.tsx` and `PlayerImport.tsx`. |

### RCA (failed checks)
- **`npm run test:smoke`**: failure occurs during Playwright dependency installation due to apt 502 from proxy for `fonts-freefont-ttf`. This is an environment/network dependency issue, not a test failure. Release impact depends on CI image availability. (See logs from `scripts/ensure-playwright-browsers.mjs`.)
- **`npm run lint`**: lint error is code-level and release-blocking if CI enforces lint. The error is in a serverless function file (`parseWorkbook`) using `any`.

---

## 2) Route & screen inventory

> Source: `src/App.tsx` and primary page components. Auth gating derives from `ProtectedRoute` usage.

| Route | Component | Auth gating | Primary buttons / actions |
| --- | --- | --- | --- |
| `/` | `PublicHome` | Public | Retry load; “View Details” links to `/p/:slug`. |
| `/p/:slug` | `PublicTournamentDetails` | Public | Brochure link; Chess Results / External Results outbound links; back navigation. |
| `/p/:slug/results` | `PublicResults` | Public | Brochure link; “View Details” to `/p/:slug`. |
| `/p/:slug/details` | `PublicTournamentDetails` | Public | Same as `/p/:slug` (duplicate path to same component). |
| `/t/:id/public` | `PublicWinnersPage` | Public | Tabs (Category cards/table/poster/arbiter); brochure link; back link. |
| `/auth` | `Auth` | Public | Sign-in / email actions. |
| `/auth/callback` | `AuthCallback` | Public | Email verification / resend actions. |
| `/auth/bootstrap` | `Bootstrap` | Protected | Claim master role. |
| `/pending-approval` | `PendingApproval` | Protected (unverified allowed) | Approval status / support path. |
| `/dashboard` | `Dashboard` | Protected | Create tournament; master approvals/admin; resume tournament. |
| `/account` | `Account` | Protected | Profile updates. |
| `/t/:id/setup` | `TournamentSetup` | Protected | Save tournament details; create/edit categories & prizes; proceed to next step. |
| `/t/:id/order-review` | `CategoryOrderReview` | Protected | Reorder categories; save order; navigate back to setup. |
| `/t/:id/import` | `PlayerImport` | Protected | Upload/parse players; validate; import; proceed. |
| `/t/:id/review` | `ConflictReview` | Protected | Preview allocation; accept/override conflicts; commit/finalize. |
| `/t/:id/finalize` | `Finalize` | Protected | Export winners (PDF/XLSX); publish; finalize. |
| `/t/:id/final/:view` | `FinalPrizeView` | Protected | View/export final prize results. |
| `/t/:id/publish` | `PublishSuccess` | Protected | Copy/share public link. |
| `/t/:id/settings` | `Settings` | Protected | Save tournament settings. |
| `/master-dashboard` | `MasterDashboard` | Protected (master only) | Approve/reject organizers; verification toggles. |
| `/admin/tournaments` | `AdminTournaments` | Protected (master only) | Hard-delete tournaments; cleanup data. |
| `/root/:secret` | `SpecialLanding` | Protected | Open master dashboard. |
| `*` | `NotFound` | Public | Home link. |

---

## 3) 404-proof static asset audit

Hardcoded asset references (from `src/`):

| Reference | Expected `public/` path | Exists? | Risk notes |
| --- | --- | --- | --- |
| `/brand/prize-manager-icon.png` | `public/brand/prize-manager-icon.png` | ✅ Yes | Used in `BrandLogo`. |
| `/brand/prize-manager-logo-transparent-cropped.png` | `public/brand/prize-manager-logo-transparent-cropped.png` | ✅ Yes | Used in `BrandLogo`. |

No other `/help/` or `/brand/` references found in `src`. Public favicon assets exist but are not referenced directly in `src`.

---

## 4) Button/link wiring audit (focus areas)

**Setup / Tournament Wizard**
- `TournamentSetup` provides primary actions for saving tournament metadata and category/prize definitions; buttons are correctly disabled during pending mutations.
- `CategoryOrderReview` provides “Save order” and “Back to setup” buttons with disabled states during save.

**Player Import**
- `PlayerImport` includes “Parse”, “Import”, and “Proceed” actions with disabled states during parsing/import. No placeholder handlers detected.

**Allocation review**
- `ConflictReview` uses explicit “Preview” and “Commit” flows; buttons are disabled when allocations are pending or when there are no players/prizes.
- Manual conflict resolution actions (`Accept`, `Override`, `Accept All`) are wired to mutation handlers.

**Finalize/export**
- `Finalize` includes export (PDF/XLSX) and publish actions with disabled states when data is missing or mutation is pending.

**Potential gaps**
- No TODO/placeholder handlers detected in these flows. Buttons are generally guarded by loading/validation flags.

---

## 5) Supabase & Edge Functions audit

### Edge function invocations (client)

| Function | Calling file(s) | Auth headers | Payload shape |
| --- | --- | --- | --- |
| `allocatePrizes` | `src/pages/ConflictReview.tsx` | `Authorization: Bearer <access_token>` | `{ tournamentId, ruleConfigOverride?, overrides?, dryRun? }` |
| `finalize` | `src/pages/ConflictReview.tsx`, `src/pages/Finalize.tsx` | `Authorization: Bearer <access_token>` | `{ tournamentId, winners }` |
| `parseWorkbook` | `src/hooks/useExcelParser.tsx` | `Authorization: Bearer <access_token>`, `x-tournament-id`, `x-file-name`, `x-sha256` | Binary file body |
| `publicTeamPrizes` | `src/hooks/usePublicTeamPrizes.ts` | None | `{ tournament_id?, slug? }` |
| `allocateInstitutionPrizes` | `src/components/team-prizes/useTeamPrizeResults.ts` | `Authorization: Bearer <access_token>` | `{ tournament_id }` |
| Ping status | `src/components/EdgeFunctionStatus.tsx` | auth + anon key for `parseWorkbook` ping | `{ ping: true }` or `?ping=1` |

### Edge function server-side authorization notes
- **Service-role functions**: `allocatePrizes`, `finalize`, `parseWorkbook`, `allocateInstitutionPrizes`, `publicTeamPrizes` use service-role keys and enforce ownership checks (tournament owner or master) before writes; publicTeamPrizes checks `tournaments.is_published`.
- **PII logging risk**: `allocatePrizes` includes debug logging of player names/genders for a specific tournament ID (should be removed or anonymized).

### Supabase tables accessed (client)
- `tournaments`, `categories`, `prizes`, `players`, `allocations`, `conflicts`, `rule_config`, `publications`, `import_logs`, `institution_prize_groups`, `institution_prizes`.
- Public pages primarily read from `published_tournaments` view and `tournaments` with `is_published` filters.

### Supabase tables accessed (edge functions)
- `tournaments`, `categories`, `players`, `rule_config`, `allocations`, `conflicts`, `institution_prize_groups`, `institution_prizes`, `publications`.

### Select / pagination flags
- **Unpaginated reads**: public results and team prize functions load all players/prizes for a tournament without pagination; acceptable for small tournaments but will scale poorly for large datasets.
- **`select('*')`**: `publicTeamPrizes` and `allocateInstitutionPrizes` use `select('*')` for institution prize data; consider scoping to required columns for performance and security.

---

## 6) Performance + DX hotspots

- **Bundle size warning**: build shows a main chunk >500kB (and `xlsx` chunk ~425kB). This suggests heavy client-side parsing/export logic; consider dynamic imports for `xlsx` and heavy pages like Player Import.
- **Public results heavy joins**: `PublicResults` fetches allocations, players, prizes, categories sequentially (no pagination) and logs sample data; potential runtime slowdown for large tournaments.
- **Lint error blocks refactors**: `parseWorkbook` uses `any` (lint error) and will fail CI if lint is enforced.

---

## 7) Issues list (prioritized)

### P0 (release-blocking)
1) **`npm run lint` fails on `parseWorkbook`**
   - Evidence: `@typescript-eslint/no-explicit-any` error in `supabase/functions/parseWorkbook/index.ts`.
   - **Fix plan**:
     - Update `SupabaseClientLike` and `ensureTournamentAccess` typing to avoid `any` (use typed interfaces or `unknown` with narrow casts).
     - Run `npm run lint`.

### P1 (high priority)
1) **PII logging in production paths**
   - Evidence: `allocatePrizes` logs player names/genders in gender debug block; `PublicResults` logs sample results containing `playerName`.
   - **Fix plan**:
     - Remove or anonymize player identifiers in logs; gate debug logs behind a secure admin-only flag and never log names or PII.
     - Run `npm run lint` and `npm run test:unit`.

2) **Smoke tests not runnable due to Playwright dependency install failure**
   - Evidence: `npm run test:smoke` fails during apt dependency install (502 from proxy).
   - **Fix plan**:
     - Pre-bake Playwright dependencies into the CI image or mirror apt dependencies; re-run `npm run test:smoke`.

### P2 (medium priority)
1) **Duplicate public route paths**
   - Evidence: `/p/:slug` and `/p/:slug/details` both map to `PublicTournamentDetails`.
   - **Fix plan**:
     - Consider removing the redundant route or add a redirect if needed for backwards compatibility; verify `npm run build`.

2) **Unpaginated public reads**
   - Evidence: public pages load all allocations/players/prizes for a tournament in one go.
   - **Fix plan**:
     - Add pagination or server-side aggregation for public results; re-run `npm run test:unit`.

---

## 8) 10-minute manual release QA script

1) **Auth & routing**
   - Visit `/` and ensure published tournaments list renders.
   - Navigate to `/auth`, sign in, and verify redirect to `/dashboard`.

2) **Tournament wizard**
   - Create a tournament from `/dashboard` and complete `/t/:id/setup`.
   - Verify category order at `/t/:id/order-review` and return to setup.

3) **Player import**
   - Upload a sample Excel file on `/t/:id/import`, confirm preview, and complete import.

4) **Allocation review**
   - Run preview on `/t/:id/review`; resolve any conflicts; commit allocations.

5) **Finalize/export**
   - On `/t/:id/finalize`, export winners to PDF/XLSX and publish results.

6) **Public results**
   - Visit `/p/:slug` and `/p/:slug/results` to confirm data renders and links work.

7) **Master/Admin (if applicable)**
   - Access `/master-dashboard` and `/admin/tournaments` to verify controls load and actions are gated.

---

## 9) Summary

- Build succeeds, unit tests pass, and asset references in `public/brand` resolve.
- Lint currently fails in `parseWorkbook`; smoke tests are blocked by dependency install in the environment.
- Key areas to address before release: PII logging, lint error, smoke-test environment stability.
