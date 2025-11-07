# Prize Allocation Algorithm v1.1 — Product Specification

**Last Updated:** 2025-11-07  
**Status:** Production  
**Audience:** Internal team, QA engineers, future maintainers

---

## Overview

The Prize Allocation Algorithm is the deterministic engine that assigns prizes to players in a chess tournament based on their final standings, category eligibility, and organizer-defined prize structures. This document specifies version 1.1 of the algorithm, including deterministic tie-breaking rules and consistency validation.

---

## Scope

### In Scope
- **Deterministic prize allocation** using final tournament rankings
- **Multi-eligibility support** (players can qualify for multiple categories)
- **Tie-breaking rules** for players with identical ranks
- **Manual override system** for organizer adjustments
- **Conflict detection** for ambiguous allocation scenarios
- **Eligibility validation** (gender, age, rating, optional filters)
- **Value-based prize prioritization** (cash, trophies, medals)
- **Audit logging** for transparency and debugging

### Non-Goals
- **Category-specific ranking** (all prizes use absolute/final tournament rank)
- **Dynamic rule modification** during allocation (rules are fixed at runtime)
- **Real-time allocation** (runs as batch operation triggered by organizer)
- **Prize splitting** (one player gets one prize)

---

## Inputs

The algorithm receives:

1. **Tournament ID** (`tournament_id: UUID`)
   - References the active tournament
   - Used to fetch all related data

2. **Final Standings** (from `players` table)
   - `id`, `name`, `rank`, `rating`, `gender`, `date_of_birth`
   - `fide_id`, `disability`, `city`, `state`, `club`
   - Rank is **absolute/final** (not category-specific)

3. **Categories** (from `categories` table)
   - `id`, `name`, `brochure_order`, `active`, `min_age`, `max_age`
   - `gender`, `min_rating`, `max_rating`, `allow_unrated`
   - `disability`, `city`, `state`, `club` (optional filters)

4. **Prizes** (from `prizes` table, nested under categories)
   - `id`, `category_id`, `place`, `cash`, `trophy`, `medal`
   - `active`, `main_category` (flag for primary vs. sub-category)

5. **Manual Overrides** (optional, from request payload)
   - `{ prize_id: UUID, player_id: UUID }[]`
   - Processed **before** automatic allocation

6. **Rule Configuration** (from `rule_config` or request payload)
   - `allowUnratedInRatingCategory: boolean` (default: false)
   - `multipleEligibilityMode: 'first-win' | 'allow-multiple'` (default: 'first-win')
   - Future: `useHighestValuePrize`, `useCategoryRank`, etc. (v1.2+)

---

## Outputs

The algorithm returns:

1. **Winners** (`{ prize_id, player_id }[]`)
   - Deterministic list of prize allocations
   - One player per prize (no duplicates unless configured)

2. **Conflicts** (`{ prize_id, player_id, reason, conflicted_with? }[]`)
   - Scenarios where allocation is ambiguous (e.g., identical rank/rating/name)
   - Requires organizer review or re-run with manual override

3. **Unfilled Prizes** (`prize_id[]`)
   - Prizes with no eligible players after allocation

4. **Metadata**
   - `allocatedCount`, `conflictCount`, `unfilledCount`
   - `manualOverrideCount`, `timestamp`

---

## Core Algorithm

### Step 1: Build Prize Queue

All active prizes are collected and sorted by **brochure order** using a multi-level comparator:

```typescript
function prizeKey(prize, category):
  return [
    category.brochure_order,   // Primary: Category order in brochure
    valueTier(prize),           // Secondary: Value tier (see below)
    prize.cash ?? 0,            // Tertiary: Cash amount (descending)
    prize.main_category ? 0:1,  // Quaternary: Main category first
    prize.place,                // Quinary: Prize place (1st, 2nd, 3rd...)
    prize.id                    // Final: Stable UUID sort
  ]
```

**Value Tier Hierarchy:**
1. **Tier 1 (5):** Cash + Trophy
2. **Tier 2 (4):** Cash + Medal
3. **Tier 3 (3):** Cash only
4. **Tier 4 (2):** Trophy only
5. **Tier 5 (1):** Medal only
6. **Tier 0 (0):** None (no value)

**Sorting:** Prizes are sorted **ascending** by `prizeKey`, so the first prize in the queue is the most important.

---

### Step 2: Process Manual Overrides

For each manual override `{ prize_id, player_id }`:
1. Validate that both prize and player exist
2. Validate eligibility (age, gender, rating, optional filters)
3. If valid: assign prize, mark player as "already won"
4. If invalid: add to conflicts with reason

Manual overrides are processed **before** automatic allocation and **skip** the normal queue order.

---

### Step 3: Automatic Allocation (Greedy)

For each prize in the queue (in order):

1. **Fetch Eligible Players**
   - Filter by category eligibility (see "Eligibility Evaluation" below)
   - Exclude players who already won a prize (unless `allow-multiple` mode)

2. **Sort Eligible Players (Deterministic Tie-Breaking)**
   ```
   ORDER BY:
     rank ASC,        -- Lower rank wins
     rating DESC,     -- Higher rating breaks ties
     name ASC         -- Alphabetical name breaks ties
   ```
   This ensures **deterministic, reproducible results** even with identical ranks.

3. **Select Winner**
   - Take the **first** player from the sorted list
   - Assign prize to player
   - Mark player as "already won" (if `first-win` mode)
   - Log allocation: `[alloc.win] prize=<id> player=<id> rank=<rank> tie_break=<rating|name|none>`

4. **Conflict Detection**
   - If multiple players have **identical** rank, rating, and name → conflict
   - (In practice, names are unique, so this is rare)
   - Log conflict: `[alloc.conflict] prize=<id> tied_players=[...]`

---

### Step 4: Unfilled Prizes

After processing all prizes:
- Any prize without a winner is added to `unfilled_prizes[]`
- Reasons: no eligible players, all eligible players already won prizes, etc.

---

## Eligibility Evaluation

A player is eligible for a category prize if **all** of the following conditions are met:

### 1. Gender Match
```typescript
if (category.gender) {
  if (normalize(player.gender) !== normalize(category.gender)) {
    return { eligible: false, reason: 'gender_mismatch' };
  }
}
```

### 2. Age Range (on Tournament Start Date)
```typescript
const age = yearsOn(player.date_of_birth, tournament.start_date);
if (category.min_age && age < category.min_age) {
  return { eligible: false, reason: 'below_min_age' };
}
if (category.max_age && age > category.max_age) {
  return { eligible: false, reason: 'above_max_age' };
}
```

### 3. Rating Range
```typescript
const isRatingCategory = category.min_rating || category.max_rating;
if (isRatingCategory && !player.rating) {
  if (!rules.allowUnratedInRatingCategory) {
    return { eligible: false, reason: 'unrated_in_rating_category' };
  }
}
if (category.min_rating && player.rating < category.min_rating) {
  return { eligible: false, reason: 'below_min_rating' };
}
if (category.max_rating && player.rating > category.max_rating) {
  return { eligible: false, reason: 'above_max_rating' };
}
```

### 4. Optional Filters
```typescript
if (category.disability && player.disability !== category.disability) {
  return { eligible: false, reason: 'disability_mismatch' };
}
if (category.city && player.city !== category.city) {
  return { eligible: false, reason: 'city_mismatch' };
}
if (category.state && player.state !== category.state) {
  return { eligible: false, reason: 'state_mismatch' };
}
if (category.club && player.club !== category.club) {
  return { eligible: false, reason: 'club_mismatch' };
}
```

**If all checks pass:** `{ eligible: true }`

---

## Multi-Eligibility Rules

### Scenario
A player qualifies for multiple categories (e.g., "Under 12" and "Girls Under 14").

### Modes

#### 1. `first-win` (Default)
- Player can **win only one prize** (the first they qualify for in brochure order)
- After winning, they are excluded from all subsequent prize evaluations
- **Use case:** Most tournaments want to maximize prize distribution

#### 2. `allow-multiple` (Configurable)
- Player can **win multiple prizes** if eligible
- No exclusion after first win
- **Use case:** Small tournaments, or tournaments with excess prizes

**Note:** Current implementation (v1.1) defaults to `first-win`. The `allow-multiple` mode is planned for v1.2 as a configurable rule.

---

## Consistency Validation (Planned v1.2)

### Purpose
Detect scenarios where a category prize winner has a **worse final rank** than a non-winner in the same category.

### Algorithm (Non-Blocking)
```typescript
for (const category of categories) {
  const winners = getWinnersForCategory(category);
  const nonWinners = getEligibleNonWinners(category);
  
  for (const winner of winners) {
    for (const nonWinner of nonWinners) {
      if (nonWinner.rank < winner.rank) {
        log.warn(`[alloc.consistency] category=${category.id} prize=${winner.prize_id} 
                  winner=${winner.player_id} rank=${winner.rank} 
                  bypassed=${nonWinner.player_id} rank=${nonWinner.rank}`);
      }
    }
  }
}
```

### Behavior
- **Does NOT alter results** (allocation proceeds as normal)
- Logs warnings for organizer review
- Helps identify edge cases (e.g., player won higher-value prize earlier)

**Status:** Not implemented in v1.1. Planned for v1.2 as an optional post-allocation audit.

---

## Logging Specification

### Allocation Logs
```
[alloc] tId=<tournament_id> allocating for tournament
[alloc] queue=<count> prizes in queue
[alloc.win] prize=<prize_id> player=<player_id> rank=<final_rank> 
            rating=<rating> tie_break=<rating|name|none> category=<category_id>
[alloc.conflict] prize=<prize_id> tied_players=[<player_id>, ...] reason=<...>
[alloc.unfilled] prize=<prize_id> reason=<no_eligible_players|all_won>
[alloc] done: allocated=<count> conflicts=<count> unfilled=<count>
```

### Tie-Break Reasons
- `none`: Single eligible player (no tie)
- `rating`: Multiple players with same rank, winner had highest rating
- `name`: Multiple players with same rank and rating, winner alphabetically first

---

## Error Handling

### Validation Errors (4xx)
- Invalid `tournament_id` → `404 Tournament not found`
- Invalid `prize_id` or `player_id` in manual override → `400 Invalid override`
- Missing required fields → `400 Bad request`

### Allocation Errors (5xx)
- Database connection failure → `500 Internal server error`
- Timeout (edge function > 60s) → `504 Gateway timeout`

### Conflict Handling
- Conflicts are **not errors** — they are valid outputs
- Organizer must resolve conflicts via:
  1. Manual override + re-run allocation
  2. Adjust category/prize definitions + re-run

---

## Security & RLS

- All queries enforce Row-Level Security (RLS) policies
- Only tournament owner can trigger allocation
- `auth.uid()` must match `tournaments.user_id`
- Prevents cross-tenant data access

---

## Performance Notes

- **O(P × E)** complexity, where:
  - `P` = number of prizes
  - `E` = average eligible players per prize
- Typical tournament: 50 prizes × 20 eligible players = 1,000 evaluations
- Edge function timeout: 60 seconds (sufficient for <500 players)
- For larger tournaments (>500 players), consider:
  1. Index optimization on `players.rank`, `players.rating`
  2. Batch processing (split categories into chunks)

---

## Acceptance Tests

### Test 1: Simple Rank Ordering
**Setup:**
- 1 category: "Open"
- 3 prizes: 1st place, 2nd place, 3rd place
- 5 players: ranks 1, 2, 3, 4, 5

**Expected:**
- 1st place → Player with rank 1
- 2nd place → Player with rank 2
- 3rd place → Player with rank 3
- Players 4 and 5 do not win

---

### Test 2: Tie-Break by Rating
**Setup:**
- 1 category: "Open"
- 1 prize: 1st place
- 3 players: all rank 1, ratings [2200, 2100, 2300]

**Expected:**
- 1st place → Player with rating 2300 (highest rating)
- Log: `tie_break=rating`

---

### Test 3: Tie-Break by Name
**Setup:**
- 1 category: "Open"
- 1 prize: 1st place
- 3 players: all rank 1, all rating 2000, names ["Charlie", "Alice", "Bob"]

**Expected:**
- 1st place → Alice (alphabetically first)
- Log: `tie_break=name`

---

### Test 4: Multi-Eligibility (first-win mode)
**Setup:**
- 2 categories: "Open" (brochure_order=1), "Under 18" (brochure_order=2)
- Player A: rank 1, age 16, eligible for both

**Expected:**
- Player A wins "Open" 1st place
- Player A **excluded** from "Under 18" prizes
- "Under 18" 1st place goes to next eligible player

---

### Test 5: Gender Filtering
**Setup:**
- 1 category: "Girls Open", gender="F"
- 3 players: rank 1 (M), rank 2 (F), rank 3 (F)

**Expected:**
- 1st place → Player with rank 2 (first eligible female)
- Player with rank 1 excluded (gender mismatch)

---

### Test 6: Age Filtering
**Setup:**
- 1 category: "Under 12", max_age=12
- 3 players: rank 1 (age 13), rank 2 (age 11), rank 3 (age 10)

**Expected:**
- 1st place → Player with rank 2 (first eligible under 12)
- Player with rank 1 excluded (above_max_age)

---

### Test 7: Manual Override
**Setup:**
- 1 category: "Open"
- 1 prize: 1st place
- Manual override: `{ prize_id: <1st_place>, player_id: <rank_5_player> }`

**Expected:**
- 1st place → Player with rank 5 (manual override)
- No automatic allocation for this prize
- Player with rank 1 does **not** win this prize

---

### Test 8: Unfilled Prize (No Eligible Players)
**Setup:**
- 1 category: "Girls Under 10", gender="F", max_age=10
- No female players under 10 in tournament

**Expected:**
- All prizes in category added to `unfilled_prizes[]`
- Reason: `no_eligible_players`

---

## Change Log

### v1.1 (2025-11-07)
- ✅ **Deterministic tie-breaking** using `rank ASC → rating DESC → name ASC`
- ✅ **Multi-eligibility support** with `first-win` mode (default)
- ✅ **Manual override system** for organizer adjustments
- ✅ **Conflict detection** for identical-priority scenarios
- ✅ **Value tier hierarchy** (Cash+Trophy > Cash+Medal > Cash > Trophy > Medal)
- ✅ **Comprehensive logging** with tie-break reasons
- 📋 **Planned:** Consistency validation (non-blocking audit)
- 📋 **Planned:** `allow-multiple` mode for multi-prize winners

### v1.0 (Initial)
- Basic greedy allocation by brochure order
- Eligibility filters (gender, age, rating, optional fields)
- RLS enforcement
- Edge function deployment

---

## References

- **Implementation:** `supabase/functions/allocatePrizes/index.ts`
- **Organizer Guide:** [./organizer-guide.md](./organizer-guide.md)
- **Database Schema:** Supabase migrations (see `supabase/migrations/`)
- **Custom Knowledge Base:** Prize-Manager — System & Invariants (2025-11-02 IST)

---

**Maintained by:** Prize-Manager Engineering Team  
**Questions?** Contact the project maintainer or review the allocator source code.
