# Allocator Null-Safety Integration Tests

## Overview

The `tests/allocator-null-safety.spec.ts` suite provides comprehensive integration testing to verify that the prize allocation engine handles missing optional fields gracefully without crashes or undefined behavior.

## Why Null-Safety Testing Matters

Real-world tournament imports often have incomplete data:
- Swiss-Manager exports may omit gender columns
- Players without FIDE registration lack ratings
- DOB may be unknown for certain participants
- State/club information might not be collected

**The allocator MUST handle these cases gracefully**, excluding ineligible players with clear reason codes rather than crashing or producing undefined results.

## Test Coverage

### 1. Missing Gender (when category requires it)
**Test:** `handles missing gender gracefully when category requires it`

- **Setup:** Women's category requiring gender='F'
- **Import:** Players without gender field
- **Expected:** `gender_missing` reason code, prizes unfilled, no crashes
- **Validates:** Gender filter null-safety in `evaluateEligibility()`

### 2. Missing DOB (when category has age rules)
**Test:** `handles missing DOB when category has age rules`

- **Setup:** U13 category with max_age=13
- **Import:** Players without DOB field
- **Expected:** `dob_missing` reason code, age check skipped gracefully
- **Validates:** Age calculation null-safety via `yearsOn()`

### 3. Missing Rating (in rating categories)
**Test:** `handles missing rating in rating categories`

- **Setup:** Below 1800 category with max_rating=1800
- **Import:** Players without rating field
- **Expected:** `unrated_excluded` reason code (when allow_unrated=false)
- **Validates:** Rating category null-safety with `isRatingCategory()` check

### 4. Missing State/City/Club (filter categories)
**Test:** `handles missing state/city/club filters gracefully`

- **Setup:** Karnataka-only category with allowed_states=['KA']
- **Import:** Players without state field
- **Expected:** `state_excluded` reason code
- **Validates:** Optional filter null-safety via `inList()` helper

### 5. Multiple Missing Fields
**Test:** `handles multiple missing fields without crashing`

- **Setup:** Complex category with gender, age, rating, and state requirements
- **Import:** Minimal player data (name + rank only)
- **Expected:** Multiple reason codes, no crashes, UI remains functional
- **Validates:** Compound null-safety across all eligibility checks

### 6. Null vs Empty String vs Undefined
**Test:** `distinguishes between null, undefined, and empty string`

- **Setup:** Open category (no strict requirements)
- **Import:** Mix of `null`, `""`, and missing values
- **Expected:** Correct normalization, valid players still win prizes
- **Validates:** Value coercion in `normGender()`, `yearsOn()`, and field access

## Allocator Code Guards

The tests validate these null-safety patterns in `supabase/functions/allocatePrizes/index.ts`:

### Gender Check (lines 348-369)
```typescript
const reqG = c.gender?.toUpperCase?.() || null;
const pg = normGender(player.gender);  // Returns null for missing/invalid
if (reqG === 'M') {
  if (!pg) {
    failCodes.add('gender_missing');  // Graceful failure
  }
  // ...
}
```

### Age Check (lines 371-393)
```typescript
const age = yearsOn(player.dob ?? null, onDate);  // Returns null if missing
const hasAgeRule = strict && (c.max_age != null || c.min_age != null);
if (hasAgeRule) {
  if (age == null) {
    failCodes.add('dob_missing');  // Graceful failure
    ageOk = false;
  }
  // ...
}
```

### Rating Check (lines 395-424)
```typescript
const rating = (player.rating == null ? null : Number(player.rating));
if (ratingCat) {
  if ((rating == null || rating === 0)) {
    if (!allowUnrated) {
      failCodes.add('unrated_excluded');  // Graceful exclusion
    }
  }
  // ...
}
```

### Optional Filters (lines 426-457)
```typescript
const inList = (val: any, arr?: any[]) =>
  !arr || arr.length === 0 || 
  arr.map(x => String(x).toLowerCase()).includes(String(val ?? '').toLowerCase());

if (Array.isArray(c.allowed_states) && c.allowed_states.length > 0) {
  if (!inList(player.state, c.allowed_states)) {
    failCodes.add('state_excluded');  // Graceful filter
  }
}
```

## Reason Code Reference

Tests verify these reason codes are emitted for missing fields:

| Reason Code | Trigger | Category Type |
|-------------|---------|---------------|
| `gender_missing` | No gender when category requires M/F | Gender-filtered |
| `dob_missing` | No DOB when strict age rules active | Age-filtered |
| `unrated_excluded` | No rating in rating category (allow_unrated=false) | Rating-filtered |
| `state_excluded` | State not in allowed_states list | State-filtered |
| `city_excluded` | City not in allowed_cities list | City-filtered |
| `club_excluded` | Club not in allowed_clubs list | Club-filtered |
| `disability_excluded` | Disability not in allowed_disabilities list | Disability-filtered |

## Running the Tests

```bash
# Run all null-safety tests
npm run test tests/allocator-null-safety.spec.ts

# Run in UI mode (recommended for development)
npm run test:ui

# Run specific test
npm run test tests/allocator-null-safety.spec.ts -g "missing gender"

# Run in headed mode (see browser)
npm run test tests/allocator-null-safety.spec.ts -- --headed
```

## Expected Test Results

All 6 tests should **PASS**:
- ✅ handles missing gender gracefully when category requires it
- ✅ handles missing DOB when category has age rules
- ✅ handles missing rating in rating categories
- ✅ handles missing state/city/club filters gracefully
- ✅ handles multiple missing fields without crashing
- ✅ distinguishes between null, undefined, and empty string

## Critical Guarantees

These tests enforce the following system invariants:

1. **No crashes on missing data** - Allocator completes successfully even with minimal player data
2. **Clear reason codes** - Users understand why prizes are unfilled
3. **Deterministic behavior** - Same input → same output, regardless of null representation
4. **UI remains functional** - Finalize page is still usable after allocation with missing data
5. **Graceful degradation** - Players with complete data can still win prizes when others have missing fields

## Related Documentation

- [Prize Allocation Algorithm Specification](./allocator/README.md)
- [Organizer Guide: How Prizes Are Decided](./allocator/organizer-guide.md)

## Maintenance Notes

**When adding new eligibility criteria:**
1. Add null-safety checks in `evaluateEligibility()`
2. Define appropriate reason codes
3. Add test case to `allocator-null-safety.spec.ts`
4. Update this documentation

**When modifying field access:**
- Always use `player.field ?? null` or `player.field || null` patterns
- Never assume fields exist without checking
- Emit actionable reason codes for debugging
