# Tournament Settings Reference

This document provides a complete reference for all configurable settings available at `/t/<id>/settings`. Each setting is stored in the `rule_config` table and directly impacts allocator behavior.

## Quick Summary

| Setting | Default | Stored In | Used By Allocator | Impacts Outcome |
|---------|---------|-----------|-------------------|-----------------|
| Strict Age Eligibility | ON | `rule_config.strict_age` | ✅ Yes | ✅ Yes |
| Allow Missing DOB for Age | OFF | `rule_config.allow_missing_dob_for_age` | ✅ Yes | ✅ Yes |
| Inclusive Maximum Age | ON | `rule_config.max_age_inclusive` | ✅ Yes | ✅ Yes |
| Allow Unrated in Rating Bands | OFF | `rule_config.allow_unrated_in_rating` | ✅ Yes | ✅ Yes |
| Main-first vs Place-first (Main vs Side only) | Place First | `rule_config.main_vs_side_priority_mode` | ✅ Yes | ✅ Yes |
| Age Band Policy | Non-overlapping | `rule_config.age_band_policy` | ✅ Yes | ✅ Yes |
| Prize Stacking Policy | Single | `rule_config.multi_prize_policy` | ✅ Yes | ✅ Yes |
| Category Priority Order | Current order | `categories.order_idx` | ✅ Yes | ✅ Yes |

---

## Detailed Setting Reference

### Strict Age Eligibility

**Column:** `rule_config.strict_age`  
**Type:** `boolean`  
**Default:** `true` (ON)  
**UI Location:** Toggle switch in "Default Allocation Rules" section

**What it does:**

When enabled, players **without a DOB** are excluded from age-based prize categories. This prevents unverifiable eligibility claims.

**Allocator behavior:**
- **ON:** `isAgeEligible()` returns `false` for players with `dob = null` when the category has age criteria.
- **OFF:** Players with missing DOB may still be considered for age prizes (subject to `allow_missing_dob_for_age`).

**Reason codes:**
- `NO_DOB` — Player lacks birthdate and strict_age is enabled
- `AGE_OUT_OF_RANGE` — Player has DOB but falls outside the category's age band

**Important:** This setting does NOT affect cross-band eligibility (U11 → U15). That's controlled by `age_band_policy`.

---

### Allow Missing DOB for Age Rules

**Column:** `rule_config.allow_missing_dob_for_age`  
**Type:** `boolean`  
**Default:** `false` (OFF)  
**UI Location:** Toggle switch in "Default Allocation Rules" section

**What it does:**

When enabled, players with missing birthdates are treated as **eligible** for age-based categories but flagged for manual review.

**Allocator behavior:**
- **OFF (default):** Players with `dob = null` are ineligible for any category with age criteria.
- **ON:** Players with `dob = null` can win age prizes, but receive a warning flag in the debug report.

**Example:**
- Category: "Under 14 Best"
- Player: Rating top-ranked, DOB missing
- **ON:** ✅ Eligible (flagged with `dob_missing_allowed`)
- **OFF:** ❌ Ineligible (fails with `dob_missing`)

**Interaction with `strict_age`:**

| strict_age | allow_missing_dob_for_age | Result for DOB-less player in age category |
|------------|---------------------------|---------------------------------------------|
| ON | OFF | ❌ Ineligible (`NO_DOB`) |
| ON | ON | ⚠️ Eligible with warning |
| OFF | (ignored) | ⚠️ Eligible with warning |

---

### Inclusive Maximum Age

**Column:** `rule_config.max_age_inclusive`  
**Type:** `boolean`  
**Default:** `true` (ON)  
**UI Location:** Toggle switch in "Default Allocation Rules" section

**What it does:**

Determines whether players exactly AT the maximum age boundary are included in that category.

**Allocator behavior:**
- **ON (default):** A player aged exactly 11 qualifies for "Under 11" (max_age = 11).
- **OFF:** A player aged exactly 11 does NOT qualify for "Under 11" — they must be strictly less than 11.

**Example:**
- Category: "Under 11" with `max_age = 11`
- Player: Born Jan 1, 2014 (age 11 on tournament date Jan 15, 2025)
- **Inclusive ON:** ✅ Eligible (11 ≤ 11)
- **Inclusive OFF:** ❌ Ineligible (11 is not < 11)

---

### Allow Unrated in Rating Bands

**Column:** `rule_config.allow_unrated_in_rating`  
**Type:** `boolean`  
**Default:** `false` (OFF)  
**UI Location:** Not currently exposed in Settings UI (legacy rule_config value)

**What it does:**

Sets the **global fallback** for rating categories when the category does not explicitly set `include_unrated`. It controls whether unrated players may enter rating bands by default.

**Allocator behavior:**
- **OFF (default):** Unrated players are excluded from rating categories unless `include_unrated = true`, `unrated_only = true`, or the category is a max-only band (legacy behavior).
- **ON:** Unrated players are eligible in rating categories when `include_unrated` is unset.

**Example:**
- Category: "Below 1600" with `min_rating = 1200`, `max_rating = 1600`, `include_unrated` unset
- Player: No rating (unrated)
- **Global OFF:** ❌ Ineligible
- **Global ON:** ✅ Eligible (passes `rating_unrated_allowed`)

**Note:** Per-category `include_unrated` and `unrated_only` always override this setting.

---

### Main-first vs Place-first (Main vs Side only)

**Column:** `rule_config.main_vs_side_priority_mode`  
**Type:** `'place_first' | 'main_first'`  
**Default:** `'place_first'`  
**UI Location:** Radio button group in "Default Allocation Rules" section

**What it does:**

Controls the tie-break when comparing Main vs Side prizes with equal cash and prize type (trophy/medal).

**Allocator behavior:**

The prize comparator uses this hierarchy:

1. **Cash amount** — Higher wins
2. **Prize type** — Trophy > Medal > None
3. **(Conditional) Main vs Side** — Only when `main_first` AND comparing Main vs Side
4. **Place number** — 1st > 2nd > 3rd
5. **Category brochure order** — Earlier = higher priority
6. **Prize ID** — Alphabetical (stable tie-breaker)

**Mode `place_first` (default):**
```
Cash → Type → Place → Main → Order → ID
```
A Side 1st prize beats a Main 4th prize (when cash/type match).

**Mode `main_first`:**
```
Cash → Type → Main (if Main vs Side) → Place → Order → ID
```
A Main 4th prize beats a Side 1st prize (when cash/type match).

**Important:** This ONLY affects Main vs Side comparisons:
- Side vs Side: Always uses place first
- Main vs Main: Always uses place first

**Example:**
- Prize A: Main 4th, ₹5000, trophy
- Prize B: Side 1st, ₹5000, trophy
- **Place-first:** Side 1st wins
- **Main-first:** Main 4th wins

See [Prize Priority Hierarchy](./allocator/prize-priority-hierarchy.md) for detailed examples.

---

### Age Band Policy

**Column:** `rule_config.age_band_policy`  
**Type:** `'non_overlapping' | 'overlapping'`  
**Default:** `'non_overlapping'`  
**UI Location:** Toggle switch in "Default Allocation Rules" section

**What it does:**

Determines how Under-X age categories interact with each other.

**Non-overlapping (default, recommended):**

Each child fits exactly one age band. Bands are derived from configured max ages:

| Category | Effective Band |
|----------|----------------|
| U8 | Ages 0–8 |
| U11 | Ages 9–11 |
| U14 | Ages 12–14 |
| U17 | Ages 15–17 |

A 10-year-old is eligible for **U11 only**.

**Overlapping:**

Each Under-X is independent. A child can qualify for multiple bands:

| Category | Eligible Ages |
|----------|---------------|
| U8 | 0–8 |
| U11 | 0–11 |
| U14 | 0–14 |
| U17 | 0–17 |

A 10-year-old is eligible for **U11, U14, and U17**.

**Use cases:**
- **Non-overlapping:** One age prize per child (most tournaments)
- **Overlapping:** Cascading eligibility for special events

**Example:** A 12-year-old is eligible for U14 only in non-overlapping mode, but U14 and U17 in overlapping mode.

See [Age Band Policies](./allocator/age-policies.md) for implementation details.

---

### Prize Stacking Policy

**Column:** `rule_config.multi_prize_policy`  
**Type:** `'single' | 'main_plus_one_side' | 'unlimited'`  
**Default:** `'single'`  
**UI Location:** Radio button group in "Default Allocation Rules" section

**What it does:**

Controls how many prizes a single player can receive.

**Mode `single` (default, recommended):**

Each player receives at most one prize. After a player is assigned their best eligible prize, they are marked "claimed" and excluded from all remaining allocations.

**Mode `main_plus_one_side`:**

A player can win:
- One Main category prize, AND
- One Side category prize (rating, age, gender, etc.)

**Mode `unlimited`:**

No cap. If a player is best in multiple categories, they receive all those prizes.

**Warning:** Non-strict modes reduce the number of distinct winners. Use only when the tournament brochure explicitly allows prize stacking.

**Example:** In `main_plus_one_side`, a player can win Main 1st plus Best U14, but not a third prize.

---

## Category Order (Brochure Order)

**Column:** `categories.order_idx`  
**Type:** `integer`  
**Set via:** Drag-and-drop in Prize Setup, or `/t/<id>/category-order` review page

**What it does:**

Determines the priority order when multiple prizes have identical cash, type, place, and main status.

**Allocator behavior:**

Categories with lower `order_idx` have higher priority. This is the fifth tie-break level after cash, type, place (or main in `main_first` mode), and main status.

**Example:**
- Prize A: ₹5000, trophy, 1st, Side, order_idx=0
- Prize B: ₹5000, trophy, 1st, Side, order_idx=2
- **Winner:** Prize A (lower order_idx)

---

## Gotchas: Settings That Flip Outcomes

### Gotcha 1: Main vs Side Prize Conflict

**Scenario:** Player qualifies for both Main 4th (₹8000 + trophy) and Below-1800 1st (₹8000 + trophy).

| Setting | Winner | Why |
|---------|--------|-----|
| `place_first` (default) | Below-1800 1st | 1st place beats 4th place |
| `main_first` | Main 4th | Main category prestige wins |

**Fix:** Set `main_vs_side_priority_mode` based on whether you value place or category prestige.

---

### Gotcha 2: Missing DOB Blocks Age Prize

**Scenario:** Top-ranked player has no birthdate on file. They would otherwise win "Under 14 Best" (₹3000).

| strict_age | allow_missing_dob_for_age | Result |
|------------|---------------------------|--------|
| ON | OFF | ❌ Ineligible — prize goes to next player |
| ON | ON | ✅ Eligible with warning flag |
| OFF | * | ✅ Eligible with warning flag |

**Fix:** Either import DOB data properly, or enable `allow_missing_dob_for_age` for lenient handling.

---

### Gotcha 3: Age Boundary Exclusion

**Scenario:** Tournament date is Jan 15, 2025. Player born Jan 1, 2014 is exactly 11 years old. Category is "Under 11" with `max_age = 11`.

| max_age_inclusive | Result |
|-------------------|--------|
| ON (default) | ✅ Eligible (11 ≤ 11) |
| OFF | ❌ Ineligible (11 is not < 11) |

**Fix:** Most tournaments keep `max_age_inclusive = ON` for FIDE-style "Under X" rules.

---

### Gotcha 4: Cross-Band Eligibility Surprise

**Scenario:** You want a 10-year-old to be eligible for both U11 and U14.

| age_band_policy | Result |
|-----------------|--------|
| `non_overlapping` (default) | Only U11 (ages 9–11) |
| `overlapping` | Both U11 and U14 |

**Fix:** Switch to `overlapping` if you want cascading age eligibility.

**Note:** Overlapping does NOT allow U15 → U11. The `max_age` limit is always hard; overlapping only extends eligibility **upward**.

---

### Gotcha 5: Winner Concentration with Prize Stacking

**Scenario:** Tournament has 10 categories. Top player qualifies for 5 of them.

| multi_prize_policy | Result |
|--------------------|--------|
| `single` (default) | Top player gets 1 prize; 4 other players get prizes |
| `main_plus_one_side` | Top player gets 2 prizes; 3 other players get prizes |
| `unlimited` | Top player gets 5 prizes; 0 other players get those prizes |

**Fix:** Keep `single` unless the brochure explicitly allows stacking.

---

## Database Schema

Settings are stored in the `rule_config` table:

```sql
CREATE TABLE rule_config (
  tournament_id UUID PRIMARY KEY REFERENCES tournaments(id),
  strict_age BOOLEAN DEFAULT true,
  allow_unrated_in_rating BOOLEAN DEFAULT false,
  allow_missing_dob_for_age BOOLEAN DEFAULT false,
  max_age_inclusive BOOLEAN DEFAULT true,
  age_band_policy TEXT DEFAULT 'non_overlapping', -- 'non_overlapping' | 'overlapping'
  multi_prize_policy TEXT DEFAULT 'single', -- 'single' | 'main_plus_one_side' | 'unlimited'
  main_vs_side_priority_mode TEXT DEFAULT 'place_first', -- 'place_first' | 'main_first'
  prefer_main_on_equal_value BOOLEAN DEFAULT false, -- legacy, now derived from main_vs_side_priority_mode
  category_priority_order JSONB DEFAULT '[]', -- reserved (not used by allocator)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## Related Documentation

- [Prize Priority Hierarchy](./allocator/prize-priority-hierarchy.md) — Full comparator logic with examples
- [Age Band Policies](./allocator/age-policies.md) — Non-overlapping vs overlapping bands
- [Organizer Guide](./allocator/organizer-guide.md) — How prizes are decided
- [User Guide](./USER_GUIDE.md) — End-to-end tournament workflow
