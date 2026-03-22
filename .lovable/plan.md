

# Fix: Data Coverage Bar Shows Ballooned Percentages (9987%, 1005%, etc.)

## Issue
All Data Coverage chips display values ~100× too large (e.g., DOB shows **9987%** instead of **99%**). Color coding is also broken — everything shows green because the thresholds compare against 0.8/0.5 but receive values in the thousands.

## Root Cause
**Double multiplication by 100** in `src/components/import/DataCoverageBar.tsx`:

```text
coverage.dob = 0.9987  (ratio, correct)

Line 68:  percent = coverage.dob * 100   →  99.87   (first ×100)
Line 27:  display = percent * 100        →  9987    (second ×100)
Line 20:  color   = 9987 >= 0.8 ? green  →  always green (broken)
```

The `CoverageChip` component already multiplies by 100 for display (line 27) AND expects a 0–1 ratio for color thresholds (lines 20–22). But lines 68–73 pre-multiply by 100 before passing.

## Fix — 1 file, 3 line changes

**File:** `src/components/import/DataCoverageBar.tsx`

Remove the `* 100` from lines 68, 69, 70, and 73 — pass the raw ratio (0–1) directly:

```tsx
// Lines 68-70: change from coverage.X * 100 to coverage.X
<CoverageChip label="DOB" percent={coverage.dob} />
<CoverageChip label="Gender" percent={coverage.gender} />
<CoverageChip label="Rated" percent={coverage.rating} />

// Line 73: change from coverage[c.field] * 100 to coverage[c.field]
<CoverageChip key={c.field} label={c.label} percent={coverage[c.field]} starred />
```

This means `CoverageChip` receives the raw 0–1 ratio, its color thresholds (0.8, 0.5) work correctly, and `Math.round(percent * 100)` produces the correct display value (e.g., 99%).

## What is NOT changed
- No schema, migration, RPC, or allocation logic changes
- The `CoverageChip` component internals stay the same
- The coverage computation in `PlayerImport.tsx` is correct (already produces 0–1 ratios)

## Expected result after fix

| Field | Before | After |
|-------|--------|-------|
| DOB | 9987% (green) | 99% (green) |
| Gender | 1005% (green) | 10% (red) |
| Rated | 6354% (green) | 64% (amber) |
| Club ★ | 9866% (green) | 99% (green) |
| Type ★ | 6716% (green) | 67% (amber) |

