# PROJECT_STATE — Prize Manager · Universal Extraction Engine
**Last updated:** 8 September 2026 · **Owner:** Tushar · **This file is the single source of truth for continuing work in any new chat.**

Replace the previous PROJECT_STATE.md in the repo with this file. Paste it at the start of every new chat to re-establish context.

---

## 1. What this project is

**Prize Manager** (prize-manager.com) is a chess tournament management platform. Phase 1 built a brochure extraction engine: organizer uploads a PDF brochure → two-pass Gemini OCR + structured extraction + deterministic trust/grounding layer → review screen → on Approve, a tournament is created with categories and prizes.

**Why it exists, from the Phase 1 documents.** The task was brochure extraction; the idea it was planning for was bigger. `docs/extraction-engine/PRD.md` calls Prize Manager the *"first face of the Universal Extraction Engine"*, and `ARCHITECTURE.md` opens with **"One engine, many faces."** The destination was named under "design for, don't build": a standalone product surface — REST API keys plus an MCP server exposing `extract_document`, `get_extraction`, `query_documents`, with multi-tenant metering. The engine has two faces in production today (`chess_brochure`, `payment_screenshot`) and the generality bet has held: Phase 2A added payment screenshots with a new schema row and new invariants, not a new pipeline.

**Three-platform context:**
- **prize-manager.com** — Tournament prize management (live). Phase 2A/2A-2/2A-3 added payment screenshot verification, the full payment lifecycle, UTR trust hardening, the profile prerequisite, **conditional auto-approval (live 20 August 2026)**, the F3 oversight loop (28 Aug), the `extraction_review_queue` security fix and Resend SMTP migration (29 Aug), F3-C2 batch A (30–31 Aug), the B16 investigation (31 Aug), batch F1 and the backlog sweeps (1 Sep), G1/G2/G3 closing the X-exposure (2 Sep), B22 and GTM1 (3–4 Sep), B18-a/B18-b version-pinning published results (5 Sep), TC0 — the team engine reads and writes on one version namespace (5–6 Sep), and now **TC1 — gender slots, reason codes, tier limits and masking, closing DD5 end to end (6–7 September)**.
- **certificate-hub.com** — Certificate creation, paywalled. Will consume the engine via REST API (Phase 2C). **Parked by owner decision 2 Sep.** Public-page inventory 5 Sep — see §15.
- **sportup.online** — Discovery + tournament management. Will consume via REST API (Phase 2C). **Carries one live exposure, `/debug/auth`.** See §15.

---

## 2. Key identifiers

| Item | Value |
|---|---|
| Supabase project | `nvjjifnzwrueutbirpde` (ap-south-1, Postgres 17.6). Org is on the **FREE** plan |
| Repo | github.com/tushar1669/prize-manager (**public**) · `main` at **`fc62a60`** (TC1.6, HEAD) · `9ed454e` RCA export message fix · `712532a` TC1.5 · `3edf96e` TC1.4b · `4777bd1` TC1.4 · `f2a6c8e` TC0-f merge. **`PROJECT_STATE.md` lives at the repo root only** |
| **Deploy model — CORRECTED 7 Sep (DD6)** | **`git push` to `main` deploys BOTH the edge functions and the frontend.** There is no CLI deploy step and no Lovable publish gate — a push **is** a deploy. Consequence: **there is no review gate between commit and production.** Anything that must be reviewed before going live has to be reviewed **before** the push, not after |
| **Edge functions — versions are not evidence** | Every push redeploys every edge function and the frontend, so a recorded version number goes stale within a day. The only reliable check is a function's own build string via `?ping=1` (Y3, DD6). `allocateInstitutionPrizes` carries `BUILD_VERSION = "2026-09-07T09:00:00Z-TC1.5"` |
| **`verify_jwt=false` is THREE functions** | `send-payment-notifications`, `pmPing`, **`publicTeamPrizes`** |
| **Version-vs-hash rule (Y3)** | A version bump is not evidence of a deploy. Better than a hash: **make the function report its own build string** and curl its `?ping=1`. That is how TC0-d/e were confirmed, and a version bump cannot fake it. Since DD6, the same logic covers the frontend too |
| **Free-plan log retention** | **1 day.** Edge-function logs older than ~24h are gone |
| Active extraction schema | v5 (chess_brochure), v3 (payment_screenshot, id `4e8beb4d-4a07-4ef8-a774-18b22f722522`) |
| Gemini model | `GEMINI_MODEL` = `gemini-3.1-flash-lite` |
| Local paths | repo `~/Desktop/prize-manager`, test PDFs `~/Desktop/prize-manager/test-brochures/` |
| Payment trust invariants | 8 in `extract/paymentTrustCheck.ts` · returns `{flags, verdicts}` |
| Checker version | `PAYMENT_CHECKER_VERSION = 1`; the RPC gate pins the literal `1` |
| **F2 kill switch** | `platform_feature_flags` — row `key='payment_auto_approve'`, `enabled = true` since 2026-08-20 17:26:33 UTC. RLS on, zero policies. Off switch: `supabase/ops/f2_auto_approve_off.sql` |
| **F3 oversight objects** | `payment_auto_approval_audit` · `record_auto_approval_audit` · `revoke_auto_entitlement` · `list_auto_approvals()` |
| **`public.referrals` triggers** | **ZERO, by design, since `20260822120000`.** Do not re-add one — see W1 |
| Test baseline | **528 passing / 3 known failures** (conflict-utils ×2, martech-metrics ×1) of **531**, across 60 files |
| **The 3 known failures are probably ONE bug** | Off-by-one-day plus inclusive-boundary on an IST (+05:30) machine is the signature of local-time parsing against UTC dates. Untested hypothesis. Tier 3 |
| **Unconfirmed flake (7 Sep)** | A fourth failure was observed once on an unchanged tree and never reproduced across four later runs. It did not name itself in the summary. Record as an unconfirmed flake, not a known failure. Tier 3 |
| TypeScript check | `npx tsc -p tsconfig.app.json --noEmit` — **12 errors in 6 files**. **Per-file:** `PendingPaymentsPanel.tsx` 5 · `TournamentUpgrade.tsx` 2 · `BrochureImportDialog.tsx` 2 · `BrochureReview.tsx` 1 · `AdminPayments.tsx` 1 · `useAuth.tsx` 1. Root `npx tsc --noEmit` and `npm run typecheck` check **nothing** |
| **tsc exits non-zero, so never chain it** | `npx tsc … && npx vitest run` silently SKIPS vitest. Use `;` or separate commands |
| pg_cron jobs | jobid 1 `expire-stuck-extraction-documents` (*/10); jobid 2 `drain-payment-notifications` (*/2) |
| Claim RPC | **5-arg only**, `RETURNS uuid`, 1 overload, **15 `RAISE EXCEPTION` across 11 codes** |
| **Verification harnesses** | **9 total.** `f2_gate_checks.sql` 24/24 · `f3_audit_checks.sql` 33/33 · `f3c_read_checks.sql` 13/13 · `f0d_rpc_checks.sql` 17/17 · `pf1b_expected_amount.sql` 9/9 · `g1_publish_state_checks.sql` 16/16 · `b22_publish_gate_checks.sql` 14/14 · `b18_version_pin_checks.sql` 16/16 · **`tc0_team_version_checks.sql` 12/12 (new 6 Sep)** |
| **Backlog sweeps** | `supabase/ops/backlog_sweep.sql` (**24 checks**) · `scripts/backlog_sweep_repo.sh` (**11 checks** + tsc baseline). **Run both before planning anything.** Last reading: **DB 12 OPEN / 11 CLOSED / 1 INFO**, **repo 7 OPEN / 4 CLOSED** |
| Design doc | `docs/design/UI_CONVENTIONS.md` — dark-only, enforced by `tests/ui-conventions.spec.ts` |
| **Live census (verified 6 Sep, post-TC0)** | 43 auth users · **133 tournaments, 35 published** · **35 active publications, 0 NULL pins** · 3 institution_prize_groups (2 tournaments, both DRAFTS) · 3 team_allocations (1 tournament) · 12 payments · 6 referrals · 5 referral_rewards. **Player/payment/gender census measured 7 Sep — see §12.18** |
| Platform payee VPA | `9559161414-5@ybl` — hardcoded as `UPI_ID` in `TournamentUpgrade.tsx` **and** held as `PLATFORM_PAYEE_VPA` |

### Public routes — CORRECTED 6 September

| Route | Component | Shows |
|---|---|---|
| `/p/:slug` | `PublicTournamentDetails` | Details + individual winners. **No team prizes** |
| **`/p/:slug/results`** | **`PublicResults`** | **The ONLY page showing team prizes.** Undocumented until 6 Sep |
| `/t/:id/public` | `LegacyPublicRouteCompat` → `PublicWinnersPage` | Redirects when a slug exists. **No team prizes** |

`/p/:slug/results` gets individual winners from `get_public_tournament_results` (pinned by B18-a) and team prizes from the `publicTeamPrizes` edge function. Until TC0, one table on that page was pinned and the other was not.

### Publish path

| Item | Value |
|---|---|
| **Frontend entry** | `Finalize.tsx` → `handlePublish` → `functions.invoke('finalize')` → `rpc('publish_tournament', { tournament_id, requested_slug: null })` |
| `publish_tournament(uuid, text)` | One overload. **`tournament_id uuid, requested_slug text DEFAULT NULL::text`** — the DEFAULT is load-bearing (`42P13`). SECURITY DEFINER. Enforces the B22 title gate. Records `allocation_version` |
| **`publications.allocation_version`** | The allocation version this publication displays. `MAX(allocations.version)` at publish time. **NULL = published before any allocations existed** (Option C) |
| **`publications.version`** | **A PUBLISH COUNTER. Not a results version.** Runs 1–6 live while `allocation_version` runs 1–13; they **disagree on 24 of 35** active publications. Never join anything to it |
| `get_public_tournament_results(uuid)` | SECURITY DEFINER, language `sql`. Reads the pin. **NO `MAX()` FALLBACK** |
| **Client-side read path (B18-b)** | `/p/:slug` and `/t/:id/public` use `useFinalPrizeData` → `getLatestAllocations` with an `AllocationVersionSelector`: `latest` / `pinned` / `unresolved`. Three modes so `undefined` ("use latest") can never be confused with `null` ("pinned to nothing") |
| **`publications` triggers** | `trg_enforce_team_snapshots_on_publications` [BEFORE INSERT OR UPDATE OF is_active, version] and `trg_guard_publication_requires_team_snapshots` [BEFORE UPDATE OF is_active]. Both **column-scoped**: an `allocation_version`-only write fires neither (CC9). **Since TC0 both join `publications.allocation_version`** |
| **`publications` write surface** | `anon` AND `authenticated` hold full INSERT/UPDATE/DELETE; `org_publications_access` is `FOR ALL` owner-or-master. An organizer can rewrite their own pin. **Do not describe published results as "immutable"** — TC0/B18 deliver stability against accidental drift, not tamper-proofing |

### Team engine — mapped 5–7 September

**DD1 boundary. The team engine is separate from the main allocation engine and always must be.**

| Object | Role |
|---|---|
| `_shared/teamPrizes.ts` | `computeTeamScores(players, teamSize, groupBy)` + `detectTieAtPrizeBoundary`, now backed by `computeTeamScoresWithReasons` (TC1.3/TC1.4). **Gender-slot aware since TC1.4 — DD5 closed 7 Sep, see §12.17** |
| `allocateInstitutionPrizes` | **Read-only compute/preview. Writes nothing.** Calls `detectTieAtPrizeBoundary` and, since TC1.4b, `computeTeamScoresWithReasons` |
| `finalize` | **The primary writer of `team_allocations`** in the normal flow. Invokes `allocateInstitutionPrizes`, deletes and re-inserts at the ALLOCATIONS version. §13's old description ("writes allocations but computes nothing") was wrong |
| `backfillTeamAllocations` | Master-only repair. Outside the normal flow. Since TC0 resolves from `allocation_version`; `body.version` still overrides |
| `publicTeamPrizes` | Public reader. Since TC0 pins to `allocation_version` and **has no compute path at all** |
| `resolve_team_tie` | Live SECURITY DEFINER RPC writing `team_allocation_notes`. **Exists** — §13 previously said the tie guard was never built |
| Tables | `institution_prize_groups`, `institution_prizes`, `team_allocations`, `team_allocation_notes`. All four grant full DML to `anon` and `authenticated`; RLS scopes owner-or-master; public SELECT policies correctly key off `tournaments.is_published` |
| **`allocatePrizes` is clean** | 2011 lines, imports only `supabase-js` and `_shared/health.ts`. **Zero** references to team scoring or team tables. Measured 5 Sep |

### Email infrastructure (migrated 29 August 2026)

Custom SMTP via Resend. Host `smtp.resend.com`, port `465`, sender `noreply@prize-manager.com`. Edge-function sender `WELCOME_EMAIL_FROM` = `hello@prize-manager.com`. `RESEND_API_KEY` rotated 29 Aug; old key still live pending B15. **Edge-function secrets are runtime env vars — rotating one needs no redeploy.**

### Migrations (all applied, repaired, version-matched)

`20260817120000` F2-A · `20260817130000` F2-B · `20260817140000` F2-D · `20260817150000` F2-E · `20260817160000` F2-G · `20260822120000` drop dead referrals trigger · `20260827120000` F3-A · `20260827130000` F3-B · `20260828120000` F3-C0 · `20260828130000` F3-C0b · `20260829120000` SEC `extraction_review_queue` · `20260902120000` G1 · `20260904120000` B22 · `20260905120000` B18-a · **`20260905130000` TC0 team version join**.

**G2, G3, G3b, B18-b, TC0-d and TC0-e were not migrations** (frontend or edge functions).

---

## 3. Non-negotiable guardrails

**Phase 1:**
1. **NEVER touch the main allocation engine** — see **DD1** below, which supersedes the old wording.
2. `criteria_json` committed as always `'{}'`.
3. Never weaken grounding or arithmetic. Never weaken checks to force a pass.
4. Client never writes production tables; only `commit-extraction` does, on explicit Approve.
5. No paid services, no new dependencies without justification.
6. Sequential phases, one prompt at a time, max 3–4 deploy cycles then stop and report.
7. Builder/auditor split: Claude Code builds; Claude (chat) verifies via Supabase SQL before advancing.

**Phase 2A:** 8. Auto-approval is CONDITIONAL, server-side, gated on **named invariant verdicts** (D28); **`skipped` is not `pass`** (D39). 9. NEVER use `commit-extraction` for payment data. 10. NEVER modify `review_tournament_payment`'s entitlement-insert logic. 11. Screenshot upload is OPTIONAL; **no screenshot can never auto-approve**. 12. NEVER expose the kill switch in frontend code or logs.

**Other blocks unchanged, see prior PROJECT_STATE for full text:** M1–M5 · N1–N5 · P1–P6 · Q1–Q7 · U1–U5 · R1–R7 · S1–S8 · T1–T6 · V1–V8 · W1–W4 · X1–X9 · Y1–Y5 · Z1–Z4 · AA1–AA5 · BB1–BB5 · CC1–CC12.

### DD1 — Team prizes are a separate engine (OWNER RULING, 6 September 2026)

**Supersedes the old guardrail 1 wording, which named `allocateInstitutionPrizes` and `backfillTeamAllocations` inside the protected engine. Read literally, that made Team Championship unbuildable.**

- **Main engine — never edited for team work:** `supabase/functions/allocatePrizes`, `rule_config`, conflicts, player-to-prize matching, the `allocations` table, and the allocation engine's own docs.
- **Team engine — where all Team Championship work lands:** `_shared/teamPrizes.ts`, `allocateInstitutionPrizes`, `backfillTeamAllocations`, `publicTeamPrizes`, RPC `resolve_team_tie`, tables `institution_prize_groups` / `institution_prizes` / `team_allocations` / `team_allocation_notes`.
- **Team Championship gets its own `docs/team-championship/PRD.md` and `ARCHITECTURE.md`.** It never edits the allocation engine's documents.
- **`finalize` is the only seam** — it writes both `allocations` and `team_allocations`. **Owner ruling: leave `finalize` untouched.** Improvements to the team scorer reach it without editing its file. TC0 needed no change to it, because it already writes at the correct version number.

### DD2 — A fix can dissolve its own probe (6 September)

TC0 made `b18_version_pin_checks.sql` P16 fail **against a correct database**. P16 asserts an `is_active` update on a real publication is *rejected*, to prove its control can fire. TC0's NULL-pin rule means that row now activates legitimately, so the control went quiet and the check reported FAIL.

The repair pins the control row before running the pair, restoring falsifiability without relaxing anything. **When a green check goes red immediately after a change you believe is correct, ask whether the check still measures what it claims** before assuming a regression — and repair the probe rather than the expectation (guardrail 3, CC4).

### DD3 — A test file that imports nothing tests nothing (6 September)

`tests/institution/institution-allocation.spec.ts` has 18 green tests, a header advertising *"team building with gender slot requirements"*, and calls like `buildTeam(schoolA, 4, 2, 2)`. It imports **no source module**. `buildTeam` is defined at line 71 of the spec and exists nowhere in `supabase/functions` or `src`.

The suite reproduces the intended logic and confirms the reproduction agrees with itself. It can never fail when shipped code diverges. **Check the import list before counting a suite as coverage.** Same family as D41 and CC11.

### DD4 — A fixture that starts at version 1 hides a counter mismatch (6 September)

TC0-f's first draft seeded allocations at version 1. The first publish always makes `publications.version = 1`, so the two counters agreed **by accident** — the same coincidence that hides this bug on 11 of 35 live publications. Half the harness passed under pre-TC0 code.

Fixed by seeding at version 5, forcing the counters apart. T5 now cannot pass against the old trigger. **When testing a comparison between two values, make the fixture's two values different.**

### DD5 — A comment can claim a capability the code does not have (6 September)

`allocateInstitutionPrizes` line 27: *"Supports gender slot requirements (e.g., team of 4 must include 2 girls + 2 boys)."* Line 339 calls `computeTeamScores(teamPlayers, group.team_size, columnName)` — the function has **no gender parameters at all**. `female_slots` and `male_slots` are stored, echoed in API responses, badged in the UI as `F2/M2`, printed over results as `2F + 2M`, and never used in selection.

`TeamPrizeRulesSheet.tsx` states the rule to the organizer in writing. **Only the "no gender requirements" case is true.** Exposure today is nil — all 3 live groups have `female_slots = 0, male_slots = 0` — and goes live the moment Mode A ships. Tracked as TC1.

**Closed 7 September 2026 (TC1.6).** Gender slots are now read by the selector, reason codes render as plain sentences, print/display go through one formatter, and the promise in `TeamPrizeRulesSheet.tsx` matches the code. Closed end to end: engine, organizer display, print gating, PDF. See `docs/team-championship/ARCHITECTURE.md` §5 and §12.17.

### DD6 — A git push deploys everything; there is no review gate (7 September 2026)

Measured this session: `allocateInstitutionPrizes` answered `?ping=1` with the TC1.4b build string **before** any CLI deploy; all eleven other edge functions moved +3 versions from the §2 baseline with no CLI deploy for any of them; and `/admin/team-snapshots`'s build stamp read `fc62a60` — HEAD — with no Lovable publish performed.

§2 and §19 previously stated that edge functions need `supabase functions deploy` and that a `src/` change is not live until Lovable publishes. **Both were false. Pushing to GitHub deploys both the edge functions and the frontend.**

**Consequence to state plainly: there is no review gate between commit and production.** A `git push` **is** a deploy. Any step that must be reviewed before going live has to be reviewed **before** the push, not after.

**Phase 2B:** 13. Bank statements are `privacy_class='sensitive'`. NEVER through Gemini. pdfplumber only.

---

## 4–12.15. Phases 1 through 5 September — COMPLETE

See prior PROJECT_STATE for Phase 1, Phase 2A, Workstream C, Phase 2A-2, F0a–F0e, F1, E1–E3, PF1, **F2 (live 20 Aug)**, the **referrals repair (22 Aug)**, **production validation (25–26 Aug)**, **F3 (28 Aug)**, **Resend SMTP (29 Aug)**, **F3-C2 batch A**, **the B16 investigation**, **batch F1 + sweeps**, **G1/G2/G3/G3b**, **B22 + GTM1 + sportup corrections**, and **§12.15 B18-a/B18-b**.

Governing decisions unchanged: **D38, D39, D40, D41, X1–X9, Y1, Z1–Z4, AA1–AA5, BB1–BB5, CC1–CC12**.

---

## 12.16 · 5–6 September 2026 — TC0 shipped, the team engine runs on one version namespace

### The defect

Two independent counters were both called "version":

- `team_allocations.version` — written by `finalize`, counts **results**
- `publications.version` — written by publish, counts **publishes**

Both publication triggers, and `detect_missing_team_snapshots`, compared the first against the second. Measured: they disagree on **24 of 35** active publications (`publications.version` 1–6, `allocation_version` 1–13). The 11 that agree do so by accident — exactly one finalize per publish.

**That is B21.** Not "team snapshots are missing" but "a results number was compared to a publish number." Tournament `74e1bd2b` holds 3 publication rows, 2 active team groups and zero allocations; none of its publications could ever be activated.

**A second, independent defect in the same function:** `detect_missing_team_snapshots` called `is_master(auth.uid())`, and only a zero-arg `is_master()` exists. Every call raised `42883`, so `/admin/team-snapshots` had never returned a row in its life.

### TC0-a/b/c — migration `20260905130000`, commit `06e41d1`

Both triggers and `detect_missing_team_snapshots` now join `publications.allocation_version`. `detect` calls `is_master()` and returns `allocation_version` as `published_version` — column name unchanged, so `AdminTeamSnapshots.tsx` needed no edit.

**NULL pin rule (inherits B18 Option C):** a NULL pin means published before results existed. The team check is skipped and publishing is allowed. Blocking would recreate B21 on a different flow — 4 of 39 publications since June were made with zero allocations, all by customers.

**Grants deliberately untouched.** `anon` holds EXECUTE on all three functions. Real, pre-existing, tracked as B7. Revoking it inside a join fix would have put the publish path of 35 live tournaments in scope for no measured benefit. `CREATE OR REPLACE` preserves ACLs; the post-check asserts `authenticated` retained EXECUTE.

**Verified before apply:** dry-run of the exact file text with only `commit;` → `rollback;` changed, proved by `diff` showing one line. Production confirmed byte-identical afterwards.

**Verified after apply, matched pair on ONE live row** (`74e1bd2b`'s publication):

| | Before TC0 | After |
|---|---|---|
| `detect_missing_team_snapshots` | `42883` (function absent) | **`42501` forbidden** — body runs |
| NULL pin, 2 active team groups | blocked forever | **ACTIVATED** |
| **Same row**, pin = 1, no snapshot | blocked | **BLOCKED `23514`** |

The error code moving 42883 → 42501 is the proof: the old code died before reaching the permission check.

### TC0-d/e — edge functions, commit `2ef0c93`

**`publicTeamPrizes`** pins to `allocation_version`, and its **live-compute fallback is deleted**. Previously, when the snapshot lookup missed — the normal case, given the wrong join — it recomputed team standings from the **current `players` table at request time**. Correcting a player's club spelling could change an announced result. Now a missing snapshot renders the prize structure with `winner_institution: null`, an explicit empty state the UI already handled (D32).

The deploy uploaded only `index.ts` and `health.ts`, **not `_shared/teamPrizes.ts`** — bundle-level proof the scorer dependency is gone. Response gained `pinned_version` and `snapshot_rows`.

**`backfillTeamAllocations`** resolves from `allocation_version`; a NULL pin returns a 400 explaining why rather than writing into a namespace nothing reads. `body.version` still overrides.

**Verified live, discriminating:** `glanz-open-haryana-cup` has `publications.version = 2` and `allocation_version = 13`. The deployed function returned **`pinned_version: 13`**. The old bundle could not produce that number.

### TC0-f — harness `tc0_team_version_checks.sql`, commit `f2a6c8e`

**12/12.** Three matched pairs. T5 encodes the B21 door — the fixture allocates at version 5 while the first publish makes `publications.version = 1`, so **T5 cannot pass against pre-TC0 code**, which would refuse that publish outright.

Discriminating against the old code: T1, T2, T3 (structural), T5, T8. The rest are guards and controls.

**What it cannot reach, written into the file header:** `publicTeamPrizes` is TypeScript on an Edge Function; SQL cannot call it. **Re-run the `glanz-open-haryana-cup` curl after any `publicTeamPrizes` deploy — this harness will not catch a regression there.**

### Also repaired

`b18_version_pin_checks.sql` P16 — see **DD2**. Back to 16/16, with the guard observed firing.

### Findings recorded, not acted on

- `/p/:slug/results` is a third public route, undocumented until now (§2).
- `resolve_team_tie` and `team_allocation_notes` exist live; the tie guard **was** built (§2).
- `tests/institution/` provides zero coverage — **DD3**.
- Gender slots are a written promise the engine does not keep — **DD5**, now TC1.
- `verify_jwt=false` is three functions, not one (§2).

---

## 12.17 · 6–7 September 2026 — TC1 shipped, DD5 closed end to end

TC1 shipped in order: TC1.1 docs, TC1.1b `docs/team-prizes.md` corrections, TC1.2 a real test suite (replacing the self-reproducing `tests/institution/` specs — DD3), TC1.3 reason codes, TC1.4 gender slots, TC1.4b wiring + deploy, TC1.5 display and print, TC1.6 tier limits + masking + honest labels. HEAD is `fc62a60`.

**DD5 is closed end to end:** engine, organizer display, print gating, PDF. See `docs/team-championship/ARCHITECTURE.md` §5 for the per-step detail and verification.

**RULING 3's per-group `minimum_roster_size` is decided but not built.** No `tc1_` harness was written — TC1.6's scope changed to tier limits, masking and honest group labels instead (`docs/team-championship/ARCHITECTURE.md` §2, §5; PRD §3). Anyone picking this up should treat `minimum_roster_size` as designed, not shipped.

**New baselines:** vitest **528 passed / 3 known failures** of **531**, across 60 files — the 3 known failures are unchanged (conflict-utils ×2, martech-metrics ×1). tsc 12 errors in 6 files, unchanged. Harnesses still 9 — TC1 added none.

**RCA export was never broken.** `exportRcaToXlsx` returned `false` when there were no unfilled prizes, and the caller reported that as a failure. Fixed in `9ed454e` as a message, not a download fix — same family as D21/D32.

---

## 12.18 · Census and business facts (measured 7 September 2026)

- **Players.** 15,700 player records. 10,479 are minors by DOB; 8,726 carry an under-18 type label; 3,009 minors appear on PUBLISHED public pages with name, age category and school. Measured fact only — no legal conclusion drawn.
- **Payments.** 3 approved totalling ₹1,500, from 2 accounts, **both Tushar's** (`tusharsaraswat68@gmail.com` and its `+r3` alias). **No third party has ever paid.** 9 rejected. The pay path is live and reachable.
- **Coupon farming is closed.** `authenticated` holds zero column-level UPDATE grants on `profiles`, and `update_my_profile` only READS `profile_reward_claimed` to echo it — it cannot set or reset it.
- Only 2 of 43 profiles have ever claimed the profile reward. Flagged as a possible dead write path (the D40 lesson), unverified.
- **`players.points`:** 10,614 of 15,700 populated, across 53 of 77 tournaments, including 3,632 half-point scores. Tournament `0d54de9f` (Jaipur) has NULL points although its source file carries `Pts` — a stale import artifact, **not** a platform defect.
- **Gender provenance:** 68 of 77 tournaments follow "F marked, everyone else blank"; only 2 have explicit M. Jaipur's F marks come from an unlabelled column after the name, handled by `genderInference`'s headerless case.
- **Migration ledger drift.** `20251201090000_add_category_type_to_categories.sql` is recorded as APPLIED in `supabase_migrations.schema_migrations`, but the column does **not** exist in production — a false-applied ledger entry, the inverse of D40. The engine reads `criteria_json.category_type` and is unaffected.

---

## 12.19 · Individual engine gender investigation — closed negative (7 September 2026)

An investigation asked whether treating blank gender as male was a carried-over blunder in individual prize allocation. **It is not.** `allocatePrizes:1523-1556` implements: girls categories require an explicit `F`; boys mode (`'M'` or `'M_OR_UNKNOWN'`) means "not F" and admits blanks; open admits everyone.

Measured across every allocation ever made: **zero** players with unrecorded gender have won a girls-only prize, across 62 tournaments. 541 allocation rows went to unrecorded-gender players under boys-mode rules, as intended. Swiss-Manager's manual documents the Sex field as *"W..woman, C..Computer or blank..man"*, so the rule matches the source format.

**One real defect found:** tournament `8265c82a` has a girls-only prize and zero gender data on any of its 150 players, so that prize can never be awarded. It is **unpublished**. Filed as a Tier 2 item (§14): warn at finalize when a category's rule can match no player in the field.

---

## 12.20 · Status, 7 September 2026

- **Legal brief sent to counsel 7 September**, covering all three properties (prize-manager.com, certificate-hub.com, sportup.online). Reply expected in 1–2 days.
- **Payments stay LIVE by owner decision.**
- **PostHog remains gated** behind the privacy work, per the §15 condition — not forgotten, deliberately blocked.
- **Demo to FIDE arbiters 13 September 2026.** Run sheet exists outside the repo.

---

## 12.21 · Ground-truth validation against a human arbiter (8 September 2026)

Every fact below was measured on 8 September 2026 against tournament `0d54de9f-242a-41bd-a2ad-a70f712c3fd7` (Second Jaipur Open Classical FIDE Rated 2025, 318 players, unpublished draft). Recorded, not re-derived.

### The headline

The individual allocation engine was compared, placement by placement, against the event's official Final Prize List as awarded by the Chief Arbiter. 14 categories, 100 prizes. **First time any output of this platform has been checked against a human-produced result.**

| Step | Agreement |
|---|---|
| As configured | 76/100 |
| After adding "Jpr - Raj" to Best RAJASTHAN's `allowed_clubs` | 94/100 |
| After correcting one prize amount, ₹6,996 → ₹7,000 | 96/100 |

Allocation is now at **version 5**.

### Finding 1 — disjoint geographic club lists

Best RAJASTHAN filtered `allowed_clubs: ["Rajasthan"]`; Best JAIPUR filtered `["Jpr - Raj"]`. Disjoint, so a Jaipur player could never win the Rajasthan prize — but Jaipur is *in* Rajasthan and the arbiter treated it as such. One value added; agreement moved 76 → 94.

**Configuration lesson:** a geographic category's `allowed_clubs` must include every club value inside that geography.

### Finding 2 — a four-rupee prize amount moved a player between categories (the most important entry)

Main (Open) place 10 was entered as ₹6,996 instead of the brochure's ₹7,000. This tournament's `rule_config` reads `multi_prize_policy: 'single'`, `prefer_main_on_equal_value: true`, `main_vs_side_priority_mode: 'main_first'`. A multi-eligible player therefore takes the **highest-value** prize they qualify for, with Main winning only on an exact tie. At ₹6,996 the side prize was worth four rupees more, so it took the player; at ₹7,000 the values tie and Main wins, matching the arbiter.

Correcting it moved **two** placements (Main #10 and Rating 1651-1900 #9) and took agreement 94 → 96.

**Lesson, stated plainly:** a prize amount is not cosmetic — under `multi_prize_policy: 'single'` it is an input to *which* prize a player receives. **Nothing flagged it.** The brochure's own prize table is the authority and no check compares entered amounts against it. **Tier 2** (§14): validate entered prize amounts against the extracted brochure prize table.

### Finding 3 — the 3 remaining differences are an unresolved tie-break, and the engine's answer is rank-optimal

All three involve ₹6,000 prizes of equal value. The four players, all on 5.5 points:

| Player | Rank | Club | Engine result |
|---|---|---|---|
| Ojas Maheshwari | 66 | Rajasthan | Best RAJASTHAN #5 |
| Yash Dahiya | 72 | Haryana | Rating 1401-1650 #10 |
| Kavyansh Jain | 74 | Jpr - Raj | Best JAIPUR #5 |
| Anirudha Khandelwal | 86 | Jpr - Raj | no prize |

The arbiter instead awarded ranks 66, 74 and 86, giving Anirudha a prize and Yash none. Yash is from Haryana with no age type, so the Rating band is the **only** ₹6,000 prize he can win. Assigning the three prizes to the three highest-ranked eligible players (66, 72, 74) admits exactly one arrangement, and it is the one the engine produced. **The engine's winning set is uniformly better by rank at identical cost.**

The brochure states only *"Players qualified for more than one prizes will be considered only for the higher prize"* — silent on equal prizes. Nothing in the published rules decides it.

**Caveat, stated honestly:** the arbiter may have applied discretion not in the brochure (home-city preference, a withdrawal, absence from the ceremony). We have his output, not his reasoning. **Do not record this as an arbiter error.**

**Root cause in our config:** `rule_config.category_priority_order` is an empty array, so equal-value ties resolve by an implicit fallback rather than a stated rule. **Tier 2** (§14): populate it so ties resolve by documented policy.

### Finding 4 — no prize inversion in either allocation

Checked: every category list in the arbiter's PDF ascends by rank, and the engine assigns places in rank order by construction. No higher-value prize went to a lower-ranked player anywhere, in either allocation.

### Finding 5 — truncated player name

Unrated #10 is stored as the single letter "T". The player is Tavish Singh Rathore, rank 170. A real import defect, unrelated to allocation, and the only remaining difference that is unambiguously a bug. **Tier 2** (§14).

### Finding 6 — team prizes cannot be ground-truthed, and why it matters

Of 18 real tournament documents examined, only 2 mention team prizes. The NEW DELHI OPEN (`6b63300e-756a-47ba-acb8-96c97418cf33`, 1119 players) **did** award Best School and Best Academy — they appear in its Prize Winners List — but its brochure never mentions them, and its `players.club` column holds **states** (Delhi 367, Uttar Pradesh 217, Haryana 130), not school names. `players.team` is empty.

**Conclusion:** team prizes at these events are awarded from data that never enters the Swiss Manager export. The team engine groups only on club, team, city, state, `group_label` or `type_label` — all of which come from that file — so it **cannot** produce Best School where school names were never imported.

**This is the most important product finding of the session and it should lead TC2/TC3 planning:** an import path for institution data is required before Best School is possible. Filed to Tier 2 (§14) and §15.

Corollary: brochure extraction of team prizes is **not** the blocker. Organizers decide team prizes after the brochure is printed.

### GTM positioning, decided 8 September

See §15 for the full statement — the validation result is GTM material, with hard limits on how it may be framed.

---

## 13. Immediate next step

**TC1 is complete** (shipped 6–7 September 2026, HEAD `fc62a60`). DD5 is closed end to end: engine, organizer display, print gating, PDF. RULING 3's per-group `minimum_roster_size` is decided (PRD §3) but not built — no `tc1_` harness was written; TC1.6's scope changed to tier limits, masking and honest group labels instead. See §12.17.

The tournament-level allow-incomplete-teams toggle considered on 6 September was **withdrawn by RULING 3** (7 September) in favour of a per-group `minimum_roster_size` — see PRD §3, ARCHITECTURE §2.

**Ground-truth validation against the Jaipur Final Prize List is complete** (8 September 2026 — 96/100 placements, individual engine only. See §12.21).

### Next, in order

1. **SP-1** — `/debug/auth` on sportup.online, own session, different repo.
2. **Safe GTM pages** — About, FAQ, Pricing, Contact. Terms/Privacy/Refund get placeholder routes only until counsel replies (brief sent 7 Sep).
3. **Friday 12 Sep** — build and publish the demo tournament, full UI read-through, keep its public URL as the demo fallback.
4. **Sunday 13 Sep** — FIDE arbiter seminar demo.

### Then TC2 / TC3

Led by the institution-import gap in Finding 6 (§12.21): an import path for institution/school data is required before Best School is possible.

**TC2 — Mode A (automatic).** Organizer uploads the Swiss Manager file, defines composition, system picks each school's team by highest points/rank and ranks the teams. Largely exists now that TC1 has landed: `parseWorkbook` handles upload, the schema holds composition, `allocateInstitutionPrizes` selects and ranks.

**TC3 — Mode B (manual).** Organizer fixes the size and composition, then for each school picks the team from a dropdown of eligible players; the system sums their scores. Genuinely new — needs a schema change to record a hand-picked team, a per-school UI, and a writer.

**Operational hold:** do not open `/t/8d1fbd83-…/finalize`. Auto-finalize fires on page load and creates allocation versions. **B18 + TC0 make this harmless to public pages** — neither individual nor team results move — but it still creates junk versions. Hold stands until B18-3.

---

## 14. Backlog — the GTM gate

**The bar:** does it make a public statement false, produce wrong participant-facing output, or embarrass us at the National Championship.

### Tier 1 — CLEAR as of 6 September

| Item | Status |
|---|---|
| X1–X4-exposure | ✅ 2 Sep, G1+G2 |
| GTM1 · B22 · sportup claims | ✅ 3–4 Sep |
| B18-a / B18-b | ✅ 5 Sep |
| **B21 / TC0 — team results unpinned and the one-way door** | ✅ **6 Sep — 12/12, verified live** |
| **TC1 / DD5 — gender slots enforced, closed end to end** | ✅ **6–7 Sep — TC1.1 through TC1.6, HEAD `fc62a60`. See §12.17** |
| **Ground-truth validation, individual engine vs. Jaipur Final Prize List** | ✅ **8 Sep — 96/100, root causes identified for all 4 misses. See §12.21** |

**Still Tier 1, from the site inventories (§15):** **SP-1** `/debug/auth` ungated on sportup.online — **do not wait for GTM** · **SP-2** contradictory refund policies · **SP-3** false payment claims (cards/net banking advertised, none processed) · **SP-4/5/6/7** impossible refund mechanics, mismatched windows, phantom fees, garbled Privacy line · **PM-1** prize-manager.com has **no legal pages at all** while taking UPI money.

### Tier 2

- **Validate entered prize amounts against the extracted brochure prize table** — under `multi_prize_policy: 'single'`, a prize amount decides *which* prize a multi-eligible player receives; a ₹4 entry error (₹6,996 vs. brochure ₹7,000) moved two placements in the Jaipur ground-truth check and nothing flagged it. Highest-value finding of the session (§12.21, Finding 2).
- **Populate `rule_config.category_priority_order`** — currently an empty array on every tournament, so equal-value ties resolve by an implicit fallback rather than a documented policy. Surfaced by 3 of 100 Jaipur placements where four players tied on prize value (§12.21, Finding 3).
- **Institution-import gap** — the team engine groups only on club/team/city/state/`group_label`/`type_label`, all sourced from the Swiss Manager export, which never carries school names. The New Delhi Open awarded Best School/Best Academy from data outside that file. No institution-data import path exists, so Best School cannot be ground-truthed or, at these events, computed at all. **Should lead TC2/TC3 planning** (§12.21, Finding 6; §13).
- **Truncated player name** — Jaipur tournament `0d54de9f`, Unrated #10 stored as the single letter "T"; actual player is Tavish Singh Rathore, rank 170. Import defect, unrelated to allocation (§12.21, Finding 5).
- **RULING 3 — per-group `minimum_roster_size`** — decided 7 Sep, not built. No `tc1_` harness exists yet (§12.17, PRD §3).
- **`generatePdf` live-compute fallback** (`generatePdf/index.ts:155-169`) — falls back to invoking `allocateInstitutionPrizes` and computing team standings live when the persisted snapshot is missing, the same defect TC0-d removed from `publicTeamPrizes`. Filed, out of scope for TC1. See `docs/team-championship/ARCHITECTURE.md` §3.1.
- **Migration `20251201090000` false-applied ledger entry** — recorded APPLIED, column absent in production; engine unaffected (§12.18).
- **Girls-only prize that can never be awarded** — tournament `8265c82a`, zero gender data on 150 players, unpublished. Warn at finalize when a category's rule can match no player in the field (§12.19).
- **G4** — required details before publish, including not defaulting `start_date` to today.
- **B7** drift migration — 8 untracked functions; `anon` EXECUTE on `admin_create_coupon`, `admin_list_coupons`, `redeem_coupon_for_tournament`, `bootstrap_master`, **and now the three TC0 functions**; `is_master(uuid)` still absent by design. **Sweep check B7a must be rewritten** — it measures "does the overload exist", and TC0 removed the dependency instead of adding the overload (CC4).
- **B18-c** — `ON DELETE CASCADE` into published history. Same shape exists on `team_allocations` (`prize_id`, `group_id`). Own decision.
- **B22 slug-change UI** · **column-level UPDATE on `tournaments` and `publications`** · **B13 batch B/C, #9, #7** · **B17 + B8b** · **B5 audit cadence** · **B19** · **B18-3**.

### Tier 3

The 3 known test failures are probably one timezone bug · a fourth vitest failure seen once on an unchanged tree, never reproduced across four later runs, unnamed in the summary — unconfirmed flake, not a known failure (§12.17) · no test covers `ColumnFilter` or the B18 selector modes · `PublicWinnersPage` "0 Winners" badge on the pin error path · `401` on `/rest/v1/players` capability probe · B1 · Y2 · B10 · B12 · B14 · B15 · B2 · B3 · B6 · Playwright layout test · `CLAUDE.md` drift · `MAX_ATTEMPTS=5` no backoff · `tsconfig.app.json` scope gap.

---

## 15. Cross-property GTM inventory (5 September 2026)

**certificate-hub.com** — Terms and Privacy exist, dated 4 Sep 2026. No money statements on public pages, so the paywall is not live. Missing: legal entity, registered address, governing law; Refund policy (**required the day the paywall goes live**); referral "points" undefined; no `sitemap.xml`; no About/FAQ/Pricing.

**sportup.online** — SP-1…SP-7 above. Also: Privacy dated October 2023 while Terms says 3 Sep 2026; Terms footer "© 2023"; WhatsApp link with no number bound; no sitemap. Meta-tag pass approved 4 Sep but **not yet published** — when it ships, verify the `og:image` claim and note `/tournaments/:id` pages were excluded from the sitemap, which is where the SEO value is.

**The common item — one engagement, not three.** All three lack a named legal entity, registered address and governing-law clause, and all three need refund terms matching a manual UPI flow. **Brief one professional across all three.** Do NOT have any model draft the legal copy — sportup's Terms already had to be corrected for naming Stripe/PayPal on a UPI product, and the garbled *"We use manual payment for payment processing"* line is the visible scar.

**Analytics — PostHog, not GA4.** Three conditions: install **after** the privacy work (DPDP Act 2023 applies); load by snippet, not npm (guardrail 5); do not replace `audit_events` or the martech dashboards. Status as of 7 Sep — legal brief sent to counsel, reply expected in 1–2 days; PostHog stays gated on that. See §12.20.

**GTM positioning — the Jaipur ground-truth validation, decided 8 September.** The result (§12.21) is GTM material, with hard limits:

- **Permitted:** "matched the official list on 96 of 100 placements on a real 100-prize open."
- **NEVER** "96% accurate" — it is one tournament, not a rate.
- **NEVER** name the event, the arbiter or any player in public material. The Chief Arbiter is named on that prize list and the demo audience is his professional peers.
- **NEVER** frame it as finding an arbiter's mistake.
- The positioning is **defensibility, not accuracy**: "it doesn't replace the arbiter's judgement, it makes the judgement visible and writes it down."
- **GTM offer to make at the seminar:** a free replay of an organizer's own past tournament from their Swiss Manager file and prize list.

---

## 16. Ordering

**TC1 (shipped)** → Jaipur Final Prize List ground truth (done, 8 Sep — §12.21) → SP-1 (`/debug/auth`, own session, different repo) → **GTM pages** (About/FAQ/Pricing/Contact — Terms/Privacy/Refund placeholder routes only) → Friday 12 Sep demo tournament build + publish + UI read-through → Sunday 13 Sep FIDE arbiter seminar demo → sportup SP-2…SP-7 → legal engagement (brief sent 7 Sep, in progress, parallel, no repo access) → sitemaps → G4 → PostHog → Tier 2 (led by the institution-import gap, §12.21 Finding 6) → Phase 2B → TC2 → TC3.

certificate-hub.com integration parked by owner decision 2 Sep.

---

## 17. Phase 2B / 2C-D / 3 / 4 — unchanged

Phase 2B bank reconciliation (pdfplumber only, never Gemini). Phase 2C–D REST API + MCP server — the standalone product surface the engine was designed for from the start (§1). Currently four workstreams out.

---

## 18. Tracked debt

Superseded by §14's three-tier gate. The sweeps are the canonical *measurement*. Where this document and a sweep disagree, **the sweep wins and the document gets corrected** (BB1).

---

## 19. How to start each new chat

**One chat per workstream.** At every phase boundary: Claude gives an updated `PROJECT_STATE.md` → delete the old one in the Project knowledge panel → upload the new one → open a fresh chat → paste the opening line.

**Division of labour:** design, schema audit and independent verification belong in **chat**; write-run-fix loops on SQL and TypeScript belong in **Claude Code**.

**The backlog loop:** run both sweeps first · correct the document where a verdict contradicts it (BB1) · re-run after shipping · **UNMEASURED is never CLOSED** · every new item gets a check the day it is filed (BB5), with a reachable CLOSED state (CC4).

**Working rules:**
- `git config --global core.editor "true"` is set. Still prefer `git merge --no-ff -m "…"`.
- Always `/clear` in Claude Code before a new prompt — **and verify it took.**
- **First command in any new Terminal window is `cd ~/Desktop/prize-manager`.**
- **`npm run dev` reads and writes the live database.** Check which account you are signed in as.
- **Never chain `npx tsc … && npx vitest run`.** Use `;` or run separately.
- **`supabase db execute` does not exist.** **`supabase functions logs` does not exist.** **`supabase db query --linked -f -` does not read stdin** — it looks for a file named `-`. Write a temp file and pass the path (new 6 Sep).
- Migration workflow: `supabase db query --linked -f <file>` then `supabase migration repair --status applied <version>`.
- **A new database function needs `notify pgrst, 'reload schema'`** (T6) — and so does a new COLUMN the frontend will select.
- **A `git push` to `main` is a deploy (DD6).** It ships both the edge functions and the frontend, with no CLI deploy step and no Lovable publish gate. There is no review gate between commit and production — review before the push, not after. A migration is live the moment `db query` runs.
- **Make a function report its own build string and curl `?ping=1`** — a version bump cannot fake that (Y3, improved 6 Sep).
- **A build report is a claim. Require the full `git --no-pager diff`** — blind to NEW files, so `git add -A` then `diff --cached` (CC6).
- **Every migration must self-verify and fail loudly**, in one transaction, opening with a pre-flight that asserts the audited state.
- **Dry-run the exact file text** (CC11). The only permitted deviation is `commit;` → `rollback;`, proved by a `diff` showing exactly one changed line.
- **`prosrc` includes comments** — `regexp_replace(prosrc,'--[^\n]*','','g')` before matching (CC10).
- **Prove the fix with a test that can only pass if the fix works.** Prefer *matched pairs on one row, one column apart*, assert the positive side is non-zero, and **compare content checksums, not row counts**.
- **Make a fixture's two compared values different** (DD4).
- **Check a test file's imports before counting it as coverage** (DD3).
- **When a green check goes red after a correct change, ask whether the check still measures what it claims** (DD2).
- **Read the triggers on any table a function writes to** (CC1) — **and watch the guard actually fire** (CC9).
- **A grant is not an exposure until a real read returns rows — and it is one once it does** (BB4).
- **Absence of a value is not evidence the value is null.** A failed query must render an explicit state (D32).
- **Never let an error handler discard the input that caused the error** (W4).
- **Never redirect a generator onto a tracked file** (R7). Temp file → verify → `cp`.
- Additive migration → verify → frontend → verify → restrictive migration. Never the reverse.
- **Do not fix what measurement says is not broken.** Record it as drift (W3).
- **Reference literals, not line numbers**, in any check or document.
- Paste terminal output as **text**, never screenshots.
