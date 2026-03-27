

# Fix: Prize Save Race Condition + Missing FK CASCADE

## Issues Found

### Issue 1: Promise.all Race Condition (PRIMARY CAUSE of errors)
**RCA:** `src/pages/TournamentSetup.tsx` lines 938-953 — delete and upsert operations fire in parallel via `Promise.all` with `.then(r => r)`. When both target the same `(category_id, place)`, the upsert can hit the unique constraint before the delete completes, causing `23505` (duplicate place) or `23502` (NOT NULL id) errors. This is why categories appear uneditable/unsaveable.

**Fix:** Replace `Promise.all` with sequential `await` — delete first, then upsert.

### Issue 2: Missing FK CASCADE on prizes → categories
**RCA:** The code comment at line 138 says "FK CASCADE deletes prizes automatically" but **no foreign key exists** between `prizes.category_id` and `categories.id`. Currently no orphaned prizes exist, but this is a ticking time bomb — if a category delete ever succeeds while prizes exist, those prizes become orphans that block future operations.

**Fix:** Add a foreign key constraint with ON DELETE CASCADE via migration.

### Issue 3: No regression from Copy from Tournament
The copy dialog uses sequential operations (delete then insert) correctly. No regression found.

---

## Implementation Plan

### Phase 1: Fix Promise.all → Sequential Await (1 file)

**File:** `src/pages/TournamentSetup.tsx`, lines 937-953

Replace:
```typescript
const ops = [];
if (delta.deletes.length) {
  ops.push(supabase.from('prizes').delete().in('id', delta.deletes).then(r => r));
}
if (upsertRows.length > 0) {
  ops.push(
    supabase.from('prizes').upsert(upsertRows, { onConflict: 'category_id,place' })
      .select('id').then(r => r)
  );
}
const results = await Promise.all(ops);
for (const r of results) { ... }
```

With sequential logic:
```typescript
// Step 1: Delete first to free unique constraints
if (delta.deletes.length) {
  const delResult = await supabase.from('prizes').delete().in('id', delta.deletes);
  if (delResult.error) throw new Error(delResult.error.message);
}

// Step 2: Upsert after deletes complete
if (upsertRows.length > 0) {
  const upsertResult = await supabase
    .from('prizes')
    .upsert(upsertRows, { onConflict: 'category_id,place' })
    .select('id');
  if (upsertResult.error) {
    const msg = upsertResult.error.message || 'Unknown error';
    if (msg.includes('prizes_category_id_place_key') || upsertResult.error.code === '23505') {
      throw new Error('Each place must be unique within the category.');
    }
    if (upsertResult.error.code === '23502' && msg.toLowerCase().includes('column "id"')) {
      throw new Error('Internal error: prize row saved without an ID. Please contact support.');
    }
    throw new Error(msg);
  }
}
```

### Phase 2: Add FK CASCADE migration (1 migration)

SQL migration to add the missing foreign key:
```sql
ALTER TABLE public.prizes
  ADD CONSTRAINT prizes_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.categories(id)
  ON DELETE CASCADE;
```

This ensures deleting a category automatically removes its prizes, matching the code's existing assumption.

### Phase 3: Fix delete comment accuracy (cosmetic, same file)

Update the comment at line 138 from "FK CASCADE deletes prizes automatically" to reflect the now-accurate state after migration.

---

## Files Changed
1. `src/pages/TournamentSetup.tsx` — sequential await replacing Promise.all
2. New Supabase migration — FK CASCADE on prizes.category_id

## What is NOT changed
- No allocation/finalize/publish logic
- No RLS changes
- No CopyFromTournamentDialog changes (no regression found)
- No schema changes beyond the FK addition

