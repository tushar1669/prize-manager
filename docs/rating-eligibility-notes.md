# Rating eligibility behavior (allocatePrizes edge function)

## Source
Logic pulled from `supabase/functions/allocatePrizes/index.ts` around the rating check in `evaluateEligibility`.

## Decision tree
1. **Detect rating-aware categories.**
   - `ratingCat` is `true` when the category has `min_rating` or `max_rating`, **or** when `criteria_json.unrated_only` is `true` (even without rating bounds).【F:supabase/functions/allocatePrizes/index.ts†L720-L769】
2. **Compute `allowUnrated`.**
   - If `unrated_only` is `true`: unrated is always allowed; rated handling is decided later.【F:supabase/functions/allocatePrizes/index.ts†L741-L758】
   - Else if `include_unrated === true`: allow unrated.【F:supabase/functions/allocatePrizes/index.ts†L741-L758】
   - Else if `include_unrated === false`: block unrated.【F:supabase/functions/allocatePrizes/index.ts†L741-L758】
   - Else (`include_unrated` unset): fall back to legacy behaviour → `rules.allow_unrated_in_rating` **or** a max-only band (`max_rating` set and `min_rating` absent).【F:supabase/functions/allocatePrizes/index.ts†L727-L758】
3. **Evaluate rating dimension when `ratingCat` is `true`.**
   - **Unrated-only category (`unrated_only: true`):**
     - Rated players fail with `rated_player_excluded_unrated_only`.
     - Unrated players pass with `unrated_only_ok`.
     - Min/max checks are **skipped** entirely.【F:supabase/functions/allocatePrizes/index.ts†L773-L809】
   - **Standard rating category:**
     - If player is unrated:
       - Pass when `allowUnrated` is `true`, otherwise fail with `unrated_excluded`.【F:supabase/functions/allocatePrizes/index.ts†L741-L809】
     - If player is rated:
       - Apply `min_rating` and `max_rating` bounds (fail with `rating_below_min` / `rating_above_max` as needed).【F:supabase/functions/allocatePrizes/index.ts†L795-L809】
       - Passing rated players add `rating_ok`.【F:supabase/functions/allocatePrizes/index.ts†L805-L809】
4. **Non-rating categories.** When `ratingCat` is `false`, the rating block is skipped; age/gender/other filters still apply.【F:supabase/functions/allocatePrizes/index.ts†L690-L809】

## How the new flags interact
- `criteria_json.unrated_only: true`
  - Forces `ratingCat = true` even without bounds.
  - Ignores `min_rating`/`max_rating` if present.
  - Excludes all rated players; allows all unrated players.【F:supabase/functions/allocatePrizes/index.ts†L720-L809】
- `criteria_json.include_unrated`
  - `true` → allow unrated players in rating categories (unless `unrated_only` is also true, in which case rated players are still blocked).【F:supabase/functions/allocatePrizes/index.ts†L741-L809】
  - `false` → block unrated players in rating categories.【F:supabase/functions/allocatePrizes/index.ts†L741-L809】
  - `undefined` → legacy fallback: allow unrated when `rules.allow_unrated_in_rating` is set **or** when the band is max-only (has `max_rating` and no `min_rating`).【F:supabase/functions/allocatePrizes/index.ts†L727-L758】

## Configuration examples
- **Standard rating band (rated only).**
  - `min_rating: 1200`, `max_rating: 1600`, `include_unrated: false`
  - Rated players must fall within 1200–1600; unrated players fail with `unrated_excluded`.【F:supabase/functions/allocatePrizes/index.ts†L741-L809】
- **Rating band that includes unrated.**
  - `min_rating: 1200`, `max_rating: 1600`, `include_unrated: true`
  - Rated players still checked against bounds; unrated players allowed because `include_unrated` is explicitly true.【F:supabase/functions/allocatePrizes/index.ts†L741-L809】
- **Unrated-only category.**
  - `unrated_only: true` (no rating bounds required)
  - All rated players are rejected; all unrated players pass; min/max are ignored even if set.【F:supabase/functions/allocatePrizes/index.ts†L720-L809】
- **Veteran (age-only).**
  - No `min_rating`/`max_rating` and `unrated_only` unset
  - `ratingCat` is false, so rating checks are skipped; only age and other filters apply.【F:supabase/functions/allocatePrizes/index.ts†L690-L809】
- **Veteran + Unrated-only.**
  - Age bounds set (e.g., `min_age: 60`) **and** `unrated_only: true`
  - Age is validated first; rating dimension forces unrated-only behavior (rated players excluded, unrated allowed).【F:supabase/functions/allocatePrizes/index.ts†L690-L809】
