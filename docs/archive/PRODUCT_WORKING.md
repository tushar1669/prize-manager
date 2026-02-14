# Product Working Notes (repo-grounded)

## Key discovery points (routes, core utilities, DB objects, tests)
- **Core allocator:** Individual prize allocation is implemented in the `allocatePrizes` edge function (supabase/functions/allocatePrizes/index.ts → `Deno.serve`, lines ~344–1124; `evaluateEligibility`, lines ~1281–1514; `makePrizeComparator`, lines ~1623–1659).
- **Finalize writes allocations:** Final allocations are stored in `allocations` via the `finalize` edge function. (supabase/functions/finalize/index.ts → `Deno.serve`, lines ~150–214)
- **Team allocator (organizer + public):** Team prizes are computed in `allocateInstitutionPrizes` (organizer views) and `publicTeamPrizes` (public pages). (supabase/functions/allocateInstitutionPrizes/index.ts → `Deno.serve`, lines ~278–606; supabase/functions/publicTeamPrizes/index.ts → `Deno.serve`, lines ~123–395)
- **Public read model:** Public pages read from the `published_tournaments` view only. (supabase/migrations/20251226184159_c2405569-73f6-4622-827f-3183c54b8645.sql → `CREATE VIEW public.published_tournaments`, lines ~6–28; src/pages/PublicHome.tsx → `PublicHome`, lines ~25–118)
- **Player import pipeline:** Client parsing + server parsing are handled in `useExcelParser` and `parseWorkbook`. (src/hooks/useExcelParser.tsx → `useExcelParser`; supabase/functions/parseWorkbook/index.ts → `Deno.serve`)
- **Dedup/conflict logic:** Import conflicts and dedup merge policy live in `conflictUtils` and `dedup`. (src/utils/conflictUtils.ts → `detectConflictsInDraft`, lines ~194–286; src/utils/dedup.ts → `scoreCandidate`/`applyMergePolicy`, lines ~113–184)
- **Public results fetch:** Public results read the latest finalized allocation version via `getLatestAllocations`. (src/utils/getLatestAllocations.ts → `getLatestAllocations`, lines ~12–45)

## What the product does (one‑page overview)
- Prize Manager lets organizers configure tournament rules, import players, preview allocations, commit winners, and publish public results. (src/pages/Dashboard.tsx → `Dashboard`, lines ~169–270; src/pages/TournamentSetup.tsx → `TournamentSetup`, lines ~1750–2550; src/pages/ConflictReview.tsx → `ConflictReview`, lines ~184–916; src/pages/Finalize.tsx → `Finalize`, lines ~620–990)
- Public viewers access published tournaments through `/` and `/p/:slug/...` routes, which read from `published_tournaments`. (src/App.tsx → `App`, lines ~34–170; src/pages/PublicHome.tsx → `PublicHome`, lines ~25–118; src/pages/PublicResults.tsx → `PublicResults`, lines ~28–120)

## Main workflows (end‑to‑end)

### 1) Create / Setup tournament
- **Flow summary:** Organizers create a tournament on the dashboard and configure details in `/t/:id/setup`. (src/pages/Dashboard.tsx → `createMutation`, lines ~169–220; src/pages/TournamentSetup.tsx → `TournamentSetup`, lines ~1750–2550)

### 2) Prize + category setup
- **Flow summary:** Organizers create categories/prizes, edit criteria (age/rating/gender/etc.), and set category order for brochure priority. (src/pages/TournamentSetup.tsx → `TournamentSetup`, lines ~1750–2550; src/pages/CategoryOrderReview.tsx → `CategoryOrderReview`, lines ~178–380)

### 3) Player import + dedup
- **Flow summary:** Import a Swiss‑Manager ranking file, auto‑map columns, resolve conflicts, and deduplicate before saving players. (src/pages/PlayerImport.tsx → `PlayerImport`, lines ~186–980; src/utils/conflictUtils.ts → `detectConflictsInDraft`, lines ~194–286; src/utils/dedup.ts → `runDedupPass`, lines ~306–451)

### 4) Allocation preview + manual overrides
- **Flow summary:** Preview runs `allocatePrizes`, then users resolve conflicts or apply overrides in Review Allocations. (src/pages/ConflictReview.tsx → `allocateMutation`, lines ~184–226; supabase/functions/allocatePrizes/index.ts → `Deno.serve`, lines ~344–1124)

### 5) Finalize + publish
- **Flow summary:** Finalize writes `allocations` and publishing exposes results via `published_tournaments`. (src/pages/Finalize.tsx → `finalizeMutation` and `publishMutation`, lines ~331–936; supabase/functions/finalize/index.ts → `Deno.serve`, lines ~150–214; supabase/migrations/20251226184159_c2405569-73f6-4622-827f-3183c54b8645.sql → view definition, lines ~6–28)

### 6) Public results + exports
- **Flow summary:** Public pages load published tournaments + finalized allocations; exports use PDF/print/XLSX tooling. (src/pages/PublicResults.tsx → `PublicResults`, lines ~28–120; src/utils/print.ts → `buildWinnersPrintHtml`; src/components/final-prize/FinalPrizeSummaryHeader.tsx → `handleExportXlsx`)

## Data access surfaces (public vs organizer)
- **Published tournaments view:** Public pages query `published_tournaments` only; it filters `is_published = true` and excludes archived/deleted tournaments. (supabase/migrations/20251226184159_c2405569-73f6-4622-827f-3183c54b8645.sql → `CREATE VIEW public.published_tournaments`, lines ~6–28)
- **Allocations:** Final winners live in `allocations` with versioning; `getLatestAllocations` reads the latest version. (src/utils/getLatestAllocations.ts → `getLatestAllocations`, lines ~12–45)
- **Team prizes:** Public team prizes are recomputed by `publicTeamPrizes` and gated by `tournaments.is_published`. (supabase/functions/publicTeamPrizes/index.ts → `Deno.serve`, lines ~172–214)

## Known duplication / drift risk (for audits)
- **Team prize allocation logic is shared** between organizer and public edge functions via `supabase/functions/_shared/teamPrizes.ts`, avoiding drift. (supabase/functions/_shared/teamPrizes.ts → shared team helpers; supabase/functions/allocateInstitutionPrizes/index.ts and supabase/functions/publicTeamPrizes/index.ts import the module)
- **Rule config fields deprecated in UI:** `category_priority_order` and `prefer_category_rank_on_tie` remain stored in DB but are not used by the allocator and are no longer exposed in UI queries. (docs/RULES_AND_SETTINGS_REFERENCE.md → Deprecated / reserved settings)
