# How Prizes Are Decided — Organizer Guide (repo‑grounded)

This guide summarizes the **current** behavior of the allocator. For deeper detail see:
- [Algorithm (Plain English)](../ALGORITHM_PLAIN_ENGLISH.md)
- [Algorithm Rules Reference](../ALGORITHM_RULES.md)

## What the allocator uses
- **Final tournament rank** for each player (absolute rank, not category‑specific). (supabase/functions/allocatePrizes/index.ts → `compareEligibleByRankRatingName`, lines ~1683–1715)
- **Categories + prizes** (active only). (supabase/functions/allocatePrizes/index.ts → `Deno.serve`, lines ~468–505)
- **Eligibility rules** (age, gender, rating, location, group/type, disability). (supabase/functions/allocatePrizes/index.ts → `evaluateEligibility`, lines ~1281–1514)

## In what order are prizes awarded?
Prizes are **globally sorted** by value and priority, then allocated one‑by‑one:
1. Cash amount (higher first)
2. Trophy/medal strength (trophy > medal > none)
3. **Main vs side mode** and/or **place number** (depends on `main_vs_side_priority_mode`)
4. Category brochure order
5. Prize id (stable tiebreak)

(supabase/functions/allocatePrizes/index.ts → `makePrizeComparator`, lines ~1623–1659; `prizeKey`, lines ~1596–1614)

## How winners are chosen
- **Standard categories:** lowest tournament rank wins; ties break by rating then name by default. (supabase/functions/allocatePrizes/index.ts → `compareEligibleByRankRatingName`, lines ~1683–1715)
- **Youngest categories:** youngest DOB wins; ties break by rank → rating → name. (supabase/functions/allocatePrizes/index.ts → `compareYoungestEligible`, lines ~1736–1766)

## Can a player win multiple prizes?
Yes, but it depends on **multi_prize_policy**:
- `single` (default): one prize total.
- `main_plus_one_side`: one main + one side total (max 2).
- `unlimited`: no cap.

(supabase/functions/allocatePrizes/index.ts → `canPlayerTakePrize`, lines ~314–332)

## Manual overrides
Manual overrides are applied **before** automatic allocation. If an override is ineligible and not forced, it becomes a conflict instead of a winner. (supabase/functions/allocatePrizes/index.ts → override loop in `Deno.serve`, lines ~732–789)

## Team / institution prizes
Team prizes are calculated separately and can be awarded **in addition to** individual prizes. (supabase/functions/allocateInstitutionPrizes/index.ts → `Deno.serve`, lines ~278–606)
