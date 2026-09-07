# Team Championship — Architecture

**Status:** TC1.1 · documentation only · 6 September 2026
**Scope boundary:** DD1 (PROJECT_STATE §3). This document describes the **team engine only**.

**In the team engine — where all Team Championship work lands:**
`supabase/functions/_shared/teamPrizes.ts` · `allocateInstitutionPrizes` · `backfillTeamAllocations` ·
`publicTeamPrizes` · RPC `resolve_team_tie` · tables `institution_prize_groups`,
`institution_prizes`, `team_allocations`, `team_allocation_notes` · `src/components/team-prizes/*` ·
`src/components/allocation/TeamPrizeResultsPanel.tsx` · the team block of `generatePdf`.

**Never edited for team work:** `supabase/functions/allocatePrizes`, `rule_config`, conflicts,
player-to-prize matching, the `allocations` table, and the allocation engine's own docs.

**`finalize` is the only seam** — it writes both `allocations` and `team_allocations`.
**Owner ruling: leave `finalize` untouched.** Scorer improvements reach it without editing its file.

---

## 1. Current state — verified facts

Every claim below was read out of the working tree at commit `74c3ebc` and carries its citation.

### 1.1 The scorer takes no gender

`supabase/functions/_shared/teamPrizes.ts:32-36`

```ts
export function computeTeamScores(
  players: TeamPrizePlayer[],
  teamSize: number,
  groupBy: TeamGroupByKey
): TeamPrizeInstitutionScore[] {
```

Three parameters. **No gender parameter, and no gender read anywhere in the function body**
(`teamPrizes.ts:32-70`). `gender` appears in the file exactly once, as an unused field on the
`TeamPrizePlayer` type at `teamPrizes.ts:8`. Selection is `ordered.slice(0, teamSize)` after a sort on
rank (`teamPrizes.ts:52-57`).

### 1.2 The comment claims gender support falsely

`supabase/functions/allocateInstitutionPrizes/index.ts:27`

```
 * - Supports gender slot requirements (e.g., team of 4 must include 2 girls + 2 boys)
```

The call site 312 lines later is `computeTeamScores(teamPlayers, group.team_size, columnName)`
(`allocateInstitutionPrizes/index.ts:339`) — the group's `female_slots` and `male_slots` are never
passed. This is **DD5**: a comment claiming a capability the code does not have.

*The same file's header also claims* `Uses "rank points" as score: (max_rank + 1 - player_rank)`
(`allocateInstitutionPrizes/index.ts:30`). It does not. `maxRank` is computed at
`allocateInstitutionPrizes/index.ts:286` and used **only** to populate `max_rank` in the response at
`:405`; the value handed to the scorer is the raw `players.points` column
(`allocateInstitutionPrizes/index.ts:329`), summed as-is at `teamPrizes.ts:62`. Two false claims in
one header block. Both are corrected in TC1.

`docs/team-prizes.md` **repeated both errors** in its "Scoring" and "Gender slots" bullets — the same
false rank-points formula and the same false claim of gender enforcement. **Corrected in TC1.1b:**
`docs/team-prizes.md:24` now states the scorer sums the raw `players.points` column and says "There are
no rank points" explicitly, citing `:286` and `:405` for what `max_rank` is actually for. The historical
error is recorded here; the file itself is no longer wrong, and this paragraph must not be read as
outstanding work.

### 1.3 The silent exclusion

`supabase/functions/_shared/teamPrizes.ts:57-58`

```ts
const topPlayers = ordered.slice(0, teamSize);
if (topPlayers.length < teamSize) continue;
```

An institution with fewer than `team_size` players is dropped from the result array with **no record
that it existed**. No count, no key, no reason. The caller cannot distinguish "no such school entered"
from "that school entered three players and needed four."

### 1.4 Blank group values are dropped before grouping

`supabase/functions/_shared/teamPrizes.ts:40-42`

```ts
const rawKey = (player[groupBy] as string | null | undefined) ?? null;
const key = rawKey?.trim();
if (!key) continue;
```

`null`, `undefined`, `''` and any whitespace-only value are discarded silently at the top of the loop.
A tournament where the club column was typed as `" "` for forty players loses all forty with no signal.

### 1.5 Root-cause analysis is hardcoded empty at four sites

| Site | Code |
|---|---|
| `supabase/functions/allocateInstitutionPrizes/index.ts:319-320` | `ineligible_institutions: 0` / `ineligible_reasons: ['Invalid group_by value: …']` |
| `supabase/functions/allocateInstitutionPrizes/index.ts:340-341` | `const ineligibleCount = 0;` / `const ineligibleReasons: string[] = [];` |
| `supabase/functions/publicTeamPrizes/index.ts:212-213` | `ineligible_institutions: 0` / `ineligible_reasons: []` |
| `src/components/team-prizes/useTeamPrizeResults.ts:165-166` | `ineligible_institutions: 0` / `ineligible_reasons: []` |

The `allocateInstitutionPrizes:340-341` pair are declared as literals and never assigned again; they
flow straight into the response at `:396-397`. The `:319-320` site is the only one that ever emits a
reason, and only for an invalid `group_by`. The two read paths (`publicTeamPrizes`,
`useTeamPrizeResults`) hardcode zero because there is nothing persisted for them to read.

### 1.6 The ineligible UI section is unreachable

`src/components/allocation/TeamPrizeResultsPanel.tsx:248`

```tsx
{group.ineligible_institutions > 0 && group.ineligible_reasons.length > 0 && (
```

Both operands must be non-empty. Per §1.5 the count is a hardcoded `0` on every path that reaches this
component, so **the collapsible has never rendered in production**. The UI for explaining exclusions
was built; the data to fill it was never produced.

### 1.7 Four files construct composition text independently

| File | Lines | Renders |
|---|---|---|
| `src/components/team-prizes/TeamPrizeRulesSheet.tsx` | `162`, `174`, `193-195` | labels `Female Slots` / `Male Slots`, plus three worked examples |
| `src/components/team-prizes/TeamPrizesEditor.tsx` | `243-247` | badge `F2/M2` |
| `src/components/allocation/TeamPrizeResultsPanel.tsx` | `86-92` | badge `2F + 2M required`; also `180-181` in the empty-state hints |
| `supabase/functions/generatePdf/index.ts` | `408-413` | printed `(2F + 2M required)` |

Four independent string builders, no shared formatter. All four violate **RULING 2**, and
`TeamPrizeRulesSheet.tsx:174` violates **RULING 1**'s labelling consequence. TC1.5 replaces all four
with one formatter that emits rule sentences.

### 1.8 `tests/institution/` encodes a different algorithm from production

`tests/institution/institution-allocation.spec.ts` — 18 `it()` blocks, a header advertising
*"Team building with gender slot requirements"* (lines 1-9), and an import list containing exactly one
entry: `vitest` (`:11`). **It imports no source module.** `buildTeam` is defined locally at `:71`
and exists nowhere in `supabase/functions` or `src`. `tests/institution/institution-schema.spec.ts`
(7 `it()` blocks) likewise imports only `vitest` (`:1`) and a `vi.mock` of `supabase-js`.

The local reproduction is not merely unimported — **it is a different algorithm**:

| | Production | Spec |
|---|---|---|
| Player sort | `rank` ascending, tie-broken by `id` — `teamPrizes.ts:52-55` | `points` descending, tie-broken by `rank` — `comparePlayersByScore`, spec `:55-61` |
| Score per player | raw `players.points`, summed — `teamPrizes.ts:62`, fed from `allocateInstitutionPrizes:329` | `maxRank + 1 - rank` — `getRankPoints`, spec `:51-53` |
| Gender | absent | `isFemale` / `isNotF` slot filling — spec `:41-47`, `:71-125` |

The suite reproduces the *comment* at `allocateInstitutionPrizes:27-30`, not the code beneath it. It is
green, it will stay green while shipped code diverges arbitrarily, and it reads as coverage. **DD3.**

## 2. Data model (current)

`institution_prize_groups` — `id`, `tournament_id`, `name`, `group_by`, `team_size`, `female_slots`,
`male_slots`, `scoring_mode`, `is_active`, timestamps
(`src/integrations/supabase/types.ts:716-740`).

`institution_prizes` · `team_allocations` · `team_allocation_notes` — as mapped in PROJECT_STATE §2.
All four tables grant full DML to `anon` and `authenticated`; RLS scopes owner-or-master; public SELECT
policies key off `tournaments.is_published`.

**Decided by RULING 3 (7 September 2026):** `institution_prize_groups.minimum_roster_size int
not null default team_size`, **per group**. The tournament-level allow-incomplete-teams flag is
**withdrawn** — the per-group minimum subsumes it. One setting, not two. The migration is written
in TC1.6, not before.

## 3. Version pinning — inherited from TC0, unchanged by TC1

`publicTeamPrizes` reads `publications.allocation_version` and **has no compute path at all**; its
live-compute fallback was deleted in TC0-d. `backfillTeamAllocations` resolves from
`allocation_version`. A NULL pin means published before results existed: the team check is skipped and
publishing is allowed (B18 Option C).

**TC1 must not reintroduce a compute path into `publicTeamPrizes`.** Reason codes reaching the public
page must arrive from the persisted snapshot, not from recomputation at request time — otherwise
correcting a player's club spelling changes an announced explanation, which is the exact defect TC0
removed.

**Deploy obligation, from PROJECT_STATE §12.16:** the SQL harness cannot call an Edge Function.
**Re-run the `glanz-open-haryana-cup` curl after any `publicTeamPrizes` deploy** — it has
`publications.version = 2` and `allocation_version = 13`, so it discriminates.

### 3.1 `generatePdf` still has the live-compute fallback — FILED, NOT FIXED

`loadTeamPrizes` (`supabase/functions/generatePdf/index.ts:155-169`) prefers the persisted snapshot
via `publicTeamPrizes`, but when that returns nothing it falls back to invoking
`allocateInstitutionPrizes` and **computing the team standings live at PDF-generation time**.

This is the same defect TC0-d removed from `publicTeamPrizes`: a recompute at request time can change
an announced result. Correct a player's club spelling, or edit any player row, after the prizes were
announced and a PDF generated afterwards can name a different winning institution than the one read
out at the ceremony — with nothing in the document indicating that it was recomputed rather than read.
`generatePdf` is a second document-producing surface with the property §3 forbids for the public page.

**Status: FILED, not fixed. Out of scope for TC1.** It is recorded here so it is not rediscovered as
new, and so no one reads §3's "no compute path" as covering every published surface — it covers
`publicTeamPrizes` only. Removing the fallback is not a TC1 step and must not be attempted as one.

**Consequence to record (TC1.5).** `players_without_points`, and therefore the "—" Points cell and the
"Points were not imported for this tournament" footnote, ships only in the `allocateInstitutionPrizes`
response. The persisted snapshot does not carry it. So on the PDF the footnote fires **only on this
live-compute path** — precisely the path that should not be running — and a PDF built from the
persisted snapshot prints the bare `0` totals until persistence lands in TC1.6. The two are fixed by
the same work, in that order: persist the field, then the fallback has nothing left to justify it.

## 4. Team reason-code vocabulary

Mirrors the individual engine's structure at `supabase/functions/allocatePrizes/index.ts:1519-1521`
(`failCodes` / `passCodes` / `warnCodes`, each a `Set<string>`, with the result shape declared at
`:1386-1391`). **Mirrors — does not import.** DD1 forbids reaching into `allocatePrizes`; the team
engine declares its own sets in `_shared/teamPrizes.ts`.

### fail

| Code | Fires when |
|---|---|
| `team_short_roster` | the institution has fewer players than `team_size` — today's silent `continue` at `teamPrizes.ts:58` |
| `below_minimum_roster` | the institution has at least `team_size` players but fewer than `minimum_roster_size` — **RULING 3, signed off 7 September 2026**; lands in TC1.6 as the per-group `minimum_roster_size` |
| `female_slots_unfilled` | fewer than `female_slots` players carry an explicit `'F'` |
| `male_slots_unfilled` | fewer than `male_slots` players are not `'F'`. Under RULING 1 a null or blank gender counts as not-F, so this fires far more rarely than `female_slots_unfilled` — only when the institution genuinely has too few non-`'F'` entrants |
| `missing_group_field` | the player's `group_by` column is null, empty, or whitespace. **Player-level, not an institution exclusion.** Such a player has no key, so it can never appear in `excluded` and no `TeamExclusionReason` member exists for it — the shipped union has exactly three members (`team_short_roster`, `female_slots_unfilled`, `male_slots_unfilled`). It ships instead as the integer `droppedPlayersWithoutKey`, surfaced by `allocateInstitutionPrizes` as `players_without_group_field` (TC1.4b) |

### pass

| Code | Fires when |
|---|---|
| `team_ok` | a full team was selected satisfying every configured slot |

### warn

| Code | Fires when |
|---|---|
| `unknown_gender_filled_other_slot` | one or more players with `gender` null/blank were counted toward `male_slots` — the visible consequence of RULING 1. Carries `playerCount`, how many. Only the male-slot fill raises it; the free boards after the minimums require nothing, so they never do |
| `tie_at_prize_boundary` | `detectTieAtPrizeBoundary` (`teamPrizes.ts:72-84`) returns a non-empty set for this group; `resolve_team_tie` is the operator path |

### Rendering rule — binding

**Every code must render as a plain sentence in organizer-facing UI, never as a raw code.** Codes are
an internal vocabulary for the engine, the API payload, and the harness. One mapping table, one place.
Illustrative, subject to RULING 2 (state the rule, never assert a player's attributes):

| Code | Sentence |
|---|---|
| `team_short_roster` | "Fewer players than the team size." |
| `below_minimum_roster` | "Fewer entries than this prize requires." |
| `female_slots_unfilled` | "The rule asks for at least 2 girls and the entry list does not meet it." |
| `male_slots_unfilled` | "The rule asks for other players and the entry list does not meet it." |
| `missing_group_field` | "No school recorded for these players." (a player counter, rendered from `players_without_group_field`, not from an entry in `ineligible_reasons`) |
| `unknown_gender_filled_other_slot` | "Some players have no gender recorded and were counted as other players." |
| `tie_at_prize_boundary` | "Two teams are level at the prize boundary." |

`female_slots_unfilled` says what was **asked for**. It never reports how many girls a school has.

## 5. Sequence — TC1.2 through TC1.6

**Each step is verified before the next begins.** No step starts while the previous one is unverified.
This mirrors the TC0 cadence (a/b/c → d/e → f, each with its own commit and its own evidence).

Reason codes and gender slots are **separate steps**. TC1.3 changes no selection outcome at all; TC1.4
is the first step that can change which team is picked. Keeping them apart is what makes TC1.3's
"byte-identical selection" claim checkable — a step that both reports exclusions and rewrites selection
cannot prove either half.

**TC1.2 — Replace `tests/institution/` with a suite that imports the real module. — DONE.**
Deleted the self-reproducing specs. Wrote tests that `import { computeTeamScores, compareInstitutions,
detectTieAtPrizeBoundary } from '_shared/teamPrizes.ts'` and pin **today's** behaviour: rank-ascending
sort, raw-points sum, the short-roster drop, the blank-key drop, no gender. This establishes a suite
that can fail. Production code unchanged.
*Verified by:* the new suite green against unmodified source, and at least one test demonstrated red by
a deliberate one-line mutation of the scorer that is then reverted (DD2 — a check that cannot fire is
not a check).

**TC1.3 — Reason codes only in `_shared/teamPrizes.ts`. No gender, no schema, no migration. — DONE.**
`computeTeamScoresWithReasons` becomes the real implementation and returns `{ scored, excluded,
droppedPlayersWithoutKey }`; `computeTeamScores` becomes a thin wrapper over its `.scored` with its
exported signature and return type unchanged, so no caller is edited and nothing is duplicated. The two
silent `continue`s of §1.3 and §1.4 become visible: `team_short_roster` per institution, with its real
player count, and `missing_group_field` as an integer count of players dropped before grouping.
`missing_group_field` is a **player-level** condition — those players have no key, so they never appear
in `excluded` and no placeholder key is invented for them. Only these two §4 codes ship here;
`female_slots_unfilled`, `below_minimum_roster`, `unknown_gender_filled_other_slot` and `team_ok` do not.
**Selection behaviour does not change** — an institution dropped before is still dropped, merely now
reported.
*Verified by:* the TC1.2 suite's existing tests passing unmodified, plus new tests for the exclusion
reason and count, the qualifying institution that must not appear in `excluded`, the dropped-player
count across null/empty/whitespace keys, a matched pair where one added player moves an institution from
`excluded` to `scored`, and deep equality between the wrapper's output and `.scored` on one fixture.

**TC1.4 — Gender slots in `_shared/teamPrizes.ts`. — DONE.**
Slot-aware selection under RULING 1, adding `female_slots_unfilled` (fail), `male_slots_unfilled` (fail) and
`unknown_gender_filled_other_slot` (warn) to the vocabulary TC1.3 established. Pure function; still no
caller edited.
*Verified by:* a group at `female_slots = 0, male_slots = 0` producing byte-identical results to TC1.3 —
which is what protects the three live groups — and slot fixtures whose selection differs from the
rank-only selection, so the new path is proved to be doing something.

**TC1.4b — Wire the caller.**
`allocateInstitutionPrizes` passes the group's `female_slots` / `male_slots` into
`computeTeamScoresWithReasons` as `slots`, and emits the resulting exclusion reasons and warnings in
its response. Deploy; re-run the `glanz-open-haryana-cup` curl of §3. This is the step where TC1.4's
scorer first changes anything a user can see.

**Scope boundary — binding.** TC1.4b wires the **compute/preview path only**: the
`allocateInstitutionPrizes` response, which feeds Conflict Review and Finalize. It persists nothing.
`publicTeamPrizes:212-213` and `useTeamPrizeResults.ts:165-166` still hardcode
`ineligible_institutions: 0` because there is still nothing persisted for them to read — §3 forbids
giving `publicTeamPrizes` a compute path, so those two are **not** fixed here and must not be claimed
as fixed. Persistence is TC1.6.

**Corrected count — TC1.4b retires ONE of the four §1.5 hardcoded sites, not two.** The site it retires
is the `:340-341` literal pair. `:319-320` **correctly keeps its `0`**: that branch returns on an
invalid `group_by` before any scoring runs, so no institution has been evaluated and there is nothing
to count — it is not a defect awaiting a fix, and no later step should "fix" it. The two read paths
(`publicTeamPrizes`, `useTeamPrizeResults`) are untouched and remain for TC1.6. Three of the four
sites therefore still hold a literal after TC1.4b, one of them permanently.

What ships in the response:

| Field | Shape | Note |
|---|---|---|
| `ineligible_institutions` | `number` | `excluded.length` — the literal `0` at `:340` is gone |
| `ineligible_reasons` | `string[]`, **ordered by player count descending**, then capped at 10 | Stays `string[]`: `TeamPrizeResultsPanel.tsx:258` renders each entry as a string, and TC1.5 has not run. Plain sentences from one local mapping table obeying RULING 2, each prefixed `"<key>: "` so the organizer knows which school. The order is what makes the cap useful — see below |
| `ineligible_details` | `{ key, reason, playerCount }[]`, uncapped | Additive. The same information machine-readable, so TC1.5 can render it properly instead of re-parsing sentences |
| `players_without_group_field` | `number` | Additive. `droppedPlayersWithoutKey` — a real diagnostic that was invisible until now (§1.4, §4) |
| `warnings` | `TeamWarning[]`, omitted when empty | Additive, per scored institution, on both `winner_institution` and `scored_institutions` |

The invalid-`group_by` early-return branch (§1.5, `:319-320`) also gains the two additive fields as
empty/zero so every `GroupResponse` has one shape. Its `ineligible_reasons` message is unchanged.

**Why the sentence list is ordered by player count.** Measured on the one live tournament with an
active group: 28 institutions, **21 excluded**, and **12 of those are near-misses at 2-9 players against
a `team_size` of 10**. Unordered, the 10-sentence cap would be filled by whichever keys sort first
alphabetically — mostly single-entrant schools the organizer can do nothing about — and would hide the
near-misses, which are the entries worth acting on. Sorting `playerCount` descending before the
`.slice(0, 10)` puts the actionable cases first. `Array.prototype.sort` is stable, so institutions on
equal counts keep the scorer's key order and the output stays deterministic.

**This is presentation only, and deliberately not a filter.** `ineligible_institutions` remains the
full `excluded.length` — every excluded institution is still counted, including single entrants — and
`ineligible_details` remains uncapped in the scorer's key order, so no consumer that wants the whole
set is reading a truncated or reordered view. Only the ten sentences are prioritised.

*Verified by:* `?ping=1` returning `buildVersion: "2026-09-07T00:00:00Z-TC1.4b"` — the version bump in
the dashboard is not evidence of a deploy, the build string is (Y3).

**TC1.5 — Display and printed output.**
One formatter replaces the four independent builders in §1.7 — `TeamPrizeRulesSheet.tsx`,
`TeamPrizesEditor.tsx`, `TeamPrizeResultsPanel.tsx` and the team block of `generatePdf`. `Male Slots`
becomes **"other players (minimum)"** (RULING 1). Every `2F + 2M` becomes a rule sentence (RULING 2).
Codes render through the §4 mapping table as plain sentences, never as raw codes.
*Verified by:* a screenshot of each of the four surfaces, and a generated PDF with no `F`/`M` count
assertion anywhere on it.

**TC1.6 — Roster policy and schema.**
Per-group `minimum_roster_size` column and its `below_minimum_roster` code (RULING 3, signed off
7 September); no tournament-level allow-incomplete-teams column is added. The real counts and reasons already reach
the compute path (TC1.4b retired the literals at `:340-341`); TC1.6 adds persistence so
`publicTeamPrizes` and `useTeamPrizeResults` read codes from the snapshot rather than hardcoding `0`,
which makes the collapsible at `TeamPrizeResultsPanel.tsx:248` reachable on the published page too. **`finalize` is not
edited** (DD1). Then `supabase/ops/tc1_team_gender_checks.sql` joins the existing nine harnesses, built
to DD4's rule: fixtures whose two compared values differ.
*Verified by:* a compute-preview response on a live draft carrying a non-zero `ineligible_institutions`,
the harness green with at least one check demonstrated to fail against pre-TC1 behaviour, the
`glanz-open-haryana-cup` curl of §3 still returning `pinned_version: 13` after the `publicTeamPrizes`
deploy, and `/admin/team-snapshots` loaded — TC0 revived it and it has still never been seen working.

## 6. Out of scope for TC1

- **The main allocation engine.** DD1. `allocatePrizes` is 2011 lines, imports only `supabase-js` and
  `_shared/health.ts`, and has zero references to team scoring or team tables. TC1 keeps it that way.
  RULING 1 is implemented in parallel precisely so that no helper is extracted from it.
- **`finalize`.** Owner ruling.
- **TC2 (Mode A, automatic)** and **TC3 (Mode B, manual)** — see PRD §6.
- **Brochure team-prize extraction is a SEPARATE, LATER WORKSTREAM and is not part of TC1.** The
  extraction engine writes only tournaments, categories and prizes; it does not create
  `institution_prize_groups`, and TC1 does not change that. When it starts it is documented in the
  extraction engine's own docs, not by editing these two files, and not by editing
  `docs/extraction-engine/*` from the team side.
