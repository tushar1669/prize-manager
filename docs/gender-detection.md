# Gender Detection in Swiss-Manager Files

This document describes how Prize-Manager detects player gender from Swiss-Manager Excel exports.

## Overview

Swiss-Manager exports player data in XLS/XLSX format with a specific column structure. Gender information can be found in several places:

1. **Explicit gender column** (e.g., `Gender`, `Sex`)
2. **FS column** (Swiss-Manager specific: `F` = female, blank = unknown)
3. **Headerless gender column** (between Name and Rating columns)
4. **Type/Group labels** (e.g., `FMG`, `F13`, `GIRL`)

## One-Sentence Summary

> Prize-Manager reads gender from explicit gender columns, the FS column, headerless F markers between Name and Rating, and girl-specific groups like FMG/F13.

## The Name-Rtg Gap Rule (Swiss-Manager Headerless Column)

### Problem

Swiss-Manager ranking lists often have a **headerless column** containing gender markers (`F` for female, blank for others). This column is located between the Name column(s) and the Rating column(s).

**Example header structure:**
```
Rank | SNo. | Title | Name | Name | [EMPTY] | Rtg | NRtg | IRtg | Fed | fs
```

The `[EMPTY]` column (no header text) contains:
- `F` for female players
- Blank for male/unknown players

### Detection Algorithm

1. **Find the LAST Name column index** - Swiss-Manager often has two "Name" columns (full name and abbreviated name)
2. **Find the FIRST Rating column index** - Look for `Rtg`, `IRtg`, `NRtg`, `Rating`, `Elo`, etc.
3. **Scan columns between lastNameIndex and firstRatingIndex** - Only consider columns with empty headers (or `__EMPTY_COL_*` placeholders)
4. **Score each candidate** - Count single-letter gender values (`F`, `M`, `B`, `G`)
5. **Select the best candidate** - Pick the column with the most gender-looking values

### One-Sentence Rule

> If a headerless column between the last Name and first Rtg column contains single-letter values like `F`, we treat it as a gender column (F = female).

### Why This Works

- Swiss-Manager exports have consistent column ordering
- The gender column is always in the "gap" between Name and Rating
- Even a single `F` marker is sufficient to identify the column
- Strict single-letter validation prevents false positives from short names (e.g., "K. Arun")

## Priority Order

When multiple gender sources are available, this priority order applies:

1. **Explicit gender column** (`Gender`, `Sex`, etc.) - highest priority
2. **FS column** with `F`, `G`, `W`, or title prefixes (`WFM`, `WIM`, `WGM`, `WCM`)
3. **Headerless gender column** (Name-Rtg gap)
4. **Type/Group labels** (`FMG`, `F9`, `F13`, `GIRL`, `GIRLS`) - lowest priority

Female signals from any source override explicit male gender (with a warning).

## Validation Rules

### Valid Gender Values

- **Single letters**: `F`, `M`, `B`, `G` (case-insensitive)
- **Explicit values**: `Female`, `Male`, `Girl`, `Girls`, `Boy`, `Boys`
- **Title prefixes**: `WFM`, `WIM`, `WGM`, `WCM` (indicate female)
- **Type/Group markers**: `FMG`, `F9`, `F13`, `F15`, etc.

### Invalid/Rejected Values

- Chess titles: `FM`, `IM`, `GM`, `CM`, `AGM`, `AFM` (NOT gender markers)
- Multi-character abbreviations: `K. Arun`, `P. Singh` (short names, NOT gender)
- Numbers: `1`, `2`, `1500` (ratings, ranks)

## In-App Warnings

Prize-Manager displays warnings to help arbiters catch potential gender data issues before allocation.

### "No female players detected" Warning

This warning appears on the Import Players screen when **0 players** are marked as female after parsing the ranking file.

#### High-Severity Warning (Error Style)
Shown when `femaleCount === 0` AND the tournament has at least one female/girl category configured.

**Example message:**
> **No female players detected**
> This ranking list has 0 players marked as female, but your prize structure includes girl/women categories.
> Double-check the Swiss-Manager export: make sure the gender column (F), FS column, or girl groups (FMG, F9, F13…) are filled.

#### Low-Severity Warning (Info Style)
Shown when `femaleCount === 0` but there are no female categories configured.

**Example message:**
> **No female players detected**
> This ranking list has 0 players marked as female.
> If this looks wrong, check that your Swiss-Manager file includes an F in the gender/FS column or a girl/women group (FMG, F9, F13, etc.), then re-upload.

### What Arbiters Should Check

If the warning appears unexpectedly:

1. **Gender column**: Ensure the export includes a gender column with `F` for females
2. **FS column**: Check if the FS column has `F` values (not just blank)
3. **Headerless column**: Look for a column between Name and Rating with `F` markers
4. **Type/Group**: Check if FMG, F9, F13, GIRL, etc. appear in Type or Gr columns
5. **Re-export**: If data is truly missing, update Swiss-Manager and re-export

### Important Notes

- The warning **does not block** the import or prize allocation workflow
- It only flags potential issues for manual review
- If the tournament genuinely has no female participants, the info-level warning can be safely ignored

## Troubleshooting

### No females detected but prizes exist

1. Check if the XLS has an FS column with actual `F` values
2. Check for a headerless column between Name and Rtg
3. Check if Type/Group labels contain `FMG`, `F13`, etc.
4. If none of the above, gender data is truly missing - manual entry required

### False positives (wrong column detected as gender)

1. Verify the column only contains single letters (`F`, `M`, `B`, `G`)
2. Check for short name columns that might be misidentified
3. Ensure the detection is looking AFTER the LAST Name column

## Related Files

- `src/utils/importSchema.ts` - `findHeaderlessGenderColumn()` function
- `src/utils/genderInference.ts` - `inferGenderForRow()`, `analyzeGenderColumns()`
- `src/components/import/MissingGenderWarning.tsx` - Warning component
- `src/components/import/GenderSummaryChip.tsx` - Gender summary badge
- `supabase/functions/parseWorkbook/index.ts` - Server-side parsing with same logic
- `tests/gender-logic.spec.ts` - Unit tests for gender detection
