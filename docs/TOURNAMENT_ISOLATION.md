# Tournament Isolation

## Purpose

Documents how tournaments are scoped per-owner and the historical security leak that was fixed.

## What It Protects

- Organizers can only see/edit their own tournaments
- Master can optionally view all tournaments
- No cross-user data leakage

---

## Core RLS Rule

```sql
-- Organizers see only their tournaments
owner_id = auth.uid()

-- Masters can see all
public.is_master()
```

**Where enforced:** RLS policies on `public.tournaments` table

---

## The Historical Leak (FIXED)

### What Happened

The `list_my_tournaments` RPC function was created as `SECURITY DEFINER`:

```sql
-- VULNERABLE (old behavior)
CREATE FUNCTION list_my_tournaments(include_all boolean DEFAULT false)
RETURNS SETOF tournaments
LANGUAGE sql
SECURITY DEFINER  -- Bypasses RLS!
AS $$
  SELECT * FROM tournaments WHERE deleted_at IS NULL;
$$;
```

**Problem:** `SECURITY DEFINER` runs with the function owner's privileges, bypassing RLS. This returned ALL tournaments to ANY authenticated user.

### The Fix

Updated to properly gate on `include_all` AND `is_master()`:

```sql
-- FIXED behavior
CREATE FUNCTION list_my_tournaments(include_all boolean DEFAULT false)
RETURNS SETOF tournaments
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM tournaments
  WHERE deleted_at IS NULL
    AND (
      (include_all = true AND public.is_master())
      OR owner_id = auth.uid()
    );
$$;
```

**Now:**
- `include_all=false` (default) → returns only `owner_id = auth.uid()`
- `include_all=true` → only returns all if caller `is_master()`

---

## Usage in Code

```typescript
// Dashboard.tsx - organizers see own tournaments
const { data } = await supabase.rpc('list_my_tournaments');

// AdminTournaments.tsx - master sees all
const { data } = await supabase.rpc('list_my_tournaments', { include_all: true });
```

**Where enforced:**
- `src/pages/Dashboard.tsx` – uses default (own tournaments)
- `src/pages/AdminTournaments.tsx` – uses `include_all: true` (master-only page)

---

## Invariant

> Any `SECURITY DEFINER` function must be treated as a security boundary and reviewed like production auth code.

Before creating/modifying a `SECURITY DEFINER` function, verify:
1. Does it properly filter by `auth.uid()` or `is_master()`?
2. Can a non-master ever access data they shouldn't?
3. Is the function exposed via RPC (callable from client)?

---

## Related Tables

These tables follow the same `owner_id` isolation pattern:

| Table                    | Isolation Rule                     |
|--------------------------|------------------------------------|
| `tournaments`            | `owner_id = auth.uid()`            |
| `players`                | Via `tournament_id` FK             |
| `categories`             | Via `tournament_id` FK             |
| `prizes`                 | Via `category_id` → `tournament_id`|
| `allocations`            | Via `tournament_id` FK             |
| `institution_prize_groups` | Via `tournament_id` FK           |

---

## Gotchas

1. **RPC vs direct table access:** Direct table queries use RLS automatically. RPC functions may bypass RLS if `SECURITY DEFINER`.
2. **Master can view, not necessarily edit:** The `include_all` flag is for viewing. Edit operations still check ownership.
3. **Deleted tournaments:** Soft-delete via `deleted_at` column. Queries filter `deleted_at IS NULL`.

---

## How to Test Manually

1. **Organizer isolation:**
   - Create tournament as Organizer A
   - Log in as Organizer B
   - Verify B cannot see A's tournament in dashboard

2. **Master access:**
   - Log in as master
   - Go to `/admin/tournaments`
   - Should see all tournaments with owner email column

3. **RPC isolation:**
   - As organizer, call `list_my_tournaments()` in browser console
   - Should only return own tournaments
   - Call `list_my_tournaments({ include_all: true })` 
   - Should still only return own tournaments (not master)
