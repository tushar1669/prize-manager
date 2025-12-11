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

## Prize valuation and ordering
- **Global comparator:** Prizes are globally sorted by **cash ↓**, **trophy/medal power ↓ (trophy > medal > none)**, **place ↑ (1st before 2nd…)**, **main vs sub ↑**, **category brochure order ↑**, then **prize ID** for stability. The allocator always hands out the best prize first.
- **Why:** Keeps deterministic ordering across all categories and aligns with arbiter intuition (a 1st place with the same cash/type outranks an 8th place even if that 8th is in Main).

## Age eligibility policy
- **Config:** Each tournament has `age_band_policy` with `non_overlapping` (default for new events) and `overlapping` (legacy) options.
- **Behavior:** `non_overlapping` builds adjacent ranges from Under-X bands (U8/U11/U14/U17 → [0–8], [9–11], [12–14], [15–17]; a 10-year-old only sits in U11). Categories sharing the same `max_age` (e.g., boy/girl pairs) share the same derived band, and effective mins are clamped so we never produce `effective_min_age > effective_max_age`. `overlapping` treats each Under-X as an independent [min_age, max_age] filter (same 10-year-old qualifies for U11, U14, U17).
- **UI:** Toggle in **Edit Rules → Age Band Policy**. Legacy tournaments keep `overlapping` until explicitly switched.

## Gender filters
- **Options:** blank (**Any**), `F` (**Girls Only**), and `M_OR_UNKNOWN` (**Boys / not-F**). Legacy `M` is treated the same as `M_OR_UNKNOWN` (allows male or unknown, blocks explicit `F`).
- **UI:** The React form no longer shows a separate "Boys Only" toggle and only saves `F`, `M_OR_UNKNOWN`, or blank. Category type (`youngest_female`/`youngest_male`) stays internal-only but the allocator still honors it.

## Exports
- **Coverage (.xlsx):** `src/utils/allocationCoverageExport.ts` flattens coverage entries (category/prize, candidate counts, winner info, reason codes, diagnosis summary) and downloads Excel. CSV is not supported.
- **RCA (.xlsx):** `src/utils/allocationRcaExport.ts` exports engine vs final winners with status (`MATCH`, `OVERRIDDEN`, `NO_ELIGIBLE_WINNER`), override reasons, candidate counts, and diagnostics. CSV is not supported.
