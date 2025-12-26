# Allocation Algorithm (plain English)

## Big picture (simple explanation)
- The system walks through every prize in priority order (biggest cash prizes first), and for each prize it picks the best eligible player who has not exceeded the prize-per-player policy. (supabase/functions/allocatePrizes/index.ts → makePrizeComparator, canPlayerTakePrize, Deno.serve)
- Eligibility is decided by the category’s rules like age, rating, gender, and location, using the tournament start date for age. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility, yearsOn; supabase/functions/allocatePrizes/index.ts → Deno.serve)
- For most categories, the best tournament rank wins; for "youngest" categories, the youngest eligible player wins. (supabase/functions/allocatePrizes/index.ts → compareEligibleByRankRatingName, compareYoungestEligible)

## Example 1: Prize priority order (cash → trophy/medal → place → main/side)
- Suppose two prizes have the same cash amount and same prize type (both trophies), but one is 1st place in a side category and the other is 4th place in the main category. (supabase/functions/allocatePrizes/index.ts → prizeKey)
- With the default `place_first` rule, the 1st-place side prize is considered higher priority than the 4th-place main prize, so it is assigned first. (supabase/functions/allocatePrizes/index.ts → makePrizeComparator)
- If a tournament switches `main_vs_side_priority_mode` to `main_first`, the main category prize would be preferred ahead of the side prize when cash and type are equal. (supabase/functions/allocatePrizes/index.ts → makePrizeComparator; src/pages/Settings.tsx → Settings)

## Example 2: Age bands with non-overlapping policy
- Imagine categories U8, U11, and U14 with only a `max_age` defined; the system can turn those into disjoint bands U8 (0–8), U11 (9–11), U14 (12–14). (supabase/functions/allocatePrizes/index.ts → Deno.serve)
- This happens only when `age_band_policy` is set to `non_overlapping` in tournament settings. (supabase/functions/allocatePrizes/index.ts → Deno.serve; src/pages/Settings.tsx → Settings)
- Players are then checked against the effective min/max ages for their category. (supabase/functions/allocatePrizes/index.ts → evaluateEligibility)

## Example 3: One player, one prize (or more)
- If `multi_prize_policy` is `single`, a player who already won any prize will not be considered for later prizes. (supabase/functions/allocatePrizes/index.ts → canPlayerTakePrize)
- If the policy is `main_plus_one_side`, a player can win one main prize and one side prize total. (supabase/functions/allocatePrizes/index.ts → canPlayerTakePrize)
- If the policy is `unlimited`, the same player can win multiple prizes without restriction. (supabase/functions/allocatePrizes/index.ts → canPlayerTakePrize)

## Team prizes (institution awards) in simple terms
- Team prizes group players by a field like club, city, or state and then score the top players in each group. (supabase/functions/allocateInstitutionPrizes/index.ts → GROUP_BY_COLUMN_MAP, getRankPoints)
- The team with the highest total points wins; ties are broken by rank sum, then best individual rank, then alphabetically. (supabase/functions/allocateInstitutionPrizes/index.ts → compareInstitutions)
- Teams can have required female/male slots (for example, 2 girls + 2 boys out of 4) before the remaining spots are filled by the strongest available players. (supabase/functions/allocateInstitutionPrizes/index.ts → buildTeam)
