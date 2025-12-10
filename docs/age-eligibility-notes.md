# Age Eligibility Rules

This document describes how age-based eligibility is configured and evaluated in Prize-Manager, including the configurable age band policies.

## Configuration

Age rules are configured in `criteria_json` using two numeric fields:

| Field | Description | Example |
|-------|-------------|---------|
| `max_age` | Maximum age (inclusive) for Under-X categories | `9` for U-9 |
| `min_age` | Minimum age (inclusive) for Veteran/Senior categories | `60` for Veteran 60+ |

### Examples

**Under-9 Category:**
```json
{ "max_age": 9 }
```

**Under-13 Category:**
```json
{ "max_age": 13 }
```

**Veteran 60+ Category:**
```json
{ "min_age": 60 }
```

**Age band (40-60):**
```json
{ "min_age": 40, "max_age": 60 }
```

## Age Band Policies (`age_band_policy`)

Each tournament has an `age_band_policy` that controls how children are matched to Under-X categories:

- **`non_overlapping` (default for new tournaments):** Age bands are split into adjacent ranges. For Under-8/11/14/17, the ranges become **[0–8]**, **[9–11]**, **[12–14]**, **[15–17]**. A 10-year-old will normally only be considered for **U11** under this policy.
- **`overlapping` (legacy/compatibility):** Under-X categories are independent range checks. With max_age 8/11/14/17, a 10-year-old is technically eligible for **U11, U14, and U17** simultaneously.

Tournament Directors can switch between these modes in **Edit Rules → Age Band Policy** (toggle). New tournaments default to `non_overlapping`. Existing tournaments that predate the switch retain `overlapping` to preserve historical allocations.

## Evaluation Logic

Age is calculated relative to the **tournament start date** (from `tournaments.start_date`).

The allocator (`allocatePrizes`) uses the `yearsOn(dob, date)` helper to compute full years:

1. If `max_age` is set and player's age > `max_age` → `age_above_max` (excluded)
2. If `min_age` is set and player's age < `min_age` → `age_below_min` (excluded)
3. If player has no DOB and `allow_missing_dob_for_age` is false → `missing_dob` (excluded)

## UI Configuration

In the "Edit Rules" sheet for a category:

- **Max Age (for Under-X categories)**: Enter the maximum age (e.g., 9, 11, 13)
- **Min Age (for Veteran/Senior)**: Enter the minimum age (e.g., 60)

Quick presets are available:
- U-9 → sets `max_age = 9`
- U-11 → sets `max_age = 11`
- U-13 → sets `max_age = 13`
- Veteran 60+ → sets `min_age = 60`

## Important Notes

1. **DOB-based cutoffs are NOT currently supported.** The legacy `dob_on_or_after` field is not read by the allocator. Use `max_age` instead.

2. **Age is calculated in full years.** A player born on 2014-06-01 is 10 years old on 2024-05-01.

3. **Both fields can be combined** for age bands (e.g., 40-60 age group).

## State-based Eligibility

State filtering is configured via `allowed_states` in `criteria_json`:

```json
{ "allowed_states": ["Maharashtra", "Karnataka", "MH", "KA"] }
```

The allocator performs case-insensitive matching against `players.state`.
