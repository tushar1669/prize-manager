# PROJECT_STATE — Prize Manager · Universal Extraction Engine
**Last updated:** 5 September 2026 · **Owner:** Tushar · **This file is the single source of truth for continuing work in any new chat.**

Replace the previous PROJECT_STATE.md in the repo with this file. Paste it at the start of every new chat to re-establish context.

---

## 1. What this project is

**Prize Manager** (prize-manager.com) is a chess tournament management platform. Phase 1 built a brochure extraction engine: organizer uploads a PDF brochure → two-pass Gemini OCR + structured extraction + deterministic trust/grounding layer → review screen → on Approve, a tournament is created with categories and prizes.

**Phase 2** extends the same engine into a Universal Extraction Engine serving three platforms and eventually external developers. The engine is doc-type-driven; adding a document type requires a new schema row and new trust invariants, not a new pipeline.

**Three-platform context:**
- **prize-manager.com** — Tournament prize management (live). Phase 2A/2A-2/2A-3 added payment screenshot verification, the full payment lifecycle, UTR trust hardening, the profile prerequisite, **conditional auto-approval (live 20 August 2026)**, the F3 oversight loop (28 Aug), the `extraction_review_queue` security fix and Resend SMTP migration (29 Aug), F3-C2 batch A (30–31 Aug), the B16 investigation (31 Aug), batch F1 and the backlog sweeps (1 Sep), G1/G2/G3 closing the X-exposure (2 Sep), B22 and GTM1 (3–4 Sep), and now **B18-a + B18-b — published results are version-pinned (5 September)**.
- **certificate-hub.com** — Certificate creation, paywalled. Will consume the engine via REST API (Phase 2C). **Parked by owner decision 2 Sep** pending a seamless prize-manager → certificate-hub handoff. Public-page inventory taken 5 Sep — see §15.
- **sportup.online** — Discovery + tournament management. Will consume via REST API (Phase 2C). Public-page inventory taken 5 Sep — see §15. **Carries one live exposure, `/debug/auth`.**

---

## 2. Key identifiers

| Item | Value |
|---|---|
| Supabase project | `nvjjifnzwrueutbirpde` (ap-south-1, Postgres 17.6). Org is on the **FREE** plan |
| Repo | github.com/tushar1669/prize-manager (**public**) · `main` at **`1e0dada`** (sweep checks) · `7a187aa` B18 merge · `988403d` B18-b · `2f3528b` B18-a · `2cb9f83` PROJECT_STATE · `7b6c152` B22 merge · prior: `e207f41` G3b · `dcb8274` G3 · `0ccfdcd` G2 · `44c289b` G1 · `a5bebf8` F2. **`PROJECT_STATE.md` lives at the repo root only** |
| **Edge functions** | `extract` **v48** · `send-payment-notifications` **v9**, `verify_jwt=false` · `commit-extraction` **v14** · `sendWelcomeOnboardingEmail` **v21** · `allocatePrizes` v368 · `finalize` v355 · `generatePdf` v353 · `parseWorkbook` v341 · `allocateInstitutionPrizes` v251 · `publicTeamPrizes` v240 · `pmPing` v238 · `backfillTeamAllocations` v38. **Untouched 29 Aug – 5 Sep** |
| **Version-vs-hash rule (Y3)** | A version bump is not evidence of a deploy; the bundle hash is. **Better still: check the bundle's `__vite__mapDeps` list for a module that did not exist before** — that is how the B18-b publish was confirmed (`assets/usePublishedAllocationVersion-BOqEGwdO.js` in `index-J-hNkfzB.js`) |
| **Free-plan log retention** | **1 day.** Edge-function logs older than ~24h are gone |
| Active extraction schema | v5 (chess_brochure), v3 (payment_screenshot, id `4e8beb4d-4a07-4ef8-a774-18b22f722522`) |
| Gemini model | `GEMINI_MODEL` = `gemini-3.1-flash-lite` |
| Local paths | repo `~/Desktop/prize-manager`, test PDFs `~/Desktop/prize-manager/test-brochures/` |
| Payment trust invariants | 8 in `extract/paymentTrustCheck.ts` · returns `{flags, verdicts}` |
| Checker version | `PAYMENT_CHECKER_VERSION = 1`; the RPC gate pins the literal `1` |
| **F2 kill switch** | `platform_feature_flags` — row `key='payment_auto_approve'`, `enabled = true` since 2026-08-20 17:26:33 UTC. RLS on, zero policies. Off switch: `supabase/ops/f2_auto_approve_off.sql` |
| **F3 oversight objects** | `payment_auto_approval_audit` · `record_auto_approval_audit` · `revoke_auto_entitlement` · `list_auto_approvals()`. RLS on, zero policies, zero client table grants, `anon` no EXECUTE |
| **`public.referrals` triggers** | **ZERO, by design, since `20260822120000`.** Do not re-add one — see W1 |
| Test baseline | **479 passing / 3 known failures** (conflict-utils ×2, martech-metrics ×1) of **482** |
| **The 3 known failures are probably ONE bug** | `normDob('Jan 5, 2024')` → `2024-01-04`; the name+dob duplicate test depends on that same `normDob`; the martech inclusive-boundary test returns false. Off-by-one-day plus inclusive-boundary on an IST (+05:30) machine is the signature of local-time parsing against UTC dates. Untested hypothesis — but treat it as one timezone bug, not three. Tier 3 |
| TypeScript check | `npx tsc -p tsconfig.app.json --noEmit` — **12 errors in 6 files**. **Per-file baseline:** `PendingPaymentsPanel.tsx` 5 · `TournamentUpgrade.tsx` 2 · `BrochureImportDialog.tsx` 2 · `BrochureReview.tsx` 1 · `AdminPayments.tsx` 1 · `useAuth.tsx` 1. **`AutoApprovedPanel.tsx`, `Finalize.tsx`, `AdminTournaments.tsx`, `admin/ColumnFilter.tsx`, `usePublishedAllocationVersion.ts`, `getLatestAllocations.ts`, `useFinalPrizeData.ts`, `PublicTournamentDetails.tsx`, `PublicWinnersPage.tsx` have zero and must keep zero.** Root `npx tsc --noEmit` and `npm run typecheck` check **nothing** |
| **tsc exits non-zero, so never chain it** | `npx tsc … && npx vitest run` silently SKIPS vitest, because 12 errors is the normal state. Use `;` or separate commands. This bit us on the B18 merge |
| pg_cron jobs | jobid 1 `expire-stuck-extraction-documents` (*/10); jobid 2 `drain-payment-notifications` (*/2) |
| Claim RPC | **5-arg only**, `RETURNS uuid`, 1 overload, **15 `RAISE EXCEPTION` across 11 codes** |
| Backstop index | `uq_tournament_payments_utr_active` — UNIQUE on `normalize_utr(utr)` WHERE `status <> 'rejected'` |
| **Brochure upload cap** | `storage.buckets.file_size_limit = 10485760` (10 MB) on `extraction-uploads`. See B17 |
| Verification harnesses | **8 total.** `f2_gate_checks.sql` 24/24 · `f3_audit_checks.sql` 33/33 · `f3c_read_checks.sql` 13/13 · `f0d_rpc_checks.sql` 17/17 · `pf1b_expected_amount.sql` 9/9 · `g1_publish_state_checks.sql` 16/16 · `b22_publish_gate_checks.sql` 14/14 · **`b18_version_pin_checks.sql` 16/16 (new 5 Sep)** |
| **Backlog sweeps** | `supabase/ops/backlog_sweep.sql` (**24 checks** after B22a/B22b) · `scripts/backlog_sweep_repo.sh` (**11 checks** after B22g, plus the tsc baseline). **Run both before planning anything.** Last reading: **DB 12 OPEN / 11 CLOSED / 1 INFO**, **repo 7 OPEN / 4 CLOSED** |
| Operational scripts | `f2_auto_approve_on.sql` · `f2_auto_approve_off.sql` · `f2_auto_approval_report.sql` · the two sweeps. **Not migrations** |
| Design doc | `docs/design/UI_CONVENTIONS.md` — dark-only, enforced by `tests/ui-conventions.spec.ts` |
| **Live census (verified 5 Sep, post-B18)** | 43 auth users · **133 tournaments, 35 published** · **95 publications, 35 active, 35 pinned, 0 unpinned** · **0 drifted** · **0 stub slugs** · 33 drafts still titled `Untitled Tournament` and gated by the title check · 23 soft-deleted · 12 payments · 6 referrals · 5 referral_rewards · 1 audit row |
| Platform payee VPA | `9559161414-5@ybl` — hardcoded as `UPI_ID` in `TournamentUpgrade.tsx` **and** held as the `PLATFORM_PAYEE_VPA` secret |

### Publish path — REVISED 5 September (B18)

| Item | Value |
|---|---|
| **Frontend entry** | `src/pages/Finalize.tsx` → `handlePublish` → **step 1** `functions.invoke('finalize')` → **step 2** `rpc('publish_tournament', { tournament_id, requested_slug: null })` |
| **Unpublish callers** | `PublishSuccess.tsx` (organizer) and `AdminTournaments.tsx` (master, since G2). Both call `unpublish_tournament(uuid)` |
| `publish_tournament(uuid, text)` | One overload. **Exact signature `tournament_id uuid, requested_slug text DEFAULT NULL::text`** — the DEFAULT is load-bearing; `CREATE OR REPLACE` without it fails `42P13`. SECURITY DEFINER, `SET search_path = public`, owner `postgres`, RETURNS TABLE(slug text, version integer, request_id uuid). Auth: `v_owner_id = v_uid OR has_role(v_uid,'master')`. Enforces the B22 **title gate**. **Since B18 also records `allocation_version`.** Validates neither dates nor allocations |
| **Slug precedence (B22)** | `COALESCE(NULLIF(requested_slug,''), <existing slug UNLESS it matches `^untitled-tournament(-N)?$`>, regexp title)`. **Any other existing slug still wins, deliberately** — regenerating on every republish would break every shared link (harness T7 is the negative control) |
| **`publications.allocation_version` (B18-a)** | The allocation version this publication displays. Set from `MAX(allocations.version)` at publish time. **NULL means the tournament was published before it had any allocations** — the page then shows details and no winners until a later publish pins one |
| **`get_public_tournament_results(uuid)`** | SECURITY DEFINER, **language `sql`**, 15-column TABLE. Gates on `tournaments.is_published`, then reads the ACTIVE publication's `allocation_version`. **NO `MAX()` FALLBACK — deliberately.** A `COALESCE(pin, MAX(...))` reopens B18-a |
| **Client-side read path (B18-b)** | `/p/:slug` (`PublicTournamentDetails`) and `/t/:id/public` (`PublicWinnersPage`) do NOT use the RPC. They go through `useFinalPrizeData` → `getLatestAllocations`, which takes an `AllocationVersionSelector`: `{mode:'latest'}` (organizer default) · `{mode:'pinned', version}` · `{mode:'unresolved'}`. Public pages read the pin via `usePublishedAllocationVersion` and pass `pinned`. **Three modes exist so `undefined` ("use latest") can never be confused with `null` ("pinned to nothing")** |
| **Organizer surfaces keep `latest`** | `Finalize`, `FinalPrizeView`, `ArbiterSheetView`, `useFinalizeData` were not edited; they inherit `{mode:'latest'}` from the default parameter |
| `unpublish_tournament(uuid)` | Correct and always was. Clears `publications.is_active`, sets `is_published=false` AND `status='draft'` in one transaction. Idempotent |
| **`publications` triggers** | `trg_enforce_team_snapshots_on_publications` **[BEFORE INSERT OR UPDATE OF is_active, version]** and `trg_guard_publication_requires_team_snapshots` **[BEFORE UPDATE OF is_active]**. Both are **column-scoped**: an `allocation_version`-only write fires neither. Proven, not assumed — see CC9. Both block activating a publication when the tournament has active `institution_prize_groups` but no `team_allocations`. **See B21 — this is a one-way door** |
| **`allocations` FKs** | `prize_id → prizes ON DELETE CASCADE` · `player_id → players ON DELETE CASCADE` · `tournament_id → tournaments ON DELETE CASCADE`. **3 cascades; the first two rewrite published history. This is B18-c, still open** |
| **Public RLS — re-keyed by G1** | `allocations.public_read_published_allocations`, `prizes.public_read_published_prizes`, `publications.public_read_active_publications`, `tournaments.anyone_read_published_tournaments` — all four role **PUBLIC**, all key off **`tournaments.is_published`**. `players.anon_read_published_players` was already correct and is the reference shape |
| **`publications` write surface** | `anon` AND `authenticated` hold **full INSERT/UPDATE/DELETE**, and `org_publications_access` is `FOR ALL` scoped owner-or-master. **An organizer can rewrite their own pin directly.** Not privilege escalation — they can already republish — but B18 delivers stability against accidental drift, **not tamper-proofing**. Do not describe published results as "immutable" |
| **Public route split** | `/p/:slug` is the real public page. `/t/:id/public` → `LegacyPublicRouteCompat`, which redirects when a slug exists and otherwise renders `PublicWinnersPage` |
| **`is_master` has only a zero-arg overload** | `is_master(uuid)` does not exist. `detect_missing_team_snapshots()` calls `public.is_master(auth.uid())` and raises `42883` every call. This is the `/admin/team-snapshots` failure |

### Email infrastructure (migrated 29 August 2026)

Custom SMTP via Resend. Host `smtp.resend.com`, port `465`, user `resend`, password = `RESEND_API_KEY`, sender `noreply@prize-manager.com`. Edge-function sender `WELCOME_EMAIL_FROM` = `hello@prize-manager.com`. Domain verified. Auth limits: emails 100/h, 60 s per user, sign-ups/sign-ins 30/5min. `RESEND_API_KEY` rotated 29 Aug; old key still live pending B15. **Edge-function secrets are runtime env vars — rotating one needs no redeploy.**

### Migrations (all applied, repaired, version-matched)

`20260817120000` F2-A · `20260817130000` F2-B · `20260817140000` F2-D · `20260817150000` F2-E · `20260817160000` F2-G · `20260822120000` drop dead referrals trigger · `20260827120000` F3-A · `20260827130000` F3-B · `20260828120000` F3-C0 · `20260828130000` F3-C0b · `20260829120000` SEC `extraction_review_queue` · `20260902120000` G1 publish-state reconcile · `20260904120000` B22 publish title gate · **`20260905120000` B18-a version pin**.

**G2, G3, G3b and B18-b were frontend only.**

---

## 3. Non-negotiable guardrails

**Phase 1:**
1. NEVER touch the allocation engine — allocations, `rule_config`, conflicts, player-to-prize matching — unless Tushar explicitly names it. Lives in `supabase/functions/allocatePrizes`, `allocateInstitutionPrizes`, `backfillTeamAllocations`. The frontend invokes it **by string name**; never alter an invoke name or payload. **Tushar authorised altering RLS policies ON the allocations table for G1 on 2 Sep; that authorisation does not extend further. TWO OPEN SCOPE QUESTIONS, both owed before the Team Championship work: (a) does `supabase/functions/finalize` fall inside this guardrail — it writes `allocations` rows but computes nothing; (b) may Team Championship Mode A write `team_allocations`, and is `backfillTeamAllocations` in scope?**
2. `criteria_json` committed as always `'{}'`.
3. Never weaken grounding or arithmetic. Never weaken checks to force a pass.
4. Client never writes production tables; only `commit-extraction` does, on explicit Approve.
5. No paid services, no new dependencies without justification.
6. Sequential phases, one prompt at a time, max 3–4 deploy cycles then stop and report.
7. Builder/auditor split: Claude Code builds; Claude (chat) verifies via Supabase SQL before advancing.

**Phase 2A:** 8. Auto-approval is CONDITIONAL, server-side, gated on **named invariant verdicts** (D28); **`skipped` is not `pass`** (D39). 9. NEVER use `commit-extraction` for payment data. 10. NEVER modify `review_tournament_payment`'s entitlement-insert logic. 11. Screenshot upload is OPTIONAL; **no screenshot can never auto-approve**. 12. NEVER expose the kill switch in frontend code or logs.

**Master / admin / auth:** M1–M5. **Phase 2A-2:** N1–N5. **Phase 2A-3:** P1–P6. **F0d:** Q1–Q7. **UI:** U1–U5. **F1:** R1–R7. **Client write-grant audit:** S1–S8. **PF1:** T1–T6. **F2:** V1–V8. **Referrals:** W1–W4. **F3:** X1–X9. **F3-C:** X7–X9. **Security and ops:** Y1–Y5. **Testing and state ownership:** Z1–Z4. **Investigation and version semantics:** AA1–AA5. **Documentation and verification:** BB1–BB5. (See prior PROJECT_STATE for full text; unchanged.)

> **Naming note:** the F3 guardrails X1–X9 predate the exposure items labelled X1–X4. The exposure items are written as **X1-exposure … X4-exposure**. All four are CLOSED.

**Publish-state and audit — CC1–CC8 (2–4 September):** unchanged, see prior PROJECT_STATE. Summary: CC1 read the triggers on the table a function writes · CC2 a defect's name can encode a wrong cause · CC3 enumerate every policy on every related table · CC4 a check that can never read CLOSED is not a measurement · CC5 placeholder rows travel · CC6 a green check on an unchanged file looks identical to a green check on a correct one (+ amendment: `diff --stat` is blind to NEW files, use `git status --short` or `git add -A` then `diff --cached --stat`) · CC7 a harness's execution order can be load-bearing · CC8 dry-run the fix, not just the migration.

**B18 — CC9–CC12 (5 September 2026):**

**CC9. A column-scoped trigger is a claim until you watch the guard fire.** The B18 backfill writes `publications.allocation_version` on 35 active rows. Both triggers on that table are `UPDATE OF is_active[, version]`, so neither should fire — but "should" is CC1's exact trap. The proof was a **matched pair on the same row**: an `is_active` update on `74e1bd2b`'s publication was **observed rejecting** with *"Cannot publish: missing team snapshots"*, and then the `allocation_version`-only write on that same row succeeded. Harness case P16 keeps that pair honest, and it deliberately picks a publication whose guard **can** fire — using the local fixture would have made the control unfalsifiable (CC4).

**CC10. `prosrc` includes comments, so a literal-match guard can read its own documentation.** The B18 migration failed its own post-check on the first live run. The check looked for `MAX(a.version)` in `get_public_tournament_results` to confirm the defect was gone. The new function contains no such code — but its explanatory comment says *"there is deliberately no fallback to MAX(a.version)"*, and `prosrc` returns comments. **The correct fix is to strengthen the guard, not delete the explanation:** `regexp_replace(prosrc, '--[^\n]*', '', 'g')` before matching. Control-tested both ways — a comment-only mention no longer matches, a real `COALESCE` fallback still does. Note `publish_tournament` legitimately contains `MAX(a.version)`, so this guard stays scoped to the reader.

**CC11. Dry-run the artifact you are shipping, not a compacted copy of it.** CC10 was avoidable. The pre-flight dry runs used a stripped-down function body with the comments removed, so the guard passed in the dry run and failed on the real file. **The dry run must execute the exact text of the file being applied.** Same family as D41: verify the artifact, not your model of it.

**CC12. Structure survives a bad measurement; absolute values do not.** During B18 verification, a checksum of a live page's output disagreed with a value captured minutes earlier, at an identical row count — the exact signature of silent content change. It was not: the ad-hoc checksum instrument behaved differently across transaction contexts. **The relationships were stable throughout** (v8 = v9, v7 differs, before and after). The resolution was to stop comparing to a remembered number and instead **reconstruct the old logic and diff it against the new, live, across all 35 published tournaments** — result 0 rows lost, 0 gained, 35/35 identical. **When a measurement disagrees with a stored value, re-derive the comparison rather than trusting either number.**

**Phase 2B:** 13. Bank statements are `privacy_class='sensitive'`. NEVER through Gemini. pdfplumber only.

---

## 4–12.14. Phases 1 through 4 September — COMPLETE

See prior PROJECT_STATE for full detail on Phase 1, Phase 2A, Workstream C, Phase 2A-2, F0a–F0e, F1, the E1–E3 audit, PF1, **F2 (live 20 Aug)**, the **referrals repair (22 Aug)**, **production validation (25–26 Aug)**, **F3-A/B/C0/C0b/C1 (28 Aug)**, **B13 #0 + `extraction_review_queue` + Resend SMTP (29 Aug)**, **F3-C2 batch A (30–31 Aug)**, **the B16 investigation (31 Aug)**, **batch F1 + the backlog sweeps (1 Sep, §12.11)**, **G1/G2/G3/G3b (2 Sep, §12.12)**, and **B22 + GTM1 + sportup corrections (3–4 Sep, §12.14)**.

Governing decisions unchanged: **D38, D39, D40, D41, X1–X9, Y1, Z1–Z4, AA1–AA5, BB1–BB5, CC1–CC8**.

---

## 12.15 · 5 September 2026 — B18 shipped, published results are version-pinned

### The defect

`get_public_tournament_results` selected `MAX(allocations.version)` with no join to `publications`. Any new allocation version silently became the public page. **Confirmed live on 3 Sep**, not theorised: retitling `16b9cf29` created allocation v7 from a page load, and the public page followed it.

**The scope was wider than §13 recorded.** The RPC is not the only public read path. `/p/:slug` (`PublicTournamentDetails`) and `/t/:id/public` (`PublicWinnersPage`) resolve the version **client-side** through `getLatestAllocations`, using `.order('version', desc).limit(1)` over PostgREST. A backend-only fix would have left the primary public page following MAX. B18 therefore had two halves.

### B18-a — backend. Migration `20260905120000`, commit `2f3528b`

1. `publications.allocation_version integer` (nullable).
2. Backfilled all 35 active publications with their current `MAX(allocations.version)`.
3. `publish_tournament` records the pin at insert. Signature and B22 title gate unchanged.
4. `get_public_tournament_results` reads the pin. **No `MAX()` fallback.**

**The backfill was safe because measured, not assumed.** 9 of 35 active publications had already drifted past the version they were published at. For all 8 with a comparable baseline, the `(prize_id, player_id)` set of the published version and the current version is **identical** — zero symmetric difference, identical row counts. The allocation engine is deterministic, so re-runs reproduce byte-identically when nothing upstream changed. Pinning to current MAX froze exactly what was already on screen.

### B18-b — frontend. Commit `988403d`

`getLatestAllocations` gained an `AllocationVersionSelector` with three modes. `useFinalPrizeData` forwards it **and includes it in the react-query key** — without that, a cached organizer result gets served to a public page, or one version's rows survive a repin. New hook `usePublishedAllocationVersion` reads `publications.allocation_version` (already anon-readable via `public_read_active_publications`; no policy change). The two public pages pass `pinned`; the four organizer consumers were not edited and inherit `latest`.

`src/integrations/supabase/types.ts` got three hand-added lines for the new column. **`supabase gen types` was deliberately NOT run** — a full regeneration drags in unrelated drift from the 8 untracked functions.

**A D32 defect was caught in review before publish.** If the pin lookup **errors**, `isPending` goes false and `data` is undefined, so `allocationVersion` collapses to `null` and the page renders "No published results yet." — a tournament with 180 winners would tell visitors there are none. Fixed by returning `isVersionError`, holding the selector at `unresolved` on error, and rendering an explicit error state. **Absence of a value is not evidence the value is null** — same family as D21, D32, D40.

### Verification

- **`b18_version_pin_checks.sql` 16/16.** The load-bearing pair is P6/P7: P6 creates a NEW content-different allocation version behind a published page and asserts the page does not move; P7 repins to that version and asserts it does. P5 asserts the positive side is non-zero so neither can pass on an empty reader. **Comparison is by content checksum, not row count** — the fixture versions have identical counts and different winners, exactly like live tournament `3ac176a1` whose v7 and v8 both return 41 rows with different names.
- **`b22_publish_gate_checks.sql` 14/14**, including T7, the negative control that a normal slug survives a republish. **`g1_publish_state_checks.sql` 16/16.**
- **Zero regression, measured directly:** the pre-migration `MAX`-based logic was reconstructed and diffed against the live function across all 35 published tournaments — 35/35 row counts match, 35/35 content identical, 0 rows lost, 0 gained.
- **Three-way live confirmation** on `51f0b22e` (shahgfaruqui, a real customer): pin = 2, `MAX` = 2, rows at pin = 28, RPC = 28, **rendered page = 28** (10 + 3 + 3 + 3 + 3 + 3 + 3).
- Publish confirmed by the bundle's `__vite__mapDeps` listing `assets/usePublishedAllocationVersion-BOqEGwdO.js`.

### Decisions recorded

**Option C — a NULL pin shows nothing; publishing with zero allocations is NOT blocked.** The alternative was refusing to publish until allocations exist. **Rejected on measurement:** 20 of 95 publications ever, and **4 of 39 since June**, were made with zero allocations at publish time — all by customers, with allocations arriving 12 minutes to 5 hours later. Blocking would reject a real customer action at roughly 1 in 10, and `/p/:slug` is a tournament *details* page that legitimately works before results exist. It would also have broken every positive case in `b22_publish_gate_checks.sql`, whose fixtures carry no allocations — forcing fixture surgery on a passing harness. The flow self-heals: `Finalize.handlePublish` already runs finalize then publish, so the organizer's next publish pins it.

**"Immutable" is the wrong word.** See the `publications` write-surface row in §2. B18 delivers stability against accidental drift, not tamper-proofing.

**`detect_missing_team_snapshots` deferred to B7.** Its `a.version = p.version` join is wrong — measured: wrong for **24 of 35** active publications, accidentally right for 11. B18-a's new column is the correct right-hand side, so a real fix now exists. But the function also raises `42883` on every call for want of `is_master(uuid)`, so fixing only the join leaves it broken. Fold both into B7.

### Sweeps, commit `1e0dada`

Three checks added, all reading CLOSED: **B22a** (no published tournament carries a stub-derived `public_slug`), **B22b** (no active publication carries one — the slug lives in two tables and a check on one alone reads CLOSED while the other is dirty), and **B22g** (repo: `Dashboard.tsx` still contains the literal `'Untitled Tournament'`, which `publish_tournament`'s gate matches exactly and which silently stops firing if the string changes). **Reference the literal, not a line number** — it moved from 176 to 175 the same day.

**DB sweep 12 OPEN / 11 CLOSED / 1 INFO of 24. Repo sweep 7 OPEN / 4 CLOSED of 11.**

### Stub dates — investigated and CLOSED as not actionable

An attempt to promote stub dates to Tier 1 was made and **withdrawn on measurement**. 24 of 35 published tournaments have `start_date` equal to their creation date — but **20 of those were published the same day**, which is an arbiter creating the event at the venue and publishing that evening. The date is correct. A narrower "3 are wrong" claim was then also over-stated: publishing 5–9 days late means slow finalisation, not a wrong event date.

**The honest finding is that the data cannot answer it.** There is no field-level history anywhere: the only trigger on `tournaments` is `update_tournaments_updated_at`, and `audit_events` holds just runtime errors and rollout flags (61 rows). All 35 published rows show `updated_at > created_at`, which proves something was edited, never that `start_date` was. **Stays Tier 2. The only worthwhile action is the forward fix — stop defaulting new tournaments to today's date — which is G4.**

---

## 13. Immediate next step

**Team Championship product.** Fresh chat. **Owner decision 5 Sep: this comes BEFORE the GTM pages**, because the feature contains a permanent-failure mode and GTM is what would put customers into it.

**Open with the sweeps, then a live audit. Do not plan from this document alone (BB1).**

### Why it goes first

- **B21 is a one-way door.** A tournament with active `institution_prize_groups` and zero `team_allocations` can never be published — both `publications` triggers block activation on UPDATE as well as INSERT. Today 2 tournaments, both Tushar's, so no customer exposure. GTM changes that.
- **The diagnostic for it is dead.** `/admin/team-snapshots` raises `42883` on every call.
- **Its join is wrong** — `a.version = p.version`, wrong for 24 of 35.
- **The team-tie guard was never built** — inert code removed in F1, nothing replaced it.

### The product spec, in the owner's words (5 Sep)

Two ways, both required:

**Mode A — automatic.** The organizer uploads the Swiss Manager Excel file (or whatever rule they use to differentiate school/institution). They define the team composition: number of players and gender make-up — 4 boys, or 4 girls, or 2+2, or any combination. The system **automatically chooses each school's team members by highest points/rank** among eligible players, then ranks the teams.

**Mode B — manual.** The organizer finalises the number of players and the gender composition if applicable. Then, **for each school, all eligible players are listed and the organizer selects the team from a dropdown**, school by school. The system then sums the selected players' scores.

### Owed before any design

1. **Guardrail 1 ruling (a):** may Mode A write `team_allocations`? Auto-selecting players by points to produce a ranked result is selection logic sitting immediately beside the allocation engine.
2. **Guardrail 1 ruling (b):** is `supabase/functions/backfillTeamAllocations` in scope?
3. **Guardrail 1 ruling (c), carried over:** does `supabase/functions/finalize` fall inside guardrail 1?

### Surfaces to audit

`src/components/team-prizes/` (`useTeamPrizeResults.ts`, `useInstitutionPrizes.ts`) · `src/pages/admin/AdminTeamSnapshots.tsx` · `src/pages/TournamentSetup.tsx` · `src/utils/prizeApplyDraft.ts` · edge functions `publicTeamPrizes`, `allocateInstitutionPrizes`, `backfillTeamAllocations` · tables `institution_prize_groups`, `team_allocations` · tests `tests/institution/`.

**Operational hold:** do not open `/t/8d1fbd83-…/finalize`. Auto-finalize fires on page load and creates new allocation versions. **B18 makes this harmless to public pages** — the pin no longer moves — but it still creates junk versions, so the hold stands until B18-3.

**Opening line for the next chat:**

> *Continue the Prize Manager project. Read PROJECT_STATE.md §12.15, §13, §14 and §15. `main` is `1e0dada`. **B18-a and B18-b both shipped 5 Sep and are verified three ways on a live customer page** — published results are now version-pinned and Tier 1 is clear. Baselines: tsc **12 errors in 6 files** (per-file in §2), vitest **479 passed / 3 known failures of 482**, **8 harnesses**, DB sweep **12 OPEN / 11 CLOSED / 1 INFO of 24**, repo sweep **7 OPEN / 4 CLOSED of 11**.*
>
> *Next: **Team Championship**, ahead of GTM by owner decision. Two modes are specified in §13 — automatic selection by points, and manual per-school selection from a dropdown.*
>
> ***Three guardrail-1 rulings are owed before any design*** *— see §13. Do not write code until they are settled.*
>
> ***B21 is a one-way door in exactly this feature*** *and `/admin/team-snapshots` cannot diagnose it (`42883`, missing `is_master(uuid)`).*
>
> *Run `supabase db query --linked -f supabase/ops/backlog_sweep.sql` and `bash scripts/backlog_sweep_repo.sh` first, paste both outputs, then **audit the team surfaces live** before showing me a plan. Never chain tsc with `&&`.*

---

## 14. Backlog — the GTM gate

**The bar is not "clear everything."** The bar is: does it make a public statement false, produce wrong participant-facing output, or embarrass us at the National Championship.

### Tier 1 — CLEAR as of 5 September

| Item | Status |
|---|---|
| **X1–X4-exposure** — unpublish/archive did not unpublish | ✅ CLOSED 2 Sep, G1+G2 |
| **GTM1** — published tournament titled "Untitled Tournament" | ✅ CLOSED 3–4 Sep |
| **B22** — stub titles and sticky stub slugs | ✅ CLOSED 4 Sep |
| **sportup.online claims** — FIDE line, player count, ToS processors | ✅ CLOSED 3 Sep |
| **B18-a / B18-b** — published results are not immutable | ✅ **CLOSED 5 Sep** — pinned, 16/16, zero regression across 35 |

**New Tier 1, opened 5 September from the site inventories — see §15:**

| Item | Why it gates GTM |
|---|---|
| **SP-1 `/debug/auth` is an ungated public route on sportup.online** | Live exposure. **Do not wait for GTM** |
| **SP-2 Contradictory refund policies** — Help says 100% / 20% late fee, Terms says 100% / 50% | Two different refund promises on one site that takes money |
| **SP-3 False payment claims** — Landing and Help advertise Credit Card and Net Banking and "automatically confirmed"; Terms correctly says no cards are processed and proof upload is required | Same class as the FIDE claim already removed |
| **SP-4/5/6/7** — refunds "to original payment method in 5–10 business days" (impossible for manual UPI) · Help says 5–7 days vs Terms 5–10 · "excluding platform service fees" for a fee never charged · Privacy reads *"We use manual payment for payment processing"* (garbled find/replace leftover) | Public statements that are false |
| **PM-1 prize-manager.com has NO legal pages at all** — no Terms, Privacy, Refund, Contact, About or FAQ, while taking UPI money | The most exposed of the three |

### Tier 2 — before the National Championship, not before the pages

- **G4 — required details before publish**, including not defaulting `start_date` to today. **Do this before marketing brings new organizers into the stub flow.**
- **B21 — publish one-way door.** Needs a sweep check (BB5) and a warning in the archive dialog. Folded into the Team Championship work.
- **B7** drift migration — 8 untracked functions; `anon` EXECUTE on `admin_create_coupon`, `admin_list_coupons`, `redeem_coupon_for_tournament`, `bootstrap_master`; **`is_master(uuid)` missing**; and `detect_missing_team_snapshots`'s `a.version = p.version` join, now fixable via `publications.allocation_version`.
- **Stub dates** — forward fix only; the existing set is not diagnosable (§12.15).
- **B22 slug-change UI** — needs a redirect story before it is built.
- **Column-level UPDATE on `tournaments`** — revoke `is_published`/`status`/`public_slug` from `authenticated`. Blocked on auditing `TournamentSetup.tsx:723`.
- **Column-level write surface on `publications`** — both client roles hold full DML. Same shape as the above.
- **B13 batch B** (#1 toast, #2 `/account` dead end, #5 screenshot copy); **batch C** (#3 spent coupons); **#9** `PublishSuccess.tsx`; **#7** clipping.
- **B17 + B8b** — 10 MB cap forces lossy compression; compressed vs uncompressed disagree on category naming. Fixture suite first; judge against expected output, never flag count (D41).
- **B5** — audit cadence. Count is 0 today, the easiest moment to forget it.
- **B19** — one unexplained `finalize` 500. Possibly dissolved by B18.
- **B18-c** — the `ON DELETE CASCADE` into published history. Own decision; deferred. Sweep reads OPEN with value 3, correctly.
- **B18-3** — the auto-finalize `useEffect`. Needs guardrail-1 ruling (c).

### Tier 3 — rides as debt, stated openly

**PublicWinnersPage shows "0 Winners" badges above the error alert when the pin lookup fails** (cosmetic, error path only) · **the 3 known test failures are probably one timezone bug** (§2) · **a `401` on `/rest/v1/players` appears in the public page console** — `safeSelectPlayers` capability probe, recovers immediately, pre-existing · no test covers `ColumnFilter` (G3) · no test covers the B18 selector modes · B1 · Y2 · B10 · B12 · B14 · B15 · B2 · B3 · B6 · layout regression test (Playwright is a new dependency) · `CLAUDE.md` schema drift · `MAX_ATTEMPTS=5` with no backoff · `brew unlink node` fragility · `tsconfig.app.json` scope gap · `.claude/settings.local.json` wildcard rule.

---

## 15. Cross-property GTM inventory (5 September 2026)

Taken via Lovable plan-mode, read-only, on both sites.

### certificate-hub.com

Terms and Privacy exist with real content dated 4 Sep 2026. **No money statements appear anywhere on public pages**, so the paywall is not live yet. No dead links.

| Item | Action |
|---|---|
| No legal entity, registered address, or governing-law clause | Lawyer |
| No Refund/Cancellation policy | **Required the day the paywall goes live**, not before |
| Referrals promise "points" and "unlock rewards", type and value undefined | Define or soften |
| No `sitemap.xml`; `robots.txt` has no `Sitemap:` line | SEO before GTM |
| No About, FAQ, or Pricing page; `/contact` redirects to a support form | Owner-written |

### sportup.online

See Tier 1 SP-1 … SP-7 above. Additionally: Privacy "Last Updated: October 24, 2023" while Terms says 3 Sep 2026; Terms footer "© 2023"; WhatsApp support link with no business number bound; no `sitemap.xml`; no `Sitemap:` line in `robots.txt`. Meta-tag and sitemap pass was approved 4 Sep but **not yet published** — when it ships, verify Lovable's claim that removing `og:image` is safe (hosting allegedly injects one), and note `/tournaments/:id` pages were excluded from the sitemap, which is where the SEO value is.

### The common item — one engagement, not three

All three properties lack a named legal entity, registered address and governing-law clause, and all three need refund terms that match a manual UPI flow. **Brief one professional covering prize-manager, sportup and certificate-hub together.** Do NOT have Lovable or any model draft the legal copy — sportup's Terms already had to be corrected for naming Stripe/PayPal on a product that takes UPI, and the garbled "manual payment for payment processing" line is the visible scar of that fix. FAQ and About are owner-written and carry no legal exposure.

### Analytics — decided 5 September

**PostHog, not GA4.** The questions that matter are product questions — where organizers drop out of brochure → allocate → finalize → publish — and GA4 answers acquisition questions poorly suited to that. Session replay will also show the B13 UI defects instead of us guessing.

Three conditions:
1. **Install AFTER the privacy work, not before.** Adding third-party tracking while sportup's Privacy Policy is dated 2023 and garbled turns a documentation gap into a compliance one. India's DPDP Act 2023 applies.
2. **Load by snippet, not npm** — keeps `package.json` untouched and guardrail 5 clean.
3. **Do not replace what exists.** `audit_events` and the martech dashboards stay the source of truth for money and entitlements; PostHog is for behavioural funnels only.

Separate projects per property, one account.

---

## 16. Ordering

**Team Championship** → SP-1 (`/debug/auth`, immediately, out of band) → legal engagement + FAQ/About drafting (parallel, no repo access) → sportup copy fixes SP-2…SP-7 → sitemaps → G4 required-fields → PostHog → **GTM pages** → Tier 2 → Phase 2B.

certificate-hub.com integration parked by owner decision 2 Sep.

---

## 17. Phase 2B / 2C-D / 3 / 4 — unchanged

---

## 18. Tracked debt

Superseded by §14's three-tier gate. The sweeps are the canonical *measurement*. Where this document and a sweep disagree, **the sweep wins and the document gets corrected** (BB1).

---

## 19. How to start each new chat

**One chat per workstream.** At every phase boundary: Claude gives an updated `PROJECT_STATE.md` → delete the old one in the Project knowledge panel → upload the new one → open a fresh chat → paste the opening line.

**Division of labour:** design, schema audit and independent verification belong in **chat**; write-run-fix loops on SQL and TypeScript belong in **Claude Code**.

**The backlog loop:**
1. **Run both sweeps at the start of every session**, before planning anything.
2. **Where a verdict contradicts this document, correct the document first** (BB1).
3. **After shipping, re-run.** The item must flip to CLOSED.
4. **UNMEASURED is never CLOSED.**
5. **Every new backlog item gets a check the day it is filed** (BB5), and that check must have a reachable CLOSED state (CC4).

**Working rules that do not change:**
- `git config --global core.editor "true"` is set. Still prefer `git merge --no-ff -m "…"`.
- Always `/clear` in Claude Code before a new prompt — **and verify it took.**
- **First command in any new Terminal window is `cd ~/Desktop/prize-manager`.**
- **`npm run dev` reads and writes the live database. Check which account you are signed in as.**
- **Never chain `npx tsc … && npx vitest run`.** tsc exits non-zero on the 12 known errors and silently skips vitest. Use `;` or run separately.
- Edge-function changes need `supabase functions deploy <name>`. **Confirm the bundle changed, not the version number** (Y3).
- **`supabase functions logs` does not exist.** Dashboard only, 1-day retention.
- **A new database function also needs `notify pgrst, 'reload schema'`** (T6) — and so does a new COLUMN the frontend will select.
- **Publishing is separate from merging.** A database-only migration is live the moment `supabase db query` runs; a `src/` change is not live until Lovable publishes.
- Use `git --no-pager diff`, never plain `git diff`. After merging, re-run tsc **and** vitest on `main`.
- Paste terminal output as **text**, never screenshots.
- **A build report is a claim, not evidence. Require the full `git --no-pager diff`** — and remember it is **blind to NEW files**. Use `git add -A` then `git --no-pager diff --cached` (CC6 amendment).
- Use `cp "$(ls -t ~/Downloads/<name>*.ext | head -1)" <dest>` then `grep -c` for a token you know is in the new file.
- Migration workflow: `supabase db query --linked -f <file>` then `supabase migration repair --status applied <version>`. `supabase db execute` does not exist.
- **`RAISE NOTICE` is swallowed.** Put failures in `RAISE EXCEPTION`. **`RAISE` uses `%`, not `%s`.** `format()` uses `%s`. Mixing them prints "16s passed".
- **Every migration must self-verify and fail loudly**, in one transaction, opening with a pre-flight that asserts the audited state. **It works** — B18's post-check refused a bad guard and rolled back cleanly with nothing applied.
- **Dry-run a migration by executing its body and force-aborting**, then verify production is untouched. **Dry-run the exact file text, not a compacted copy** (CC11).
- **Reproducing a signature before `CREATE OR REPLACE`:** check `pg_get_function_arguments`, not just the name. A missing `DEFAULT` fails `42P13`.
- **Prove the fix with a test that can only pass if the fix works.** Prefer *matched pairs*, **assert the positive side is non-zero**, and **compare content checksums, not row counts** — two allocation versions can differ entirely at an identical count.
- **Verify a guard fails on the broken input before trusting it** (D35).
- **Read the triggers on any table a function writes to** (CC1) — **and watch the guard actually fire** (CC9).
- **Read the drifted rows before naming the cause** (CC2).
- **Enumerate every policy on every related table, then control-test each** (CC3).
- **Ask what a new check's CLOSED state looks like, and whether the fix dissolves its own probe** (CC4).
- **A grant is not an exposure until a real read returns rows — and it is one once it does** (BB4).
- **An effect that writes on mount makes visiting a page a mutation** (AA5).
- **Never let an error handler discard the input that caused the error** (W4).
- **Absence of a value is not evidence the value is null.** A failed query must render an explicit state (D32).
- **Never redirect a generator onto a tracked file** (R7). Temp file → verify → `cp`.
- Additive migration → verify → frontend → verify → restrictive migration. Never the reverse.
- **Do not fix what measurement says is not broken.** Record it as drift and move on (W3).
- **When a new finding arrives mid-workstream, log it and finish the batch.**
- **Reference literals, not line numbers, in any check or document** — `Dashboard.tsx`'s stub literal moved from line 176 to 175 within a single day.
