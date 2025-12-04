# Prize-Manager Technical Overview

## Architecture
- **Frontend pages (React/TypeScript):** `TournamentSetup`, `PlayerImport`, `ConflictReview`, `CategoryOrderReview`, `Finalize`, `PublicHome`, `PublicTournament`, `PublicTournamentDetails`, `PublicWinnersPage`, `MasterDashboard`.
- **Supabase tables:** `tournaments`, `players`, `prizes`, `allocations` (preview/final winners), plus supporting metadata for categories, time controls, and public slugs.
- **Edge Functions:**
  - `parseWorkbook` — parses Excel uploads, maps headers, and runs gender inference before persisting players.
  - `allocatePrizes` — runs the allocation engine, produces coverage data, and computes `diagnosis_summary` for unfilled prizes.

## Gender inference module
- **File:** `src/utils/genderInference.ts`
- **Key functions:** `analyzeGenderColumns` (detects gender/fs/headerless columns), `inferGenderForRow` (per-row inference).
- **Supported sources:** `fs_column`, `headerless_after_name`, `gender_column`, `type_label`, `group_label` with FMG/female marker handling.
- **Behavior:**
  - Prefers explicit gender column, then `fs`, then headerless-after-name, with FMG/female marker override for female labeling.
  - Uses `genderBlankToMF` and `normalizeGender` to set `F` from `fs` and leave blanks as unknown.
  - Warnings are attached when FMG conflicts with provided gender.

## Allocation coverage and diagnosis
- **Reason codes:** `src/types/allocation.ts` defines `UnfilledReasonCode` (e.g., `NO_ELIGIBLE_PLAYERS`, `BLOCKED_BY_ONE_PRIZE_POLICY`, `TOO_STRICT_CRITERIA_*`) and `reasonCodeToLabel` for UI labels.
- **Diagnosis summary:** `supabase/functions/allocatePrizes/index.ts` builds `diagnosis_summary` for zero-candidate categories by inspecting rating/age/gender/location/type/group fail codes.
- **Coverage data:** Allocation debug entries include candidate counts before/after one-prize enforcement, winner details, `is_unfilled`, `is_blocked_by_one_prize`, `raw_fail_codes`, and `diagnosis_summary`.

## Exports
- **Coverage (.xlsx):** `src/utils/allocationCoverageExport.ts` flattens coverage entries (category/prize, candidate counts, winner info, reason codes, diagnosis summary) and downloads Excel. CSV is not supported.
- **RCA (.xlsx):** `src/utils/allocationRcaExport.ts` exports engine vs final winners with status (`MATCH`, `OVERRIDDEN`, `NO_ELIGIBLE_WINNER`), override reasons, candidate counts, and diagnostics. CSV is not supported.
