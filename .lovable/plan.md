# Fix plan: girl markers (FMG) and the "PC" marker

## Short answer to "will it change the allocation engine?"

**No.** These fixes change only how the Excel file is read during **Player Import**. The prize allocation engine (`allocatePrizes`, rule settings, conflicts) is not opened or edited. The engine keeps reading the same stored fields (gender, disability, type, group) in exactly the same way.

Existing player records are **not** rewritten. A new rule takes effect only when an organizer imports or re-imports a file.

## What the database shows (from the live check)

| Item | Live count | Changes after the fix? |
|---|---|---|
| Players with F-number Type (F07–F20, F8, F9), stored F | 702 | No (same rule) |
| Players with Gr exactly "FMG", stored F | 37 | No (exact "FMG" still counts) |
| "Female overrides M" warnings ever recorded | 0 | No |
| Players with Gr exactly "PC", marked PC | 74 | No (same result) |
| Players with Type "PC", not marked PC | 28 (+1 "U12 PC") | Only if re-imported (see step 1) |
| Categories using the Disability rule | 0 | No prize can move today |
| PC categories set up by Type (6) or Gr (8) | 14 | No (they read the label, not the disability field) |

So no current tournament, published page or prize result changes.

## Steps (one at a time: build, test, check, then wait for your OK)

### Step 0: Safety baseline (no changes)
- Run the full unit test set and save the result (currently 542 passing).
- Save a snapshot of the counts in the table above, so they can be compared after each step.

### Step 1: One PC rule, by whole word
- Gr **or** Type counts as PC when one of its words is exactly `PC` (any letter case). Words are split at spaces, commas, `;`, `|`, `/`, `-`.
- Counts: "PC", "pc", "U12 PC", "PC/U15". Does not count: "NPC", "PCMC", "UPCOMING".
- If the file already has a Disability column value, that value is kept and not overwritten.
- The same rule is used in the browser importer and the server importer, so both agree.
- Tests: every example above, plus "Disability column wins".

### Step 2: FMG as a whole word
- `FMG` counts only as its own word, like `F13` and `GIRL` already do. "XFMGY" stops counting.
- Same change in browser and server importers. Tests added.

### Step 3: Show the override at import (display only)
- On the Import screen summary: "N players were marked as girls from their Type/Group even though Gender said M", with a small expandable list (rank, name, label) to check before saving.
- Nothing is blocked; it is a notice. Not shown on public pages or in the PDF.

### Step 4: Update the guides
- `docs/gender-detection.md`, `docs/group-label-feature.md`, `docs/type-label-feature.md`, and the ReadMe sheet in the downloadable Excel template, so they state the exact rules.

### Step 5: Final re-check
- Full unit test set, preview build check.
- Re-run the database counts from Step 0 and confirm they are identical (no stored data changed).
- Run the Eklavya and tournament b8920c10 Excel files through the importer: same girls found (13) as before.

## Not touched
Allocation engine, database structure, permissions, storage, payments, publishing, existing player records, public pages.

## Technical details
- Files: `src/utils/valueNormalizers.ts` (`normalizeGrColumn`), `src/utils/playerImportPayload.ts` (PC check ~106-108), `src/utils/genderInference.ts` (`FEMALE_MARKER_FMG` → whole-token match), `supabase/functions/parseWorkbook/index.ts` (mirror both rules ~230-324), `src/pages/PlayerImport.tsx` + `src/components/import/ImportSummaryBar.tsx` (override notice, reads existing `warnings` from inference).
- Shared token rule: `/^PC$/i` per token; FMG `/^FMG$/i` per token.
- Tests: `tests/gender-logic.spec.ts`, `tests/utils/valueNormalizers.spec.ts`, new `tests/utils/player-import-pc.spec.ts`.
- Edge function `parseWorkbook` redeploys automatically; only used as server fallback for large files.
