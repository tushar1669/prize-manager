# PROJECT_STATE — Prize Manager · Universal Extraction Engine
**Last updated:** 1 September 2026 · **Owner:** Tushar · **This file is the single source of truth for continuing work in any new chat.**

Replace the previous PROJECT_STATE.md in the repo with this file. Paste it at the start of every new chat to re-establish context.

---

## 1. What this project is

**Prize Manager** (prize-manager.com) is a chess tournament management platform. Phase 1 built a brochure extraction engine: organizer uploads a PDF brochure → two-pass Gemini OCR + structured extraction + deterministic trust/grounding layer → review screen → on Approve, a tournament is created with categories and prizes.

**Phase 2** extends the same engine into a Universal Extraction Engine serving three platforms and eventually external developers. The engine is doc-type-driven; adding a document type requires a new schema row and new trust invariants, not a new pipeline.

**Three-platform context:**
- **prize-manager.com** — Tournament prize management (live). Phase 2A/2A-2/2A-3 added payment screenshot verification, the full payment lifecycle, UTR trust hardening, the profile prerequisite, **conditional auto-approval (live 20 August 2026)**, the auto-approval oversight loop (F3-A/B/C, 28 August), B13 #0 plus the `extraction_review_queue` security fix and the Resend SMTP migration (29 August), F3-C2 batch A (30–31 August), the B16 investigation which closed B16 and opened B18 (31 August), and now **batch F1 plus the backlog verification sweeps, which uncovered X1/X2/X3 (1 September)**.
- **certificate-hub.com** — Certificate creation, paywalled. Will consume the engine via REST API (Phase 2C).
- **sportup.online** — Discovery + tournament management. Will consume via REST API (Phase 2C).

---

## 2. Key identifiers

| Item | Value |
|---|---|
| Supabase project | `nvjjifnzwrueutbirpde` (ap-south-1, Postgres 17.6). Org is on the **FREE** plan |
| Repo | github.com/tushar1669/prize-manager (**public**) · `main` at **`6020d65`** (ops sweeps commit) · **last app-code commit `22aa425`** (batch F1 merge) · batch F1 commits `52f0386` (B13 #8) and `0b741f6` (B20) · prior: `42d920f` F3-C2 batch A · `1f732be` / `1b87962` batch A · `5004462` SEC migration · `8aa3056` B13 #0 · `302732f` F3-C1 · `3aed330` F3-C0 · `2d47197` F3-B · `96555f7` F3-A · `1ee42db` referrals repair · `a5bebf8` F2. **`PROJECT_STATE.md` lives at the repo root only** |
| **Edge functions** | `extract` **v48**, sha `704f5074…` · `send-payment-notifications` **v9**, sha `ccf8c3be…`, `verify_jwt=false` · `commit-extraction` **v14**, sha `a4507fc1…` · `sendWelcomeOnboardingEmail` **v21** · `allocatePrizes` v368 · `finalize` v355 · `generatePdf` v353 · `parseWorkbook` v341 · `allocateInstitutionPrizes` v251 · `publicTeamPrizes` v240 · `pmPing` v238 · `backfillTeamAllocations` v38. **Untouched on 29 Aug – 1 Sep** |
| **Version-vs-hash rule (Y3)** | A version bump is not evidence of a deploy; the `ezbr_sha256` is |
| **Free-plan log retention** | **1 day.** Edge-function logs older than ~24h are gone |
| Active extraction schema | v5 (chess_brochure), v3 (payment_screenshot, id `4e8beb4d-4a07-4ef8-a774-18b22f722522`) |
| Gemini model | `GEMINI_MODEL` = `gemini-3.1-flash-lite` |
| Local paths | repo `~/Desktop/prize-manager`, test PDFs `~/Desktop/prize-manager/test-brochures/` |
| Payment trust invariants | 8 in `extract/paymentTrustCheck.ts` · returns `{flags, verdicts}` |
| Checker version | `PAYMENT_CHECKER_VERSION = 1`; the RPC gate pins the literal `1` |
| **F2 kill switch** | `platform_feature_flags` — row `key='payment_auto_approve'`, `enabled = true` since 2026-08-20 17:26:33 UTC. RLS on, zero policies. Off switch: `supabase/ops/f2_auto_approve_off.sql` |
| **F3 oversight objects** | `payment_auto_approval_audit` · `record_auto_approval_audit(uuid,text,text,text)` · `revoke_auto_entitlement(uuid,text)` · `list_auto_approvals()`. RLS on, zero policies, zero client table grants, `anon` no EXECUTE |
| **RPC error tokens** | Six only: `not_master`, `reason_required`, `not_an_auto_approval`, `invalid_outcome`, `invalid_action_taken`, `payment_not_found` |
| **`public.referrals` triggers** | **ZERO, by design, since `20260822120000`.** Do not re-add one — see W1 |
| Test baseline | **476 passing / 3 known failures** (conflict-utils ×2, martech-metrics ×1) of 479 |
| TypeScript check | `npx tsc -p tsconfig.app.json --noEmit` — **12 errors in 6 files**. **Per-file baseline:** `src/components/master/PendingPaymentsPanel.tsx` 5 · `src/pages/TournamentUpgrade.tsx` 2 · `src/components/import-brochure/BrochureImportDialog.tsx` 2 · `src/pages/BrochureReview.tsx` 1 · `src/pages/admin/AdminPayments.tsx` 1 · `src/hooks/useAuth.tsx` 1. **`AutoApprovedPanel.tsx` and `Finalize.tsx` have zero and must keep zero.** Root `npx tsc --noEmit` and `npm run typecheck` check **nothing** |
| pg_cron jobs | jobid 1 `expire-stuck-extraction-documents` (*/10); jobid 2 `drain-payment-notifications` (*/2) |
| Claim RPC | **5-arg only**, `RETURNS uuid`, 1 overload, **15 `RAISE EXCEPTION` across 11 codes** |
| Backstop index | `uq_tournament_payments_utr_active` — UNIQUE on `normalize_utr(utr)` WHERE `status <> 'rejected'` |
| **Brochure upload cap** | `storage.buckets.file_size_limit = 10485760` (10 MB) on `extraction-uploads`. See B17 |
| Verification harnesses | `f2_gate_checks.sql` 24/24 · `f3_audit_checks.sql` 33/33 · `f3c_read_checks.sql` 13/13 · `f0d_rpc_checks.sql` 17/17 · `pf1b_expected_amount.sql` 9/9. **No harness covers the publish path — see B18** |
| **Backlog sweeps (new 1 Sep)** | `supabase/ops/backlog_sweep.sql` (21 checks, self-aborting, read-only) · `scripts/backlog_sweep_repo.sh` (10 checks + tsc baseline). **Run both before planning anything** |
| Operational scripts | `f2_auto_approve_on.sql` · `f2_auto_approve_off.sql` · `f2_auto_approval_report.sql` · the two sweeps. **Not migrations** |
| Design doc | `docs/design/UI_CONVENTIONS.md` — dark-only, enforced by `tests/ui-conventions.spec.ts` |
| **Live census (verified 1 Sep)** | 43 auth users · **133 tournaments, 36 published** · **43 active publications** · **7 tournaments where `is_published` disagrees with an active publication row** · 12 payments · 12 entitlements · 12 outbox rows all sent · 8 verdict rows · 1 audit row · 6 referrals · 5 referral_rewards |
| Platform payee VPA | `9559161414-5@ybl` — hardcoded as `UPI_ID` in `TournamentUpgrade.tsx` **and** held as the `PLATFORM_PAYEE_VPA` secret |

### Publish path

| Item | Value |
|---|---|
| **Frontend entry** | `src/pages/Finalize.tsx` → `handlePublish` → **step 1** `functions.invoke('finalize')` → **step 2** `rpc('publish_tournament')`. The only two callers of the publish RPCs are `Finalize.tsx` (publish) and `PublishSuccess.tsx` (unpublish) |
| `publish_tournament(uuid, text)` | **One overload.** SECURITY DEFINER, owner `postgres`. `authenticated` holds EXECUTE, `anon` does not. Auth check `v_owner_id = v_uid OR has_role(v_uid,'master')`. Deactivates prior publications, computes `max(publications.version)+1`, inserts, then sets `tournaments.is_published/public_slug/status` |
| **`publications` columns** | `id, tournament_id, version, slug, published_by, published_at, is_active, request_id`. **No `created_at`, no `allocation_version`** |
| **`get_public_tournament_results(uuid)`** | SECURITY DEFINER. Gates on `tournaments.is_published = true`, selects **`MAX(allocations.version)`**, **never joins `publications`**. This is B18 |
| **`allocations` FKs** | `prize_id → prizes ON DELETE CASCADE` · `player_id → players ON DELETE CASCADE` · `tournament_id → tournaments ON DELETE CASCADE`. **3 cascades; the first two rewrite published history** |
| RLS on `allocations` | `org_allocations_access` FOR ALL to owner/master · `anon_read_published_allocations` (gates on `tournaments.is_published`) · **`public_read_published_allocations` — no role restriction, so it reaches `anon`, and it gates on `EXISTS(publications WHERE is_active)`. This is X2** |
| `anon` table grants | SELECT **true** on `allocations`, `publications`, `prizes`; SELECT **false** on `players` |
| **Public route split** | `/p/:slug` is the real public page. `/t/:id/public` → `LegacyPublicRouteCompat`, a shim that redirects to `/p/{slug}` when a `published_tournaments` row exists and otherwise renders the legacy `PublicWinnersPage` |
| **`is_master` has only a zero-arg overload** | `is_master(uuid)` does not exist. `detect_missing_team_snapshots()` calls `public.is_master(auth.uid())` and raises `42883` every call. This is the `/admin/team-snapshots` failure |

### Email infrastructure (migrated 29 August 2026)

Custom SMTP via Resend. Host `smtp.resend.com`, port `465`, user `resend`, password = `RESEND_API_KEY`, sender `noreply@prize-manager.com`. Edge-function sender `WELCOME_EMAIL_FROM` = `hello@prize-manager.com`. Domain `prize-manager.com` verified. Auth limits: emails 100/h, 60 s per user, sign-ups/sign-ins 30/5min. `RESEND_API_KEY` rotated 29 Aug; old key still live pending B15. **Edge-function secrets are runtime env vars — rotating one needs no redeploy.**

### Migrations (all applied, repaired, version-matched)

`20260817120000` F2-A verdicts table · `20260817130000` F2-B `auto_upi` · `20260817140000` F2-D outbox action · `20260817150000` F2-E flag · `20260817160000` F2-G gate · `20260822120000` drop dead referrals trigger · `20260827120000` F3-A · `20260827130000` F3-B · `20260828120000` F3-C0 · `20260828130000` F3-C0b · `20260829120000` SEC `extraction_review_queue`.

**No migration was written on 30, 31 August or 1 September.** Batch F1 was frontend only; the sweeps are ops scripts, not migrations.

---

## 3. Non-negotiable guardrails

**Phase 1:**
1. NEVER touch the allocation engine — allocations, `rule_config`, conflicts, player-to-prize matching — unless Tushar explicitly names it. Lives in `supabase/functions/allocatePrizes`, `allocateInstitutionPrizes`, `backfillTeamAllocations`. The frontend invokes it **by string name**; never alter an invoke name or payload. **Open scope question, must be settled before B18 phase 3: does `supabase/functions/finalize` fall inside this guardrail? It writes `allocations` rows but computes nothing.**
2. `criteria_json` committed as always `'{}'`.
3. Never weaken grounding or arithmetic. Never weaken checks to force a pass.
4. Client never writes production tables; only `commit-extraction` does, on explicit Approve.
5. No paid services, no new dependencies without justification.
6. Sequential phases, one prompt at a time, max 3–4 deploy cycles then stop and report.
7. Builder/auditor split: Claude Code builds; Claude (chat) verifies via Supabase SQL before advancing.

**Phase 2A:** 8. Auto-approval is CONDITIONAL, server-side, gated on **named invariant verdicts** (D28); **`skipped` is not `pass`** (D39). 9. NEVER use `commit-extraction` for payment data. 10. NEVER modify `review_tournament_payment`'s entitlement-insert logic. 11. Screenshot upload is OPTIONAL; **no screenshot can never auto-approve**. 12. NEVER expose the kill switch in frontend code or logs.

**Master / admin / auth:** M1–M5. **Phase 2A-2:** N1–N5. **Phase 2A-3:** P1–P6. **F0d:** Q1–Q7. **UI:** U1–U5. **F1:** R1–R7. **Client write-grant audit:** S1–S8. **PF1:** T1–T6. **F2:** V1–V8. **Referrals:** W1–W4. **F3:** X1–X6. **F3-C:** X7–X9. **Security and ops:** Y1–Y5. **Testing and state ownership:** Z1–Z4. **Investigation and version semantics:** AA1–AA5. (See prior PROJECT_STATE for full text; unchanged.)

> **Naming note:** the F3 guardrails X1–X9 predate the new exposure items also labelled X1/X2/X3 in §12.11. Where ambiguous, the exposure items are written as **X1-exposure / X2-exposure / X3-exposure**.

**Documentation and verification — BB1–BB5 (1 September 2026):**

**BB1. A claim in PROJECT_STATE is a prior, not a measurement. Verify it before it becomes a build instruction.** Three claims in this document were wrong on 31 August, and two of them reached a build prompt before anyone checked:
- §14 "`hasPendingTeamTies`'s setter is called nowhere in `src/`" — **false.** It was passed to `<TeamPrizesTabView onPendingTiesChange={…}>`, which fires it in an effect.
- §12.10 "the mid-page button reaches the silent early return of B20" — **false.** `NoAllocationGuard` returns before either button renders.
- §12.10 "zero active `institution_prize_groups`" — true of the two tournaments in the B16 investigation, **not of the database**, which has 3 rows across 2 tournaments.

The builder caught the first one, not the auditor. That is the wrong way round for this project's division of labour.

**BB2. A checker that is right by accident is not a checker.** The repo sweep's first version used `grep -c … || echo 0`. `grep -c` prints `0` *and* exits 1 on no match, so `count` became `"0\n0"` and `[[ -gt ]]` threw. Bash took the `else` branch, which happened to produce the correct verdict for all three broken checks. It would have kept being "right" until the day a real defect made `else` wrong, and then it would have reported CLOSED on a live defect. **Build a truth table and watch every branch fire.** Same family as D35.

**BB3. Two flags for one state will disagree, and the security boundary reads only one of them.** `tournaments.is_published` and `publications.is_active` disagree on 7 rows. `public_read_published_allocations` keys off the second. Before adding a second boolean for one concept, ask which one RLS reads.

**BB4. A grant is not an exposure until a real read returns rows — and it is one once it does.** `anon` holding SELECT on `allocations` proves nothing by itself. The control test does: as `anon` against an unpublished tournament, `allocations=444 prizes=148 players=0`.

**BB5. An item with no check in the sweep is a rumour.** Every new backlog entry gets a check the day it is filed.

**Phase 2B:** 13. Bank statements are `privacy_class='sensitive'`. NEVER through Gemini. pdfplumber only.

---

## 4–12.10. Phases 1 through 31 August — COMPLETE

See prior PROJECT_STATE for full detail on: Phase 1, Phase 2A, Workstream C, Phase 2A-2, F0a–F0e, F1, the E1–E3 client write-grant audit, PF1, **F2 (live 20 Aug)**, the **referrals repair (22 Aug)**, **end-to-end production validation (25–26 Aug)**, **F3-A / F3-B / F3-C0 / F3-C0b / F3-C1 (28 Aug)**, **B13 #0 + `extraction_review_queue` + Resend SMTP (29 Aug)**, **F3-C2 batch A (30–31 Aug)**, and **the B16 investigation, which closed B16 as a transport failure and opened B18 (31 Aug, §12.10)**.

Governing decisions unchanged: **D38, D39, D40, D41, X1–X9, Y1, Z1–Z4, AA1–AA5**.

---

## 12.11 · 1 September 2026 — batch F1 shipped, backlog swept, X-exposure found

### Batch F1 — SHIPPED. `main` at `22aa425`, then `6020d65` for the sweeps.

One file, `src/pages/Finalize.tsx`, two commits. tsc held at 12 with the per-file baseline byte-identical; vitest held at 476/3; `Finalize.tsx` still zero.

**`52f0386` — B13 #8.** Mid-page publish CTA card deleted. Bottom bar is now the single publish surface, labelled by state: "Publish Tournament" when unpublished, "Update Published Results" when published. One helper line naming the `/p/` target. Secondary "View public page" text link, rendered **only** when `is_published === true` **and** a slug exists, pointing at `/p/{public_slug}`. `is_published` and `public_slug` added to the `finalize-summary` select. Badge renamed to `Allocation v{n}`; `publishVersion` renamed `allocationVersion`. Dead `hasPendingTeamTies` state and its `onPendingTiesChange` wiring removed. Legacy `/t/:id/public` navigation removed.

**`0b741f6` — B20.** Both silent early returns in `handlePublish` now write `audit_events` with distinct greppable types, `publish_blocked_no_winners` (warn) and `publish_blocked_missing_id` (error), each carrying a reference id shared with the toast.

**Verified against live data, not screenshots.** All seven behaviours confirmed across three tournaments and two accounts. The decisive one was the negative control: `7473c371…` carries a `public_slug` **and** an active publication row while `is_published = false`, and the link correctly did not render. That proved the gate is on `is_published`, not on the slug. Independently re-verified on `origin/main`: six new markers present once each, five removed strings absent.

**Session HAR was clean** — 127 entries, all 200, zero `Authorization` headers. That is the control the B16 transport verdict lacked: the failing session had 22 network-layer errors, this one had none.

### The team-tie guard, corrected

It **was** wired, contradicting §14. `TeamPrizesTabView.tsx:38` fires `onPendingTiesChange` in an effect. But `<TabsContent value="v5">` has no `forceMount` and `activeView` defaults to `'v1'`, so Radix never mounted the component until the organizer clicked the Team Prizes tab. It armed only after that click, latched `true` with no cleanup, and is live-relevant on **2 of 133 tournaments** (*Road To GCL — Shining Stars: Varanasi Edition*, published; *Second Jaipur Open Classical 2025*, draft). Decision #7's premise was wrong; its conclusion survives on the measured behaviour. The inert code is gone. **The guard itself still needs designing**, and `forceMount` is not the answer without first checking what `useTeamPrizeResults` writes on mount (AA5).

### B18-b, now demonstrated rather than deduced

Auto-finalize fired on **every** page load during testing: `1b5e8bc5` v8→v9→v10 across two visits, `7473c371` v5→v6, `8d1fbd83` v8→v9. Three of those four involved no publish click. `8d1fbd83` v9 has the same 61 rows as v8, so nothing participants see changed, and it was republished afterwards as publication v6. **The operational hold on `/t/8d1fbd83-…/finalize` stands until B18 ships.**

### X-exposure — NEW, HIGH. Unpublish does not unpublish.

`publications.is_active` is not cleared when a tournament is unpublished.

- **X1-exposure** — 7 tournaments have `is_published = false` with an active publication row.
- **X2-exposure** — `public_read_published_allocations` on `allocations` carries **no role restriction**, so it reaches `anon`, and its `USING` clause is `EXISTS (SELECT 1 FROM publications p WHERE p.tournament_id = allocations.tournament_id AND p.is_active)`. RLS policies are OR'd, so this bypasses the `is_published` gate on the sibling policy. **2,625 allocation rows across those 7 tournaments are reachable by this path alone.**
- **X3-exposure** — `anon` holds SELECT on `allocations`, `publications` and `prizes`.

**Control test, run as `anon` against `34f8cdf1…` (`is_published = false`):** `allocations = 444`, `prizes = 148`, `players = 0`. Prize structure and the winner mapping by UUID are readable by an unauthenticated caller after the organizer took the tournament offline. **Player names are not exposed** — the `players` grant is closed. Bounded, no PII, but live.

**This blocks the GTM pages, not merely the security backlog.** A privacy policy or consent flow stating that organizers control result visibility cannot be written while this is true. It also constrains B18: pointing `get_public_tournament_results` at the active publication, which is the current plan, would resurrect all seven pages. **The reconciliation must land first.**

### B13 #9 — NEW. `PublishSuccess.tsx` asserts success it never checked.

`const [isPublished, setIsPublished] = useState(true)` — the page assumes published on mount, and the public URL falls back to `${origin}/t/${id}/public` when the slug query has not resolved. Confirmed against the database: it printed "Tournament Published! Your prize allocations are now live" for a tournament with `is_published = false`, no slug and zero publications. Console log shows the URL alternating between `/p/brochure-parsing-trial` and the legacy shape. Same family as D21, D32, AA2.

### Backlog sweeps built and committed (`6020d65`)

`supabase/ops/backlog_sweep.sql` — 21 checks, self-aborting `DO` block, read-only, every key initialised to `UNMEASURED` and overwritten only when its check runs. Includes the `anon` control test. First run: **18 OPEN, 2 CLOSED, 0 UNMEASURED**.

`scripts/backlog_sweep_repo.sh` — 10 grep checks plus the per-file tsc baseline. First clean run: **7 OPEN, 3 CLOSED, 0 UNMEASURED**. Names three things it *cannot* measure, so its silence is never read as a pass.

### Also settled

- `.claude/settings.local.json` holds a permission rule auto-approving `sed` against **`tsconfig.app.json`** with no prompt. That file is the foundation of every measurement here; narrowing its `include` makes tsc go green while checking less. Wildcard-before-arguments rules need tightening repo-wide.
- A second `finalize` non-2xx was produced and fully explained (wrong account, RLS-blocked read). It has the same generic `internal_server_error` shape as B19, so **B19 may have an authorization cause rather than the FK cause currently hypothesised.**
- B5 measured **0** unaudited auto-approvals; B14 measured **0** unsent outbox rows. Both CLOSED by measurement.

---

## 13. Immediate next step

**Batch G1 — unpublish must actually unpublish.** Fresh chat, new branch off `main` at `6020d65`. **Backend only.**

Scope:
1. Clear `publications.is_active` when a tournament is unpublished, in whatever RPC `PublishSuccess.tsx` calls.
2. Backfill the 7 drifted rows.
3. Close the `anon` read path on `allocations` — either drop `public_read_published_allocations` in favour of the `is_published`-gated sibling, or restrict its roles and rewrite its `USING` clause. **Decide which after reading both policies live; do not assume the sibling covers every legitimate reader.**
4. Harness with a **matched pair**: one unpublished tournament must return zero rows to `anon`, one published tournament must still return its rows. Case 1 alone would pass against a broken fixture.

**Audit before code.** Run both sweeps first. X1/X2/X3-exposure must still read OPEN, and after the fix they must read CLOSED. Re-verify the tsc and vitest baselines by running them.

**Opening line for the next chat:**

> *Continue the Prize Manager project. Read PROJECT_STATE.md §12.11, §13 and §14. Batch F1 shipped 1 Sep (`22aa425`); the backlog sweeps are committed (`6020d65`) and are the first thing to run. Baselines: tsc **12 errors in 6 files** (per-file breakdown in §2), vitest **476 passed / 3 known failures**. Next: **batch G1 — unpublish must actually unpublish (X1/X2/X3-exposure)**, backend only, matched-pair harness required. **Do not open `/t/8d1fbd83-…/finalize`** — operational hold in §12.10. Run `supabase db query --linked -f supabase/ops/backlog_sweep.sql` and `bash scripts/backlog_sweep_repo.sh` first, paste both outputs, then show me the plan before writing any migration.*

**After G1: B18 phases (a)+(b).** Add `allocation_version integer` to `publications`; `publish_tournament` records `max(allocations.version)` at insert; `get_public_tournament_results` reads the active publication's `allocation_version` and falls back to `MAX()` when NULL; fix `detect_missing_team_snapshots`'s `a.version = p.version` join. Needs its own harness.

**Two decisions owed before B18:**
- Backfill the 43 active publications with their current `MAX(allocations.version)`, freezing them immediately? Recommended yes.
- Does `supabase/functions/finalize` fall inside guardrail 1?

---

## 14. Backlog — the GTM gate

**The bar is not "clear everything."** Roughly thirty entries exist and several are permanently deprioritised. The bar is: does it make a public statement false, produce wrong participant-facing output, or embarrass us at the National Championship.

### Tier 1 — must close before any marketing page is written

| Item | Status | Why it gates GTM |
|---|---|---|
| **X1/X2/X3-exposure** — unpublish does not unpublish | **OPEN, HIGH, batch G1** | A privacy policy claiming organizers control visibility is false while this holds |
| **B18-a / B18-b** — published results are not immutable | **OPEN, HIGH** | Marketing drives traffic to `/p/` pages that follow `MAX(allocations.version)` and change when an editor page is opened |
| **GTM1** — 1 of 36 published tournaments is titled "Untitled Tournament" | **OPEN** | Visible on the public surface being marketed |
| **sportup.online claims** — "Official FIDE Partner" without verified written authorisation; player-count figure inconsistent with verified data; ToS dated October 2023 naming the wrong payment processors; sitemap 404 | **OPEN, owner verification** | Legal and trust exposure the moment traffic arrives. Cannot be measured from the Prize Manager repo |

### Tier 2 — before the National Championship, not before the pages

- **B7** drift migration — 8 untracked functions; `anon` EXECUTE on `admin_create_coupon`, `admin_list_coupons`, `redeem_coupon_for_tournament` and **`bootstrap_master`**; `is_master(uuid)` missing, which is the `/admin/team-snapshots` `42883`. Read-only audit first.
- **B13 batch B** (#1 toast, #2 `/account` dead end, #5 screenshot copy) in `TournamentUpgrade.tsx`; **batch C** (#3 spent coupons) in `Account.tsx`; **#9** in `PublishSuccess.tsx`; **#7** clipping, still unmeasured.
- **B17 + B8b** — the 10 MB cap forces lossy compression, and compressed vs uncompressed runs disagree on category naming. Build the fixture suite first; judge against expected output, never flag count (D41).
- **B5** — audit cadence. Count is 0 today, the easiest moment to forget it.
- **Publish-path harness** — five harnesses exist and none touches `publish_tournament`.
- **Team-tie guard design** — the inert code is gone; the guard is not built.
- **B19** — one unexplained `finalize` 500. Free-plan logs expire in 1 day; likely dissolved by B18, possibly authorization-caused.
- **B18-c** — the `ON DELETE CASCADE` into published history. Needs its own decision; deferred.

### Tier 3 — rides as debt, stated openly

B1 (`authenticated` holds full DML on `coupons`/`coupon_redemptions`; control-tested non-exploitable, every write policy master-only) · Y2 (`anon` write grants on `extraction_review_queue`, control-tested inert) · B10 (2 dangling referral rows) · B12 · B14 (Resend reports accepted, not delivered — 0 unsent today) · B15 (old API key still live) · B2 · B3 · B6 · layout regression test (Playwright is a new dependency, guardrail 5) · `CLAUDE.md` schema drift · `MAX_ATTEMPTS=5` with no backoff · `brew unlink node` fragility · `tsconfig.app.json` scope gap · `.claude/settings.local.json` wildcard rule · accepted residuals (advisory duplicate check fails open; consistent-but-wrong UTR; UTR-only valve; 3 referrals lost 12 May – 22 Aug; blank historical review notes).

**B4 — delete this entry.** "Eight hardcoded in the oversight email" has been deprioritised six times. Either it gets done in the next batch that touches that file, or it stops occupying a line.

### Closed by measurement on 1 September

| Item | Verdict |
|---|---|
| B16 organizer publish failure | CLOSED 31 Aug — transport, reproduced ×3, clean-session HAR now provides the control |
| B13 #8 two publish buttons | CLOSED — batch F1 |
| B20 silent failure paths | CLOSED — batch F1 |
| B5 unaudited auto-approvals | **0**, CLOSED by sweep |
| B14 unsent outbox rows | **0**, CLOSED by sweep |

---

## 15–18. Phase 2B / 2C-D / 3 / 4 — unchanged

Phase 2B (bank statement reconciliation) blocked on 2A-3, which is complete. Phase 2C-D (REST API + MCP) blocked on 2B.

**Ordering (revised 1 Sep):** G1 → B18 (a)+(b) → GTM pages → Tier 2 → Phase 2B.

---

## 19. Tracked debt

Superseded by §14's three-tier gate, which is now the canonical list. The sweeps are the canonical *measurement*: `supabase/ops/backlog_sweep.sql` and `scripts/backlog_sweep_repo.sh`. Where this document and a sweep disagree, **the sweep wins and the document gets corrected** (BB1).

---

## 20. How to start each new chat

**One chat per workstream.** At every phase boundary: Claude gives an updated `PROJECT_STATE.md` → delete the old one in the Project knowledge panel → upload the new one → open a fresh chat → paste the opening line.

**Division of labour:** design, schema audit and independent verification belong in **chat**; write-run-fix loops on SQL and TypeScript belong in **Claude Code**. **Guardrail 6 matters more with Claude Code, not less.**

**The backlog loop (new 1 Sep):**
1. **Run both sweeps at the start of every session**, before planning anything.
2. **Where a verdict contradicts this document, correct the document first** (BB1).
3. **After shipping, re-run.** The item must flip to CLOSED. If it does not, the fix did not work, whatever the build report said.
4. **UNMEASURED is never CLOSED.** Both sweeps initialise every key to UNMEASURED. Same discipline as D39.
5. **Every new backlog item gets a check the day it is filed** (BB5).

**Working rules that do not change:**
- Always `/clear` in Claude Code before a new prompt — **and verify it took.**
- **First command in any new Terminal window is `cd ~/Desktop/prize-manager`.**
- **`npm run dev` is a local server only**, but it reads and writes the **live** database. **Check which account you are signed in as before testing** — RLS will make someone else's tournament look empty or broken, not forbidden.
- Edge-function changes need `supabase functions deploy <name>`. **Confirm the bundle hash changed, not the version number** (Y3).
- **`supabase functions logs` does not exist.** Dashboard only, 1-day retention.
- **A new database function also needs `notify pgrst, 'reload schema'`** (T6).
- **Publishing is separate from merging.** A database-only migration is live the moment `supabase db query` runs.
- Use `git --no-pager diff`, never plain `git diff`. Merge with `--no-ff`. Before merging, `git --no-pager diff --name-only main...<branch>`. After merging, re-run tsc and vitest on `main`.
- Paste terminal output as **text**, never screenshots.
- **A build report is a claim, not evidence. Require the full `git --no-pager diff`.**
- **Paste one command per line and wait for each.**
- Before starting a branch: `git status` must be clean.
- Migration workflow: `supabase db query --linked -f <file>` then `supabase migration repair --status applied <version>`. `supabase db execute` does not exist.
- **`RAISE NOTICE` is swallowed.** Put failures in `RAISE EXCEPTION`.
- **Every migration must self-verify and fail loudly**, in one transaction, opening with a pre-flight that asserts the audited state.
- **Write guard assertions from the measured baseline, not an expected constant** (Z2).
- **Prove the fix with a test that can only pass if the fix works.** Prefer *matched pairs*.
- **A negative result needs a control that can produce a positive**; a suspect eliminated without a control is not eliminated (AA1).
- **A rolled-back self-aborting `DO` block can test a live RPC as any user.** Set `request.jwt.claims` including `email`, `SET LOCAL ROLE`, run, then `RAISE EXCEPTION` to unwind. **Verify the rollback afterwards.**
- **Every user-reachable failure branch must write something durable, and the writer must not depend on the thing that failed** (AA2).
- **A measurement that returns exactly its own cap has told you nothing.** Root `npx tsc --noEmit` returning zero errors is the canonical example: it checks nothing.
- **Measure the artifact, not a proxy for it.** Count the credentials in the HAR before warning about them.
- **A checker that is right by accident is not a checker** (BB2). Build a truth table; watch every branch fire.
- **Two flags for one state will disagree; ask which one RLS reads** (BB3).
- **A grant is not an exposure until a real read returns rows — and it is one once it does** (BB4).
- **Before trusting a version number, find the code that reads it** (AA3).
- **Before adding `ON DELETE CASCADE`, ask whether the child table is history** (AA4).
- **An effect that writes on mount makes visiting a page a mutation** (AA5).
- **When dropping a column, grep every trigger body on that table first** (D40).
- **A write path with no successful writes for a month is a bug until proven otherwise** (D40).
- **Never let an error handler discard the input that caused the error** (W4).
- **Never redirect a generator onto a tracked file** (R7). Temp file → verify → `cp`.
- **Diff a rewritten function body against the live one before applying.**
- Additive migration → verify → frontend → verify → restrictive migration. Never the reverse.
- **Do not fix what measurement says is not broken.** Record it as drift and move on (W3).
- **When a new finding arrives mid-workstream, log it and finish the batch.** B18, B19, B20 and B13 #8 all surfaced during the B16 investigation and none was chased; B13 #9 and X1/X2/X3 surfaced during batch F1 and none was chased. That is why both closed cleanly.
