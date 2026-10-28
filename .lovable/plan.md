# RCA: "Upgrade to Pro" shown for a 134-player tournament (5b3ecb32…)

## What I checked (read-only)
- Players in the tournament right now: **134**.
- Import history: 3 imports today (16:06, 16:28, 17:16 UTC), all "replace" mode, 134 players each, file `2nd H_Interim_Ranking_List.xls`.
- No paid/coupon access row exists for this tournament.
- Tournament created 1 Oct 2026, status finalized.
- Hidden "highest player count ever" record for this tournament: **401**.

## Root cause
The free/paid decision does not use today's player count. It uses the **highest player count the tournament has ever had** (a safeguard added in August so nobody can import 400 players, pay nothing, then trim the list). The server works it out as:

```text
billing count = max(current players 134, highest-ever 401) = 401  ->  401 > 150  ->  Pro required
```

At some point this tournament held 401 players, most likely a full combined list imported before import history was switched on (so that earlier import can't be traced). The safeguard never goes down, so the tournament stays locked even though only 134 remain.

Contributing UI bug: the Review page banner says "This tournament has **134** players, which is above the free limit of 150". It shows the live count instead of the count actually used for billing, so the message contradicts itself and the organizer can't tell why. Same mismatch may exist on the Upgrade page.

Not a bug in: the 150 threshold (correct), the import (correct), the access check itself (behaves as designed).

## Proposed fix (one step at a time, stop after each)

**Step 0 — unblock this organizer now (needs your OK, data change, no code)**
Pick one:
- A. You (master) grant Pro for this tournament through the existing Pending Payments / coupon path, or
- B. Lower this one tournament's highest-ever count to 134, with a note in the audit log.
Nothing else is touched.

**Step 1 — honest message (display only)**
On Review and Upgrade, use the server's billing count. When it differs from the live count, show: "This tournament once had 401 players. Pricing uses the highest number ever imported (free up to 150). Contact support if that earlier list was a mistake." Files: `src/pages/ConflictReview.tsx` (~line 755), `src/hooks/useTournamentAccess.ts` (expose `players_count` already returned by the server), `src/pages/TournamentUpgrade.tsx`.

**Step 2 — master "Reset billing count" action (server-gated)**
Small master-only button in Admin → Tournaments: resets the highest-ever count to the current count, master check done in the database function, writes an audit log entry. Lets you fix future mistaken imports without database work.

**Step 3 (optional, policy decision) — warn before it sticks**
On import, if the file would push the tournament above 150 for the first time, warn: "Importing 401 players makes this a Pro tournament permanently, even if you remove players later."

## Out of scope / not touched
Allocation engine, 150 threshold, safeguard logic for other tournaments, RLS, payments flow, publishing.

## Technical details
- `get_tournament_access_state` → `tournament_billing_basis` = `GREATEST(count(players), tournament_player_watermark.players_count_max)`; `tournament_pro_tier(<=150)` free.
- Watermark row: `players_count_max=401`, bumped by statement triggers `trg_players_bump_watermark_ins/upd` (never decreases, migration `20260814160000_player_count_watermark.sql`).
- `import_replace_players` deletes then inserts in one transaction, so today's replace imports did not inflate the value.
