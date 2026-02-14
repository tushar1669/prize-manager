

# Martech v0 Dashboard -- Spec and Implementation Plan

## 1. Metrics We Can Compute Today (from existing tables only)

### A. Platform Health (top-line KPIs)

| Metric | Source | Query | Caveats |
|---|---|---|---|
| **Total Organizers** (all-time) | `user_roles` WHERE role='organizer' | `count(*)` | Includes unverified |
| **Verified Organizers** | `user_roles` WHERE role='organizer' AND is_verified | `count(*)` | -- |
| **Pending Approvals** | `user_roles` WHERE role='organizer' AND NOT is_verified | `count(*)` | May include abandoned signups |
| **Total Tournaments** | `tournaments` WHERE deleted_at IS NULL | `count(*)` | Excludes soft-deleted |
| **Published Tournaments** | `tournaments` WHERE is_published=true AND deleted_at IS NULL | `count(*)` | -- |
| **Publication Rate** | published / total | Derived | -- |

### B. Growth Over Time (time-series)

| Metric | Source | Query | Caveats |
|---|---|---|---|
| **Organizer signups per month** | `user_roles` created_at, role='organizer' | GROUP BY month | No login/session tracking |
| **Tournaments created per month** | `tournaments` created_at | GROUP BY month | Includes drafts |
| **Publications per month** | `publications` published_at | GROUP BY month | Multiple versions per tournament |

### C. Import Quality

| Metric | Source | Query | Caveats |
|---|---|---|---|
| **Total imports** | `import_logs` | `count(*)` | -- |
| **Avg acceptance rate** | `import_logs` accepted_rows / total_rows | AVG | Only for rows where total_rows > 0 |
| **Avg import duration** | `import_logs` duration_ms | AVG | NULL for older imports |
| **Top skip reasons** | `import_logs` top_reasons (jsonb) | Aggregate across all logs | JSONB aggregation is approximate |

### D. Revenue / Monetization

| Metric | Source | Query | Caveats |
|---|---|---|---|
| **Active Pro tournaments** | `tournament_entitlements` WHERE now() BETWEEN starts_at AND ends_at | `count(DISTINCT tournament_id)` | -- |
| **Total entitlements issued** | `tournament_entitlements` | `count(*)` | Includes expired |
| **Entitlements by source** | `tournament_entitlements` source column | GROUP BY source | Sources: 'coupon', 'manual', etc. |
| **Coupon redemptions (count)** | `coupon_redemptions` | `count(*)` | Already in /admin/coupons analytics |
| **Total discount given** | `coupon_redemptions` discount_amount | `SUM` | Already in /admin/coupons analytics |

### E. Player Volume

| Metric | Source | Query | Caveats |
|---|---|---|---|
| **Total players imported** | `players` | `count(*)` | Re-imports replace players, so this is current state not cumulative |
| **Avg players per tournament** | `players` grouped by tournament_id | AVG of counts | -- |
| **Tournaments by size bucket** | `players` grouped by tournament_id, bucketed | 0-50, 51-100, 101-200, 200+ | Useful for paywall analysis |

---

## 2. Proposed Page Layout

```text
/admin/martech
+------------------------------------------------------------------+
| Martech Dashboard                                                |
| Platform growth and usage insights from existing data.           |
+------------------------------------------------------------------+

ROW 1: KPI Summary Cards (4 cards, grid)
+----------------+  +----------------+  +----------------+  +----------------+
| Total          |  | Published      |  | Active Pro     |  | Total Players  |
| Organizers     |  | Tournaments    |  | Tournaments    |  | (all tournaments)|
|   8            |  |   13           |  |   2            |  |   1,245        |
+----------------+  +----------------+  +----------------+  +----------------+

ROW 2: Growth Chart (single card, full width)
+------------------------------------------------------------------+
| Monthly Growth                                    [filter: 6m/1y/all] |
| Line chart: organizer signups + tournaments created over time    |
+------------------------------------------------------------------+

ROW 3: Two columns
+-------------------------------+  +-------------------------------+
| Tournament Size Distribution  |  | Entitlements by Source        |
| Bar chart: size buckets       |  | Pie chart: coupon / manual   |
| 0-50 | 51-100 | 101+ counts  |  |                               |
+-------------------------------+  +-------------------------------+

ROW 4: Import Health (single card)
+------------------------------------------------------------------+
| Import Quality Summary                                           |
| Total imports: 42 | Avg accept rate: 94% | Avg duration: 1.2s   |
+------------------------------------------------------------------+
```

All cards use existing `Card`, `CardHeader`, `CardTitle`, `CardContent` components. Charts use `recharts` (already installed). Consistent with the admin theme.

---

## 3. Per-Metric Query Specifications

All queries run client-side via Supabase JS, gated by `enabled: !!user && isMaster`.

**KPI Cards** -- 4 independent queries:

1. Organizers: `supabase.from('user_roles').select('*', { count: 'exact', head: true }).eq('role', 'organizer').eq('is_verified', true)`
2. Published tournaments: `supabase.from('tournaments').select('*', { count: 'exact', head: true }).eq('is_published', true).is('deleted_at', null)`
3. Active Pro: `supabase.from('tournament_entitlements').select('tournament_id').gte('ends_at', new Date().toISOString()).lte('starts_at', new Date().toISOString())` then count distinct
4. Total players: `supabase.from('players').select('*', { count: 'exact', head: true })`

**Monthly Growth** -- two queries with client-side date bucketing:

- `supabase.from('user_roles').select('created_at').eq('role', 'organizer')` -- bucket by month
- `supabase.from('tournaments').select('created_at').is('deleted_at', null)` -- bucket by month

**Tournament Size Buckets** -- single query:

- `supabase.from('players').select('tournament_id')` -- group client-side by tournament_id, bucket counts

**Entitlements by Source**:

- `supabase.from('tournament_entitlements').select('source')` -- group by source

**Import Health**:

- `supabase.from('import_logs').select('total_rows, accepted_rows, duration_ms')` -- compute averages client-side

**Caveats for all**: RLS requires master role (existing policies allow master to read all rows via `has_role` checks or `is_master()` on relevant tables). The `players` table policy allows master full access. The `tournament_entitlements` table allows master SELECT via `tournament_entitlements_select_own_or_master` + `tournament_entitlements_write_master_only` policies.

---

## 4. Martech v1: Event Tracking (optional, future)

Minimal instrumentation proposal -- requires **one new table**:

```sql
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,       -- 'page_view', 'import_started', 'publish_clicked'
  user_id uuid,                   -- nullable for anonymous
  tournament_id uuid,             -- nullable
  properties jsonb DEFAULT '{}',  -- { page: '/t/xxx/finalize', source: 'dashboard' }
  created_at timestamptz DEFAULT now()
);
```

Tracked events (6 total, high-value):
- `page_view` -- route changes (page, referrer)
- `import_completed` -- after successful import (player_count, duration_ms)
- `allocation_run` -- after allocatePrizes completes (player_count, category_count)
- `publish_clicked` -- when organizer publishes
- `upgrade_viewed` -- when organizer visits /t/:id/upgrade
- `coupon_applied` -- when organizer applies coupon (amount_before, amount_after)

Client-side: a thin `trackEvent(name, props)` helper that inserts via Supabase. RLS: insert-only for authenticated users, select for master only. This is **not part of v0** -- just a documented proposal.

---

## 5. Implementation Steps

### Step 1: Fix the build error (prerequisite)

Update `src/hooks/useCouponsAdmin.ts` line 71 -- the `coupon_redemptions` DB table has `user_id` + `metadata` columns but the `CouponRedemption` type expects `redeemed_by_user_id` + `meta`. Add a mapping layer:

```typescript
return (data ?? []).map(row => ({
  ...row,
  redeemed_by_user_id: row.redeemed_by_user_id ?? row.user_id,
  amount_before: row.amount_before ?? 0,
  amount_after: row.amount_after ?? 0,
  meta: row.meta ?? row.metadata ?? {},
})) as CouponRedemption[];
```

### Step 2: Create the Martech dashboard hook

New file: `src/hooks/useMartechMetrics.ts`
- 5 parallel useQuery calls (KPIs, growth, size buckets, entitlements, import health)
- All gated by `enabled: !!user && isMaster`
- Returns structured data for each card/chart section

### Step 3: Rewrite AdminMartech.tsx

Replace the placeholder "coming soon" card with the real dashboard layout:
- 4 KPI summary cards (top row)
- Monthly growth line chart (recharts `LineChart`)
- Tournament size distribution bar chart + entitlements pie chart (two-column)
- Import health summary card (bottom)
- Keep the "Manage Coupons" link as a small button in the header

### Step 4: Update AdminHome description

Change the Martech quick-link description from "Upcoming marketing and analytics tools" to "Platform growth and usage insights."

### Files Changed

| File | Action |
|---|---|
| `src/hooks/useCouponsAdmin.ts` | Fix build error -- map DB columns to CouponRedemption type |
| `src/hooks/useMartechMetrics.ts` | **New** -- queries for all v0 metrics |
| `src/pages/AdminMartech.tsx` | Rewrite -- real dashboard with cards + charts |
| `src/pages/admin/AdminHome.tsx` | Update description text for Martech link |

