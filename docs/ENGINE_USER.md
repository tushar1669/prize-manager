# Engine (User Guide)

## What this is
This page explains how the allocation engine behaves from an organizer point of view, based only on current code and tests.

Primary execution path:
1. **Preview/Commit allocation** calls Edge Function `allocatePrizes`.
2. **Commit to database** calls Edge Function `finalize` with winners from review.

## Where organizers see it
- Review screen: `src/pages/ConflictReview.tsx`
  - Runs preview (`dryRun: true`) and stores winners/conflicts/unfilled/coverage.
  - Runs commit allocation (`dryRun: false`) before final finalize.
  - Runs `finalize` to persist a new allocation version.
- Debug panel: `src/components/allocation/AllocationDebugReport.tsx`
  - Shows category/unfilled views from `coverage` rows.
  - Allows Coverage and RCA exports when preview data exists.

## High-level flow in Review
1. Click **Preview Allocation** → engine runs with `dryRun: true`.
2. Review winners, conflicts, unfilled prizes, coverage diagnostics.
3. Apply suggested/manual overrides (if needed), rerun allocation.
4. Click commit allocation (`dryRun: false`) to lock preview result in UI state.
5. Click finalize to write versioned allocations and mark tournament finalized.

## Access control
Both server functions enforce auth + tournament authorization:
- user must be tournament owner or `master` role.
- unauthorized/forbidden/tournament-not-found return standard HTTP errors.

## Core allocation behavior (plain English)

### 1) Prize ordering (global queue)
All active prizes from active categories are put in one global queue and sorted by priority.

Priority order is configurable for main-vs-side comparison:
- Always first: **higher cash**.
- Then: **trophy > medal > none**.
- Then either:
  - `main_first`: main beats side in mixed main-vs-side comparisons before place, or
  - `place_first`: place comparison happens before main.
- Then: better place (1 before 2 before 3), then main fallback, then category order, then prize id.

### 2) Candidate filtering per prize
For each prize, players are filtered by category criteria (age, gender, rating, location, type/group, disability, etc.).

Then one-prize policy is enforced:
- `single` (default): max 1 prize total.
- `unlimited`: no cap.
- `main_plus_one_side`: max two total, at most one main and one side.

### 3) Winner pick among eligible players
- Standard categories: lowest rank wins; ties follow tie-break strategy (default `rating_then_name`).
- Youngest categories: youngest DOB wins; ties break by rank, then rating, then name.

### 4) Unfilled prizes
If no eligible candidate remains, prize is unfilled and engine emits reason data, including:
- blocked by one-prize policy, or
- no eligible players / too strict criteria buckets.

## Rule defaults used by engine
When no per-tournament config is present, defaults include:
- strict age checking enabled.
- unrated in rating categories disabled (with legacy exceptions where documented in code/tests).
- one-prize policy = `single`.
- main-vs-side mode defaults effectively to `main_first`.
- age band policy defaults to `non_overlapping`.
- age cutoff policy defaults to Jan 1 of tournament start year.

## Age band behavior organizers should know
For `non_overlapping` policy, under-age bands are transformed into disjoint effective bands grouped by shared `max_age` (so Boy/Girl pairs with same max age share the same effective band).

For `overlapping`, raw `min_age/max_age` criteria are used directly.

## Conflicts and overrides
- Engine can emit tie conflicts for identical prize priority keys.
- Review page supports suggested resolution and manual override; then reruns allocation with overrides payload.

## Exports from review
- **Coverage export**: all coverage rows.
- **RCA export**: only unfilled rows with root-cause/suggested-fix columns.

## Finalize behavior
When finalizing:
- validates payload (`tournamentId`, non-empty winners array).
- computes next allocation version from latest existing version + 1.
- inserts all winners into `allocations` with metadata.
- sets tournament status to `finalized`.
- marks open conflicts as resolved.

## UNKNOWNs (verify in code area before relying)
- Whether non-`dryRun` allocation writes anything besides response payload inside `allocatePrizes` is **UNKNOWN in this document** (verify around the winner/conflict/unfilled return path in `supabase/functions/allocatePrizes/index.ts`).
- Exact end-user copy/text in all toast messages is implementation detail and may change (verify in `src/pages/ConflictReview.tsx` around mutation success/error handlers).
