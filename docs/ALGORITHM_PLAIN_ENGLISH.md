# Allocation Algorithm (plain English, repo-grounded)

This is the **final, actual** prize allocation behavior as implemented in the repository. Every statement below points to the source of truth in code.

## Entrypoints and outputs (where allocation actually runs)
- **Preview allocation (organizer UI):** The Review Allocations page calls the `allocatePrizes` edge function when you click “Preview Allocation.” (src/pages/ConflictReview.tsx → `allocateMutation` invoking `supabase.functions.invoke('allocatePrizes')`, lines ~184–226)
- **Commit allocation:** The Finalize page calls the `finalize` edge function to write winners to the `allocations` table. (src/pages/Finalize.tsx → `finalizeMutation` invoking `supabase.functions.invoke('finalize')`, lines ~331–346; supabase/functions/finalize/index.ts → `Deno.serve`, lines ~19–227)
- **Public results read:** Public results pages read from the **latest finalized allocations** in the `allocations` table and the `published_tournaments` view (not from the allocator directly). (src/utils/getLatestAllocations.ts → `getLatestAllocations`, lines ~12–45; src/pages/PublicResults.tsx → `PublicResults`, lines ~28–120)
- **Team prizes (institution awards):** Team allocation uses `allocateInstitutionPrizes` for organizer views and `publicTeamPrizes` for public pages. (supabase/functions/allocateInstitutionPrizes/index.ts → `Deno.serve`, lines ~278–606; supabase/functions/publicTeamPrizes/index.ts → `Deno.serve`, lines ~123–395)

## The allocation flow in plain English (individual prizes)
1) **Load tournament + rules + data.** The allocator loads tournament dates, active categories/prizes, and players, then merges rule config defaults with DB overrides. (supabase/functions/allocatePrizes/index.ts → `Deno.serve`, lines ~344–612)
2) **Derive effective age bands (optional).** If `age_band_policy = non_overlapping`, overlapping U‑X categories are transformed into disjoint bands so each age belongs to only one band. Categories that share the same `max_age` receive the same derived band. (supabase/functions/allocatePrizes/index.ts → `Deno.serve` age band derivation, lines ~585–666)
3) **Build a global prize queue.** Every active prize across all active categories is placed into a single priority queue sorted by **cash → prize type → place → main/side → brochure order → prize id**, with an optional mode that can move “main vs side” earlier. (supabase/functions/allocatePrizes/index.ts → `prizeKey`, lines ~1596–1614; `makePrizeComparator`, lines ~1623–1659; queue build/sort in `Deno.serve`, lines ~688–706)
4) **Iterate prizes in priority order.** For each prize, the allocator evaluates **eligibility** for all players, filters out players who have already hit the per‑player prize cap, and picks the top remaining eligible player (or leaves the prize unfilled). (supabase/functions/allocatePrizes/index.ts → `Deno.serve`, lines ~790–1040; `canPlayerTakePrize`, lines ~314–332)
5) **Pick winners deterministically.**
   - Standard categories: pick the **best tournament rank** (lowest rank number). If rank ties, apply the tie‑break fields (rating then name by default, or a custom strategy). (supabase/functions/allocatePrizes/index.ts → `compareEligibleByRankRatingName`, lines ~1683–1715; `normalizeTieBreakStrategy`, lines ~24–30)
   - Youngest categories: pick the **youngest DOB** (most recent). If DOB ties, break by rank → rating → name. (supabase/functions/allocatePrizes/index.ts → `compareYoungestEligible`, lines ~1736–1766)
6) **Return preview data, never writing to DB.** The allocator returns winners, conflicts, unfilled prizes, and coverage diagnostics. (supabase/functions/allocatePrizes/index.ts → `Deno.serve` response, lines ~1068–1124)
7) **Finalize writes to DB.** The `finalize` edge function inserts allocations and increments the version, then marks the tournament as finalized. (supabase/functions/finalize/index.ts → `Deno.serve`, lines ~150–214)

## Eligibility rules (what makes a player eligible)
Eligibility is computed **per player, per category** based on the category’s `criteria_json` and rule config. (supabase/functions/allocatePrizes/index.ts → `evaluateEligibility`, lines ~1281–1514)

- **Gender:**
  - `F` means **girls only**; missing/unknown gender fails. (supabase/functions/allocatePrizes/index.ts → `evaluateEligibility`, lines ~1329–1350)
  - `M` and `M_OR_UNKNOWN` both mean **“not F”** (boys + unknown); explicit females are excluded. (supabase/functions/allocatePrizes/index.ts → `evaluateEligibility`, lines ~1316–1334)
  - Empty/other = **open**. (supabase/functions/allocatePrizes/index.ts → `evaluateEligibility`, lines ~1346–1350)
- **Age:** Uses tournament `start_date` (fallback: today) to compute age. If strict age is on, `min_age`/`max_age` (or derived bands) apply, and missing DOB can be allowed/blocked by rule config. (supabase/functions/allocatePrizes/index.ts → `yearsOn`, lines ~1154–1162; `evaluateEligibility`, lines ~1351–1404; `Deno.serve` tournament start date, lines ~423–435)
- **Rating & unrated handling:** Rating categories enforce min/max ratings for rated players; unrated handling is controlled by `unrated_only`, per‑category `include_unrated`, or legacy settings. (supabase/functions/allocatePrizes/index.ts → `evaluateEligibility`, lines ~1406–1488)
- **Location filters:** `allowed_states`, `allowed_cities`, and `allowed_clubs` use normalization/aliasing. (supabase/functions/allocatePrizes/index.ts → `matchesLocation`, lines ~1216–1262; `evaluateEligibility`, lines ~1490–1526)
- **Group/type/disability filters:** `allowed_groups`, `allowed_types`, and `allowed_disabilities` enforce case‑insensitive membership checks. (supabase/functions/allocatePrizes/index.ts → `evaluateEligibility`, lines ~1488–1514)
- **Youngest categories require DOB:** Missing DOB fails eligibility for `youngest_female` / `youngest_male` categories. (supabase/functions/allocatePrizes/index.ts → `evaluateEligibility`, lines ~1349–1354; `isYoungestCategory`, lines ~1718–1721)

## Per‑player prize cap (one prize vs multiple)
The allocator enforces a per‑player cap based on `multi_prize_policy`:
- `single`: one prize total.
- `main_plus_one_side`: one main + one side total (max 2 total).
- `unlimited`: no cap.

This gating happens **after eligibility** when building the final candidate list. (supabase/functions/allocatePrizes/index.ts → `canPlayerTakePrize`, lines ~314–332; `Deno.serve`, lines ~803–826)

## Manual overrides (Conflict Review)
Manual assignments are applied **before** auto‑allocation. If the forced player is ineligible and `force` is not set, the allocator emits a conflict and skips the assignment. (supabase/functions/allocatePrizes/index.ts → `Deno.serve` overrides loop, lines ~732–789)

## Conflicts + unfilled prizes
- **Conflict (tie) detection:** A conflict is emitted when a single player is eligible for multiple prizes with **identical priority keys** (cash/type/place/main/order/id). (supabase/functions/allocatePrizes/index.ts → conflict detection in `Deno.serve`, lines ~1040–1085; `prizeKey`, lines ~1596–1614)
- **Unfilled prizes:** If no eligible players remain, the prize is marked unfilled with reason codes and coverage diagnostics. (supabase/functions/allocatePrizes/index.ts → `Deno.serve` unfilled handling, lines ~825–906)

## Team prizes (institution awards) in plain English
Team prizes are a separate allocator; players can win both individual and team prizes.
- Players are grouped by **club/city/state/group/type** and scored by **rank points**: `(max_rank + 1 - player_rank)`. (supabase/functions/allocateInstitutionPrizes/index.ts → `GROUP_BY_COLUMN_MAP`, lines ~125–132; `getRankPoints`, lines ~152–158)
- Teams must satisfy required female/male slots; remaining slots are filled by best remaining players. (supabase/functions/allocateInstitutionPrizes/index.ts → `buildTeam`, lines ~195–259)
- Institutions are ranked by **total points**, then **rank sum**, then **best individual rank**, then name. (supabase/functions/allocateInstitutionPrizes/index.ts → `compareInstitutions`, lines ~171–189)

## Short, complete pseudocode (individual allocator)
```text
function allocatePrizes(tournamentId, overrides, ruleConfigOverride):
  load tournament (start_date)
  load categories+prizes where is_active != false
  load players ordered by rank
  load rule_config; merge defaults + overrides
  if age_band_policy == non_overlapping:
    derive effective age bands by max_age groups

  prizeQueue = all prizes with category, sort by makePrizeComparator()
  assignments = map(playerId -> assigned prizes)
  winners = []
  conflicts = []
  coverage = []

  apply manual overrides:
    if eligible or force:
      assign and record winner
    else:
      emit conflict

  for each prize in prizeQueue (priority order):
    if prize overridden: continue
    eligibleBefore = players where evaluateEligibility == true
    eligible = eligibleBefore filtered by canPlayerTakePrize
    if eligible is empty: record unfilled/coverage
    else:
      if category is youngest: sort by dob desc, rank, rating, name
      else: sort by rank asc, then tie_break_strategy
      winner = first eligible
      record assignment + coverage

  detect conflicts where a player has 2+ eligible prizes with identical prizeKey
  return { winners, conflicts, unfilled, coverage }
```
(Algorithm steps implemented in supabase/functions/allocatePrizes/index.ts → `Deno.serve`, `evaluateEligibility`, `makePrizeComparator`, `compareEligibleByRankRatingName`, `compareYoungestEligible`.)
