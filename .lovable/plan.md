

# Fix: Copy from Tournament — Main Prize Handling + Details Tab Copy

## Problem 1: Main Prize becomes empty "Main Prize (imported)"

When copying prize structure, if the target tournament already has a Main category (auto-created with 0 prizes), the source's Main category is renamed to "Main Prize (imported)" with `is_main: false`. The target's original Main remains empty. The user ends up with an empty Main + a non-main duplicate.

**Root cause:** Lines 156-162 of `CopyFromTournamentDialog.tsx` — when `targetHasMain` is true, the code creates a new side category instead of merging prizes into the existing empty Main.

**Fix:** When the source has a Main category AND the target already has a Main category, instead of creating a new "(imported)" category:
1. Find the target's existing Main category ID
2. Delete any existing prizes on it (it's typically empty)
3. Insert the source Main's prizes directly into the target Main's category ID
4. Skip creating a new category row entirely

## Problem 2: "Copy from Tournament" button missing from Details tab

The button only exists on the Prizes tab. The user wants it on the Details tab too, with the ability to copy tournament details (venue, city, time control, chief arbiter, etc.) and/or prize structure.

**Approach:** Create a new `CopyFromTournamentFullDialog` component that:
- Shows the same tournament selector
- Offers two checkboxes: "Details" and "Prize Structure"
- "Details" copies: venue, city, event_code, notes, time_control_base_minutes, time_control_increment_seconds, chief_arbiter, tournament_director, entry_fee_amount, cash_prize_total, chessresults_url, public_results_url (NOT title, dates, slug, owner)
- "Prize Structure" uses the same category+prize copy logic (with the fixed Main merge)
- Place button on the Details tab card header

**Simpler alternative (recommended):** Extend the existing `CopyFromTournamentDialog` with a `mode` prop:
- `mode="prizes"` — current behavior (Prizes tab)
- `mode="full"` — shows Details + Prize Structure checkboxes (Details tab)

This avoids duplicating the tournament selector and category list UI.

## Implementation Plan

### Phase 1: Fix Main Prize merge logic (1 file)

**File:** `src/components/prizes/CopyFromTournamentDialog.tsx`

In `handleConfirm`, replace lines 149-210 (the main category handling block):

```
When source category is_main AND target already has a Main category:
  1. Get targetMainId from targetCategories
  2. Delete existing prizes: DELETE FROM prizes WHERE category_id = targetMainId
  3. Insert source prizes with category_id = targetMainId
  4. Skip category insert, increment categoriesCopied
  
When source category is_main AND target has NO Main:
  Keep existing behavior (insert new category with is_main: true)

Non-main categories:
  Keep existing behavior (insert new category)
```

### Phase 2: Add "Copy from Tournament" to Details tab (2 files)

**File:** `src/components/prizes/CopyFromTournamentDialog.tsx`

- Add optional prop `copyMode?: 'prizes' | 'full'` (default: `'prizes'`)
- When `copyMode='full'`, show two checkboxes before the category list: "Copy Details" and "Copy Prize Structure"
- When "Copy Details" is checked, fetch source tournament's detail fields and apply them to the target tournament via `supabase.from('tournaments').update(...)` on confirm
- When "Copy Prize Structure" is checked, show the existing category picker
- At least one must be checked to enable the Confirm button
- Detail fields to copy: `venue, city, event_code, notes, time_control_base_minutes, time_control_increment_seconds, chief_arbiter, tournament_director, entry_fee_amount, cash_prize_total, chessresults_url, public_results_url`

**File:** `src/pages/TournamentSetup.tsx`

- Add a second `CopyFromTournamentDialog` instance on the Details tab card header with `copyMode="full"`
- Add state: `copyFromTournamentDetailsOpen`
- On complete, invalidate both `['categories', id]` and `['tournament', id]` queries and reset the details form

### Files Changed
1. `src/components/prizes/CopyFromTournamentDialog.tsx` — fix Main merge + add `copyMode` prop
2. `src/pages/TournamentSetup.tsx` — add Copy button to Details tab

### What is NOT changed
- No schema/migration changes
- No RLS changes
- No allocation/finalize logic
- Existing Prizes tab "Copy from Tournament" button behavior preserved (minus the Main Prize bug)

