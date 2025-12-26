# Product Working Notes (repo-grounded)

## Key discovery points (routes, core utilities, DB objects, tests)
- App routes for public, auth, and organizer flows live in `src/App.tsx` (src/App.tsx → App). 
- Allocation engine and eligibility rules are implemented in the `allocatePrizes` edge function (supabase/functions/allocatePrizes/index.ts → Deno.serve, evaluateEligibility, prizeKey, makePrizeComparator). 
- Team/institution prize allocation logic is implemented separately in `allocateInstitutionPrizes` (supabase/functions/allocateInstitutionPrizes/index.ts → Deno.serve, buildTeam, compareInstitutions). 
- Player import parsing is handled in the client hook plus the `parseWorkbook` edge function (src/hooks/useExcelParser.tsx → useExcelParser; supabase/functions/parseWorkbook/index.ts → Deno.serve). 
- Import conflict detection and dedup heuristics live in `conflictUtils` and `dedup` (src/utils/conflictUtils.ts → detectConflictsInDraft; src/utils/dedup.ts → scoreCandidate, applyMergePolicy). 
- Publish flow uses a `publish_tournament` RPC and updates `publications`/`tournaments` (src/pages/Finalize.tsx → publishMutation). 
- Public read model is backed by the `published_tournaments` view (supabase/migrations/20251226184159_c2405569-73f6-4622-827f-3183c54b8645.sql → CREATE VIEW public.published_tournaments). 
- Print/export is handled via in-browser print HTML and XLSX exports (src/utils/print.ts → buildWinnersPrintHtml, openPrintWindow; src/components/final-prize/FinalPrizeSummaryHeader.tsx → handleExportXlsx). 
- Playwright E2E coverage is in `e2e/*.spec.ts` (e2e/allocate-flow.spec.ts → test.describe; e2e/public-smoke.spec.ts → test.describe). 

## What the product does (one-page overview)
- Prize Manager is a web app for managing chess tournament prize allocations from setup to publication, as described by the organizer dashboard copy and the prize allocation flows (src/pages/Dashboard.tsx → Dashboard; src/pages/Finalize.tsx → Finalize). 
- Organizers create tournaments, configure categories/prizes, import players, run allocations, and publish public pages for results and details (src/pages/Dashboard.tsx → createMutation; src/pages/TournamentSetup.tsx → TournamentSetup; src/pages/PlayerImport.tsx → PlayerImport; src/pages/ConflictReview.tsx → ConflictReview; src/pages/Finalize.tsx → Finalize; src/pages/PublishSuccess.tsx → PublishSuccess). 
- Public viewers can browse published tournaments and results without authentication using `/`, `/p/:slug`, and `/p/:slug/results` (src/App.tsx → App; src/pages/PublicHome.tsx → PublicHome; src/pages/PublicTournamentDetails.tsx → PublicTournamentDetails; src/pages/PublicResults.tsx → PublicResults). 
- Publication state is controlled by `tournaments.is_published` and the `publications` versioning model exposed through the `published_tournaments` view (supabase/migrations/20251226184159_c2405569-73f6-4622-827f-3183c54b8645.sql → CREATE VIEW public.published_tournaments; src/pages/Finalize.tsx → publishMutation). 

## User roles
- **Organizer**: default role for authenticated users; can create and manage their tournaments and access organizer routes (src/hooks/useUserRole.tsx → useUserRole; src/components/ProtectedRoute.tsx → ProtectedRoute). 
- **Master/Admin**: users with `role === "master"` and allowlist email gain master-only routes like `/master-dashboard` and `/admin/tournaments` (src/hooks/useUserRole.tsx → useUserRole; src/components/ProtectedRoute.tsx → ProtectedRoute; src/App.tsx → App). 
- **Public viewer**: unauthenticated visitors who access public routes for published tournaments and results (src/App.tsx → App; supabase/migrations/20251226184159_c2405569-73f6-4622-827f-3183c54b8645.sql → CREATE VIEW public.published_tournaments). 

## Main workflows (end-to-end)

### a) Create / Setup tournament
- **Flow summary:** Organizers create a draft tournament on the dashboard and land on the setup page for details and configuration (src/pages/Dashboard.tsx → createMutation; src/pages/Dashboard.tsx → navigate(`/t/${data.id}/setup?tab=details`)). 
- **Where in code (routes/pages/components/hooks):**
  - Route `/dashboard` → `Dashboard` for listing and creating tournaments (src/App.tsx → App; src/pages/Dashboard.tsx → Dashboard). 
  - Route `/t/:id/setup` → `TournamentSetup` for details and configuration (src/App.tsx → App; src/pages/TournamentSetup.tsx → TournamentSetup). 
  - Form validation for tournament details uses `tournamentDetailsSchema` (src/lib/validations.ts → tournamentDetailsSchema). 

### b) Prize / categories setup
- **Flow summary:** Organizers configure categories, activate/deactivate them, and define prizes for each category (src/pages/TournamentSetup.tsx → TournamentSetup; src/components/prizes/CategoryPrizesEditor.tsx → CategoryPrizesEditor). 
- **Where in code (routes/pages/components/hooks):**
  - Route `/t/:id/setup?tab=prizes` → `TournamentSetup` prize tab (src/App.tsx → App; src/pages/TournamentSetup.tsx → TournamentSetup). 
  - Category prize editing UI is `CategoryPrizesEditor` (src/components/prizes/CategoryPrizesEditor.tsx → CategoryPrizesEditor). 
  - Category criteria (rules) are edited in the criteria sheet embedded in `TournamentSetup` (src/pages/TournamentSetup.tsx → TournamentSetup). 
  - Category ordering review uses `/t/:id/order-review` (src/App.tsx → App; src/pages/CategoryOrderReview.tsx → CategoryOrderReview). 
  - Team prize configuration uses `TeamPrizesEditor` and `TeamPrizeRulesSheet` (src/components/team-prizes/TeamPrizesEditor.tsx → TeamPrizesEditor; src/components/team-prizes/TeamPrizeRulesSheet.tsx → TeamPrizeRulesSheet). 

### c) Player import + mapping + dedup + conflict handling
- **Flow summary:** Organizers upload an Excel workbook, auto-map columns, optionally use server parsing, review conflicts/dedup decisions, and import players (src/pages/PlayerImport.tsx → PlayerImport; src/hooks/useExcelParser.tsx → useExcelParser). 
- **Where in code (routes/pages/components/hooks):**
  - Route `/t/:id/import` → `PlayerImport` (src/App.tsx → App; src/pages/PlayerImport.tsx → PlayerImport). 
  - Auto-mapping and header detection run in `useExcelParser` with `detectHeaderRow` (src/hooks/useExcelParser.tsx → useExcelParser; src/utils/sheetDetection.ts → detectHeaderRow). 
  - Server-side parsing uses the `parseWorkbook` edge function (supabase/functions/parseWorkbook/index.ts → Deno.serve). 
  - Column mapping UI uses `ColumnMappingDialog` (src/pages/PlayerImport.tsx → PlayerImport). 
  - Conflict detection uses `detectConflictsInDraft` (src/utils/conflictUtils.ts → detectConflictsInDraft). 
  - Dedup suggestions and merge policy live in `runDedupPass` and `applyMergePolicy` (src/utils/dedup.ts → runDedupPass; src/utils/dedup.ts → applyMergePolicy). 
  - Dedup review UI uses `DeduplicationWizard` (src/pages/PlayerImport.tsx → PlayerImport; src/components/dedup/DeduplicationWizard.tsx → DeduplicationWizard). 

### d) Allocation + finalize
- **Flow summary:** The allocation preview runs the `allocatePrizes` edge function, conflict review resolves manual overrides, and finalization commits allocations (supabase/functions/allocatePrizes/index.ts → Deno.serve; src/pages/ConflictReview.tsx → ConflictReview; supabase/functions/finalize/index.ts → Deno.serve). 
- **Where in code (routes/pages/components/hooks):**
  - Route `/t/:id/review` → `ConflictReview` for allocation preview and manual overrides (src/App.tsx → App; src/pages/ConflictReview.tsx → ConflictReview). 
  - Route `/t/:id/finalize` → `Finalize` for committing allocations (src/App.tsx → App; src/pages/Finalize.tsx → Finalize). 
  - Allocation preview invokes `allocatePrizes` (supabase/functions/allocatePrizes/index.ts → Deno.serve). 
  - Finalization invokes `finalize` edge function to write allocations (src/pages/Finalize.tsx → finalizeMutation; supabase/functions/finalize/index.ts → Deno.serve). 

### e) Print/export (PDF + XLSX)
- **Flow summary:** Organizers can open a print preview (save to PDF via browser) or export XLSX files for winners (src/pages/Finalize.tsx → handleExportWinnersPdf; src/components/final-prize/FinalPrizeSummaryHeader.tsx → handleExportXlsx). 
- **Where in code (routes/pages/components/hooks):**
  - Route `/t/:id/final/:view` → `FinalPrizeView` with print-friendly tabs (src/App.tsx → App; src/pages/FinalPrizeView.tsx → FinalPrizeView). 
  - Print-preview HTML is generated in `buildWinnersPrintHtml` and opened via `openPrintWindow` (src/utils/print.ts → buildWinnersPrintHtml, openPrintWindow). 
  - XLSX export for final prizes uses `buildFinalPrizeExportRows` and `downloadWorkbookXlsx` (src/components/final-prize/FinalPrizeSummaryHeader.tsx → handleExportXlsx; src/utils/finalPrizeExport.ts → buildFinalPrizeExportRows; src/utils/excel.ts → downloadWorkbookXlsx). 
  - **PDF export via server function:** NOT FOUND IN REPO (no UI invoking `generatePdf`). 

### f) Publish + public pages (/, /p/:slug, /results)
- **Flow summary:** Publishing creates a public slug/version and marks the tournament as published; public pages read from the `published_tournaments` view (src/pages/Finalize.tsx → publishMutation; supabase/migrations/20251226184159_c2405569-73f6-4622-827f-3183c54b8645.sql → CREATE VIEW public.published_tournaments). 
- **Where in code (routes/pages/components/hooks):**
  - Route `/t/:id/publish` → `PublishSuccess` confirmation page (src/App.tsx → App; src/pages/PublishSuccess.tsx → PublishSuccess). 
  - Route `/` → `PublicHome` lists published tournaments (src/App.tsx → App; src/pages/PublicHome.tsx → PublicHome). 
  - Route `/p/:slug` → `PublicTournamentDetails` uses `fetchPublicTournamentDetails` (src/App.tsx → App; src/pages/PublicTournamentDetails.tsx → PublicTournamentDetails; src/utils/publicTournamentDetails.ts → fetchPublicTournamentDetails). 
  - Route `/p/:slug/results` → `PublicResults` for published winners (src/App.tsx → App; src/pages/PublicResults.tsx → PublicResults). 
  - Route `/results` requested in task: NOT FOUND IN REPO (src/App.tsx → App). 
