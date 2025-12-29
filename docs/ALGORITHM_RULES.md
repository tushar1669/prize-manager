# Allocation Algorithm Rules (repo-grounded)

Every rule below is **numbered** and includes a summary + exact code pointers (path + function + line range).

## R1. Only active categories and prizes are allocatable
- **Summary:** Allocation ignores categories/prizes where `is_active = false`. 
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `Deno.serve` (activeCategories/activePrizes filtering, lines ~468–505).
- **Inputs:** `categories.is_active`, `prizes.is_active`.

## R2. Tournament start date anchors age calculations
- **Summary:** Player age is computed against the tournament `start_date` (fallback: today). 
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `Deno.serve` (tournament fetch + `tournamentStartDate`, lines ~423–436); `yearsOn`, lines ~1154–1162.
- **Inputs:** `tournaments.start_date`, `players.dob`.

## R3. Age band policy can transform overlapping U‑X categories
- **Summary:** With `age_band_policy = non_overlapping`, categories with `max_age` are grouped by `max_age`, then assigned disjoint min/max bands; with `overlapping`, raw min/max are used.
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `Deno.serve` (age band derivation, lines ~585–666); `evaluateEligibility`, lines ~1351–1404.
- **Inputs:** `rule_config.age_band_policy`, `criteria_json.min_age`, `criteria_json.max_age`.

## R4. Eligibility is determined per category by criteria_json + rule config
- **Summary:** Players are eligible only if they pass gender, age, rating, location, group/type, and disability filters. 
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `evaluateEligibility`, lines ~1281–1514.
- **Inputs:** `categories.criteria_json.*`, `players.*`, `rule_config.*`.

### R4.a Gender eligibility
- **Summary:** `F` = female‑only (missing/unknown fails); `M` or `M_OR_UNKNOWN` = “not F” (boys + unknown); empty = open.
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `evaluateEligibility`, lines ~1316–1350; `normGender`, lines ~1146–1152.

### R4.b Age eligibility
- **Summary:** When strict age is on, `min_age`/`max_age` (or derived bands) are enforced; missing DOB can be allowed/blocked.
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `evaluateEligibility`, lines ~1351–1404.

### R4.c Rating + unrated eligibility
- **Summary:** Rating categories enforce min/max for rated players; unrated handling depends on `unrated_only`, `include_unrated`, and legacy `allow_unrated_in_rating`.
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `evaluateEligibility`, lines ~1406–1488.

### R4.d Location filters (state/city/club)
- **Summary:** Allowed lists use alias normalization; missing location fails when a list is present.
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `matchesLocation` + helpers, lines ~1216–1262; `evaluateEligibility`, lines ~1490–1526.

### R4.e Group/type/disability filters
- **Summary:** Group/type are matched case‑insensitively; disability uses list inclusion.
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `evaluateEligibility`, lines ~1488–1514.

### R4.f Youngest categories require DOB
- **Summary:** Youngest categories (`youngest_female`, `youngest_male`) fail eligibility if DOB is missing.
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `evaluateEligibility`, lines ~1349–1354; `isYoungestCategory`, lines ~1718–1721.

## R5. Prize priority queue is global and deterministic
- **Summary:** Prizes are ordered globally by cash → prize type → (main‑vs‑side toggle) → place → main → brochure order → prize id.
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `prizeKey`, lines ~1596–1614; `makePrizeComparator`, lines ~1623–1659; queue sort in `Deno.serve`, lines ~688–706.
- **Inputs:** `prizes.cash_amount`, `prizes.has_trophy`, `prizes.has_medal`, `prizes.place`, `categories.is_main`, `categories.order_idx`, `rule_config.main_vs_side_priority_mode`.

## R6. Winner selection is rank‑first with deterministic tie‑breaks
- **Summary:** Standard categories pick lowest tournament rank; ties follow configured tie‑break fields (rating then name by default). 
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `compareEligibleByRankRatingName`, lines ~1683–1715; `normalizeTieBreakStrategy`, lines ~24–30.
- **Inputs:** `players.rank`, `players.rating`, `players.name`, `rule_config.tie_break_strategy` (or request override).

## R7. Youngest categories use DOB, then rank/rating/name
- **Summary:** Youngest categories sort by most recent DOB (youngest), then rank, rating, and name. 
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `compareYoungestEligible`, lines ~1736–1766.

## R8. Per‑player prize cap is enforced after eligibility
- **Summary:** `multi_prize_policy` controls whether a player can win 1 prize, 1 main + 1 side, or unlimited.
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `canPlayerTakePrize`, lines ~314–332; applied in `Deno.serve`, lines ~803–826.
- **Inputs:** `rule_config.multi_prize_policy`, `categories.is_main`.

## R9. Manual overrides are applied before auto allocation
- **Summary:** Overrides are evaluated for eligibility; if ineligible and not forced, a conflict is emitted and the assignment is skipped.
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `Deno.serve` override loop, lines ~732–789.
- **Inputs:** `allocatePrizes` request `overrides`.

## R10. Unfilled prizes are recorded with reason codes
- **Summary:** If no eligible players remain for a prize, it is marked unfilled with reason codes and coverage diagnostics.
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `Deno.serve` unfilled handling + coverage, lines ~825–906.

## R11. Conflict detection only flags identical prize priority ties
- **Summary:** A conflict is emitted when a player is eligible for 2+ prizes with **identical prizeKey** values.
- **Where in code:** supabase/functions/allocatePrizes/index.ts → conflict detection in `Deno.serve`, lines ~1040–1085; `prizeKey`, lines ~1596–1614.

## R12. Allocation preview is read‑only; finalize writes to DB
- **Summary:** `allocatePrizes` returns winners/coverage without DB writes; `finalize` inserts `allocations` and updates tournament status.
- **Where in code:** supabase/functions/allocatePrizes/index.ts → `Deno.serve` response, lines ~1068–1124; supabase/functions/finalize/index.ts → `Deno.serve`, lines ~150–214.

## R13. Team (institution) prize allocation is separate from individual prizes
- **Summary:** Team prizes group players by a configured field, score top‑K players, apply gender slots, and rank institutions by points → rank sum → best rank → name.
- **Where in code:** supabase/functions/_shared/teamPrizes.ts → `getRankPoints`, `buildTeam`, `compareInstitutions`; supabase/functions/allocateInstitutionPrizes/index.ts → `GROUP_BY_COLUMN_MAP`, lines ~125–132; allocation loop in `Deno.serve`, lines ~214–568.

## R14. Public team prizes are recomputed for published tournaments
- **Summary:** Public pages call `publicTeamPrizes`, which reuses the shared team‑allocation logic and enforces `tournaments.is_published = true`.
- **Where in code:** supabase/functions/_shared/teamPrizes.ts → shared team scoring helpers; supabase/functions/publicTeamPrizes/index.ts → `Deno.serve`, lines ~91–337; published guard, lines ~140–182.

## R15. Import dedup & conflict rules influence rank inputs
- **Summary:** Import conflict detection groups likely duplicate rows by FIDE ID, Name+DOB, or SNo; dedup scoring/merge policy can change the final player list and ranks used in allocation.
- **Where in code:** src/utils/conflictUtils.ts → `detectConflictsInDraft`, lines ~194–286; src/utils/dedup.ts → `scoreCandidate`/`applyMergePolicy`, lines ~113–184.

## Deprecated / reserved settings (not used by allocator)
- `rule_config.prefer_category_rank_on_tie` and `rule_config.category_priority_order` are stored in the DB but are not read by the allocator and are not exposed in the UI.
