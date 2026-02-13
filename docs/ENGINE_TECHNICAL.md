# Engine (Technical Reference)

## Scope
This document is grounded only in current implementation and allocation tests.

Primary sources:
- `supabase/functions/allocatePrizes/index.ts`
- `supabase/functions/finalize/index.ts`
- `src/pages/ConflictReview.tsx`
- `src/components/allocation/AllocationDebugReport.tsx`
- `src/utils/allocationCoverageExport.ts`
- `src/utils/allocationRcaExport.ts`
- `src/types/allocation.ts`
- `src/types/rca.ts`
- `tests/allocation/*.spec.ts`

---

## 1) API contracts

### 1.1 allocatePrizes request
`AllocatePrizesRequest` accepts:
- `tournamentId: string`
- `overrides?: [{ prizeId, playerId, force? }]`
- `ruleConfigOverride?: unknown`
- `dryRun?: boolean`
- `tieBreakStrategy?: 'rating_then_name' | 'none' | ('rating'|'name')[]`

### 1.2 allocatePrizes response
Returns JSON with:
- `winners[]`: `{ prizeId, playerId, reasons[], isManual }`
- `conflicts[]`
- `unfilled[]`
- `coverage[]` (enriched debug coverage rows)
- `meta` counts + `dryRun`

### 1.3 finalize request
`FinalizeRequest`:
- `tournamentId`
- `winners[]` with same winner shape used in review

### 1.4 finalize response
- `{ version, allocationsCount }`

---

## 2) Security/authorization behavior

Both functions:
1. require bearer token,
2. resolve current user via `auth.getUser`,
3. load tournament owner,
4. resolve `has_role(..., 'master')`,
5. allow only owner or master.

This is server-side enforced.

---

## 3) allocatePrizes pipeline

### 3.1 input loading
- Loads tournament, active categories/prizes, players, and optional `rule_config`.
- Merges rule defaults + db config + request overrides.
- Computes `tieBreakFields` from normalized strategy.

### 3.2 important default rule values
Defaults include:
- `strict_age=true`
- `allow_unrated_in_rating=false`
- `allow_missing_dob_for_age=false`
- `max_age_inclusive=true`
- `prefer_main_on_equal_value=true`
- `main_vs_side_priority_mode='main_first'` (derived/fallback behavior exists)
- `tie_break_strategy='rating_then_name'`
- `age_band_policy='non_overlapping'`
- `multi_prize_policy='single'`
- `age_cutoff_policy='JAN1_TOURNAMENT_YEAR'`

### 3.3 age cutoff and age-bands
- `resolveAgeCutoffDate` supports:
  - `JAN1_TOURNAMENT_YEAR`
  - `TOURNAMENT_START_DATE`
  - `CUSTOM_DATE`
- `non_overlapping` age policy computes disjoint effective age bands grouped by identical `max_age`; supports Boy/Girl pair correctness.
- `overlapping` uses raw min/max from criteria.

### 3.4 eligibility evaluation (`evaluateEligibility`)
Signals:
- `eligible: boolean`
- `reasonCodes[]`
- `passCodes[]`
- `warnCodes[]`

Checks include:
- gender logic (including `M_OR_UNKNOWN` and legacy `M` behavior),
- DOB requirements for youngest categories,
- age min/max with optional missing-DOB allowance,
- rating/unrated truth-table (`unrated_only`, `include_unrated`, legacy fallbacks),
- location (state/city/club with alias normalization),
- type/group/disability gating.

### 3.5 prize queue and comparator
- Global queue across all active prizes.
- Comparator generated via `makePrizeComparator`.
- Hierarchy: cash → prize type → conditional main-vs-side step → place → main fallback → order → prize id.

### 3.6 one-prize policy enforcement
`canPlayerTakePrize`:
- `single`: zero existing assignments required.
- `unlimited`: always true.
- `main_plus_one_side`: max 2 assignments and at most one in each class (main vs side).

### 3.7 winner selection
- standard category: `compareEligibleByRankRatingName`.
- youngest category: `compareYoungestEligible`.
- records reasons with auto + pass/warn codes + context (`rank`/`youngest`, `max_cash_priority`).

### 3.8 coverage/unfilled diagnostics
For each prize, coverage row includes:
- winner fields,
- candidate counts before/after one-prize filtering,
- reason code + details,
- raw fail codes,
- diagnosis summary for zero-candidate cases,
- priority explanation and prize icon flags.

### 3.9 conflicts
Current explicit conflict detection adds conflict entries for **identical prize key ties** where one player is eligible for 2+ identical-priority prizes.

---

## 4) finalize pipeline

1. CORS + ping handling.
2. Parse/validate JSON (including empty winners guard).
3. Auth + tournament access guard.
4. Compute next version from max existing allocation version.
5. Bulk insert allocations (with reason codes/manual flag/decider metadata).
6. Update tournament status to `finalized`.
7. Resolve open conflicts for tournament.

---

## 5) UI orchestration and state flow

### 5.1 ConflictReview
- Preview button calls allocate with `dryRun: true`.
- Commit allocation calls allocate with `dryRun: false`.
- Finalize button calls finalize with current `winners` array.
- On allocation success:
  - merges manual decision reasons into winner reasons,
  - updates winners/conflicts/unfilled/meta/coverage,
  - derives warnings/toasts from coverage reason-code categories.

### 5.2 AllocationDebugReport
- Consumes `coverage` array and summarizes by category.
- Unfilled tab filters two classes: blocked-by-one-prize vs no-eligible.
- Download actions:
  - coverage export (`exportCoverageToXlsx`)
  - RCA export (`buildRcaRows` then `exportRcaToXlsx`)

---

## 6) Export schema behavior

### 6.1 Coverage export
Maps `AllocationCoverageEntry` fields to an `AllocationCoverage` sheet; returns `false` with warning when no rows.

### 6.2 RCA build and export
- `buildRcaRows` compares coverage (engine preview winner) vs final winners.
- Status derivation:
  - `MATCH`, `OVERRIDDEN`, `NO_ELIGIBLE_WINNER`.
- RCA exporter currently writes **only unfilled rows**; returns `false` if no unfilled rows.

---

## 7) Type contracts

### 7.1 Allocation types
`src/types/allocation.ts` defines:
- `UnfilledReasonCode`
- `AllocationCoverageEntry` (legacy camelCase + snake_case fields)
- `CategorySummary`
- helper `deriveReasonCode` + label map

### 7.2 RCA types
`src/types/rca.ts` defines:
- `RcaStatus`
- `RcaRow`
- `WinnerEntry`, `PlayerInfo`
- `buildRcaRows(...)`

---

## 8) Test-backed invariants

From `tests/allocation/*.spec.ts`:
- rank invariant for standard categories (best eligible rank wins),
- youngest invariant (DOB-first, then rank/rating/name),
- prize hierarchy and main-vs-side mode behaviors,
- gender normalization + filters (`M`, `M_OR_UNKNOWN`, `F`, open),
- multi-prize policy modes,
- age-band grouping fix for shared `max_age` categories,
- golden fixtures for tournament-level regression coverage,
- rating/unrated compatibility and per-category overrides,
- location/group/type filters and combined criteria behavior.

---

## 9) UNKNOWNs / verify before changing
- Persistence side-effects (if any) inside `allocatePrizes` beyond response construction are UNKNOWN in this doc; inspect around dry-run handling and return path.
- Exact conflict model scope beyond identical-prize-key detection is UNKNOWN in this doc; inspect around the playerEligiblePrizes/keyGroups block.
