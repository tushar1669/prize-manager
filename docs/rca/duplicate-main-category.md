> **Archive RCA:** Historical incident analysis snapshot. Use current runbooks for active operations.

# RCA: Duplicate Main Categories

## Symptom
- Main Prize looks unsaved/deleted after navigating back from Import Players.
- Review Category Order shows 2× "Main Prize" entries.

## Root Cause
Race condition in `ensureMainCategoryExists`:
1. User opens Setup page → categories query starts loading
2. Effect fires before query completes → `categoriesLoading` is true but code path wasn't properly guarded
3. Multiple inserts could happen if navigation was fast or React re-renders occurred
4. Different pages picked different "main" row (non-deterministic `.find()` behavior when duplicates exist)

## Fix Implemented

### A) Database Migration
1. **Cleanup**: One-time migration that finds tournaments with >1 main category:
   - Keeps the OLDEST main category (by `created_at`)
   - Moves prizes from duplicate main categories into the kept one
   - Deletes the extra main categories
   
2. **Prevention**: Added partial unique index:
   ```sql
   CREATE UNIQUE INDEX categories_unique_main_per_tournament 
     ON categories (tournament_id) 
     WHERE is_main = true;
   ```

### B) App Code
1. **`ensureMainCategoryExists`** (TournamentSetup.tsx):
   - Now explicitly waits for `categoriesLoading === false` AND `categories` to be an array
   - Handles unique constraint violation (error code `23505`) by refetching instead of throwing
   
2. **Deterministic main category selection**:
   - `sortedCategories` useMemo: If multiple mains exist (legacy), pick oldest by `created_at`
   - Hydration logic: Same deterministic selection
   - Prize save mutation: Same deterministic selection
   - Logs a warning when duplicates are encountered

### C) Tests Added
- `does not insert while categories are still loading` - Guards the race condition
- `handles unique constraint violation by refetching instead of erroring` - Graceful recovery

## Preventing Recurrence
- Keep the partial unique index in place (DB enforces one main per tournament)
- Keep the deterministic selection logic as defense-in-depth (handles any edge cases)
- Never remove the `categoriesLoading` guard in `ensureMainCategoryExists`

## Verification
```sql
-- Should return empty after migration
SELECT tournament_id, COUNT(*) 
FROM categories 
WHERE is_main = true 
GROUP BY tournament_id 
HAVING COUNT(*) > 1;
```
