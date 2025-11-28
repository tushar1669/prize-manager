# Rating eligibility behavior (allocatePrizes edge function)

## Source
Logic pulled from `supabase/functions/allocatePrizes/index.ts` around the rating check in `evaluateEligibility` and validated by `tests/allocation/allocation.spec.ts`.

## Decision tree
1. **Identify rating-aware categories (`ratingCat`).**
   - `true` when `min_rating` or `max_rating` is present, **or** when `criteria_json.unrated_only === true` (even with no rating bounds).【F:supabase/functions/allocatePrizes/index.ts†L720-L775】【F:tests/allocation/allocation.spec.ts†L386-L419】
   - `false` when no rating bounds and `unrated_only` is unset/false; rating is ignored and only age/gender/other filters apply (e.g., pure Veteran categories).【F:supabase/functions/allocatePrizes/index.ts†L690-L775】【F:tests/allocation/allocation.spec.ts†L644-L678】
2. **Compute `allowUnrated` (used only when `ratingCat` is true and the category is not `unrated_only`).**
   - If `unrated_only === true`: force `allowUnrated = true` (rated players handled separately).【F:supabase/functions/allocatePrizes/index.ts†L741-L775】
   - Else if `include_unrated === true`: `allowUnrated = true` (explicit opt-in).【F:supabase/functions/allocatePrizes/index.ts†L741-L775】【F:tests/allocation/allocation.spec.ts†L537-L568】
   - Else if `include_unrated === false`: `allowUnrated = false` (explicit opt-out, overrides global).【F:supabase/functions/allocatePrizes/index.ts†L741-L775】【F:tests/allocation/allocation.spec.ts†L468-L534】
   - Else (`include_unrated` unset): legacy fallback → `rules.allow_unrated_in_rating` **or** a max-only band (`max_rating` present, `min_rating` absent).【F:supabase/functions/allocatePrizes/index.ts†L725-L775】【F:tests/allocation/allocation.spec.ts†L571-L644】
3. **Evaluate rating dimension when `ratingCat` is true.**
   - **Unrated-only categories (`unrated_only: true`):** rated players fail with `rated_player_excluded_unrated_only`; unrated players pass via `unrated_only_ok`; any `min_rating`/`max_rating` is ignored.【F:supabase/functions/allocatePrizes/index.ts†L773-L809】【F:tests/allocation/allocation.spec.ts†L386-L463】
   - **Standard rating categories:**
     - Unrated players: allowed only when `allowUnrated` is true (otherwise fail with `unrated_excluded`).【F:supabase/functions/allocatePrizes/index.ts†L741-L809】【F:tests/allocation/allocation.spec.ts†L468-L644】
     - Rated players: checked against `min_rating` / `max_rating` (fail with `rating_below_min` or `rating_above_max`); passing rated players add `rating_ok`.【F:supabase/functions/allocatePrizes/index.ts†L795-L809】
4. **Age/veteran interaction.**
   - Age constraints run before rating. A category with age bounds but **no** rating bounds (and `unrated_only` unset) skips rating entirely, so both rated and unrated entrants can qualify purely on age (e.g., Veteran).【F:supabase/functions/allocatePrizes/index.ts†L690-L775】【F:tests/allocation/allocation.spec.ts†L644-L678】
   - When age bounds are combined with `unrated_only: true`, players must satisfy age **and** be unrated; rated veterans are excluded, unrated veterans qualify.【F:supabase/functions/allocatePrizes/index.ts†L690-L809】【F:tests/allocation/allocation.spec.ts†L424-L463】

## Configuration examples
- **Pure Unrated (no rating bounds).**
  ```json
  {
    "name": "Unrated Only",
    "criteria_json": { "unrated_only": true }
  }
  ```
  Rated players are rejected; unrated players qualify; any rating bounds are ignored.【F:supabase/functions/allocatePrizes/index.ts†L720-L809】【F:tests/allocation/allocation.spec.ts†L386-L419】

- **Veteran (age-only, rating ignored).**
  ```json
  {
    "name": "Veteran",
    "criteria_json": { "min_age": 60 }
  }
  ```
  No rating filters; both rated and unrated seniors are eligible if age matches.【F:supabase/functions/allocatePrizes/index.ts†L690-L775】【F:tests/allocation/allocation.spec.ts†L644-L678】

- **Veteran Unrated-only (age + unrated gate).**
  ```json
  {
    "name": "Veteran Unrated",
    "criteria_json": { "min_age": 60, "unrated_only": true }
  }
  ```
  Requires age match **and** unrated status; rated seniors are excluded.【F:supabase/functions/allocatePrizes/index.ts†L690-L809】【F:tests/allocation/allocation.spec.ts†L424-L463】

- **U1600 (rated only).**
  ```json
  {
    "name": "U1600 (rated only)",
    "criteria_json": { "max_rating": 1600, "include_unrated": false }
  }
  ```
  Rated players must be ≤1600; unrated players fail due to explicit block.【F:supabase/functions/allocatePrizes/index.ts†L741-L809】【F:tests/allocation/allocation.spec.ts†L468-L534】

- **U1600 (allow unrated).**
  ```json
  {
    "name": "U1600 (allow unrated)",
    "criteria_json": { "max_rating": 1600, "include_unrated": true }
  }
  ```
  Rated players must be ≤1600; unrated players are explicitly allowed.【F:supabase/functions/allocatePrizes/index.ts†L741-L809】【F:tests/allocation/allocation.spec.ts†L537-L568】

- **Legacy U1600 max-only band (include_unrated unset).**
  ```json
  {
    "name": "U1600 (legacy max-only)",
    "criteria_json": { "max_rating": 1600 }
  }
  ```
  With `include_unrated` unset, unrated players are allowed via legacy max-only fallback even when global `allow_unrated_in_rating` is false.【F:supabase/functions/allocatePrizes/index.ts†L725-L809】【F:tests/allocation/allocation.spec.ts†L607-L644】
