# Rating eligibility behavior (allocatePrizes edge function)

## Source
Logic pulled from `supabase/functions/allocatePrizes/index.ts` around the rating check in `evaluateEligibility`.

## Rating handling summary
- A category is treated as a "rating category" only when `criteria_json.min_rating` or `criteria_json.max_rating` is a number; otherwise no rating validation runs.【F:supabase/functions/allocatePrizes/index.ts†L720-L758】
- Unrated players are allowed only when either:
  - The category has only `max_rating` (no `min_rating`) and `criteria_json.exclude_unrated` is not `true`, or
  - The rule config `allow_unrated_in_rating` is truthy.
  Otherwise unrated players fail with `unrated_excluded` (or `unrated_excluded_by_criteria` when `exclude_unrated` is explicitly true).【F:supabase/functions/allocatePrizes/index.ts†L721-L742】
- Rated players are checked against provided `min_rating`/`max_rating`; failures add `rating_below_min` or `rating_above_max`. Passing rated players record `rating_ok` (and `rating_required_by_criteria` when `exclude_unrated` is true).【F:supabase/functions/allocatePrizes/index.ts†L743-L759】
- `criteria_json.include_unrated` is **not read** here; only `exclude_unrated` and the global `allow_unrated_in_rating` rule affect unrated handling.

## Truth table snapshots
| min? | max? | include_unrated | player.rating | player.unrated | Result (rating) |
| --- | --- | --- | --- | --- | --- |
| N | N | true | 1400 | false | Eligible (rating check skipped because no min/max)【F:supabase/functions/allocatePrizes/index.ts†L720-L743】 |
| N | N | true | null | true | Eligible (no rating bounds so unrated allowed by absence of check)【F:supabase/functions/allocatePrizes/index.ts†L720-L743】 |
| Y | Y | false | null | true | Ineligible (rating category + unrated rejected since only allow-unrated paths are false)【F:supabase/functions/allocatePrizes/index.ts†L721-L742】 |
| Y | Y | true | null | true | Ineligible (include flag ignored; unrated blocked without allow rules)【F:supabase/functions/allocatePrizes/index.ts†L721-L742】 |

## Veteran/age-only categories
When both `min_rating` and `max_rating` are absent, `isRatingCategory` returns false and the rating block is skipped entirely. Veteran/age-only categories rely solely on age/gender/etc. checks without rating gating.【F:supabase/functions/allocatePrizes/index.ts†L683-L759】

## Unrated-only configurability
No `unrated_only` (or similar) flag exists in criteria JSON; unrated players can only be optionally *included* alongside rated ones via `max_rating`-only or rule overrides. There is currently no way to configure an unrated-only category with the existing criteria model.【F:supabase/functions/allocatePrizes/index.ts†L720-L742】【F:supabase/functions/allocatePrizes/index.ts†L558-L559】

### Minimal change idea
Add an `unrated_only` boolean in criteria JSON; when true, allow categories with no rating bounds to still enter rating logic that requires `player.rating` to be null/absent (failing rated players). The new flag would need a branch in `evaluateEligibility` alongside `isRatingCategory` to enforce the unrated requirement before other rating thresholds.
