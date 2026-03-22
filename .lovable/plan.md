

# Fix: Import Fails — "points: Expected number, received string" (all 746 rows rejected)

## Root Cause Analysis

**Bug location:** `src/pages/PlayerImport.tsx`, lines 2047-2091 (the mapping loop in `handleMappingConfirm`)

**What happens:**
1. Swiss-Manager file has a `Pts` column (mapped to `points` via `ALIASES.points = ['pts', 'points', 'score', 'total_points']`)
2. The mapping loop iterates each field. For `rank`, `sno`, `rating`, `dob`, `fide_id` — there are explicit conversion branches that coerce to the correct type
3. For `points` — **there is no conversion branch**. It falls through to line 2086: `else if (typeof value === 'string') { value = value.trim() || null; }` — leaving it as a trimmed string (e.g. `"5"`, `"4.5"`, or `"5½"`)
4. Zod schema (`playerImportSchema`) defines `points: z.number().nullable().optional()` — rejects strings
5. **All 746 rows fail validation** with `points: Expected number, received string`

**Why it wasn't caught before:** Previous test files either lacked a `Pts` column or had numeric-typed cells (XLSX stores numbers natively). This file's `Pts` column contains text-formatted values.

## Fix (2 changes, 2 files)

### Change 1: Add `normalizePoints` to `src/utils/valueNormalizers.ts`

Add a new function after `normalizeRating`:

```typescript
export function normalizePoints(raw: unknown): number | null {
  if (raw == null) return null;
  let str = String(raw).trim();
  if (str === '') return null;
  // Handle Swiss-Manager ½ fractions: "5½" → "5.5", "½" → "0.5"
  str = str.replace('½', '.5');
  // Strip commas/spaces
  str = str.replace(/[,\s]/g, '');
  const num = parseFloat(str);
  if (isNaN(num)) return null;
  return num;
}
```

Handles: plain numbers (`"5"`), decimals (`"4.5"`), fraction notation (`"5½"`), commas (`"1,000"`), and nulls.

### Change 2: Add `points` branch in `src/pages/PlayerImport.tsx` mapping loop

In the mapping loop (~line 2080, after the `fide_id` branch), add:

```typescript
} else if (fieldKey === 'points') {
  value = normalizePoints(value);
```

This matches the exact pattern used for `rating` → `normalizeRating`, `rank` → `normalizeRankValue`, etc.

### Files touched
1. `src/utils/valueNormalizers.ts` — add `normalizePoints` function (~8 lines)
2. `src/pages/PlayerImport.tsx` — add 2-line branch in mapping loop + import

### What is NOT changed
- No schema changes (Zod schema already accepts `number | null`)
- No migration, no RLS, no edge functions
- No allocation/finalize/publish logic

## QA Checklist

1. Re-upload the same Maharathi XLS file — expect 746 valid rows (was 0)
2. Verify `points` column shows correct numeric values in preview table
3. Verify fractional points (`5½`) parse to `5.5`
4. Verify files without a `Pts` column still import correctly (points = null)
5. Run existing tests: `vitest run tests/utils/valueNormalizers.spec.ts`

