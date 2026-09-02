# PROJECT_STATE — Prize Manager · Universal Extraction Engine
**Last updated:** 2 September 2026 · **Owner:** Tushar · **This file is the single source of truth for continuing work in any new chat.**

Replace the previous PROJECT_STATE.md in the repo with this file. Paste it at the start of every new chat to re-establish context.

---

## 1. What this project is

**Prize Manager** (prize-manager.com) is a chess tournament management platform. Phase 1 built a brochure extraction engine: organizer uploads a PDF brochure → two-pass Gemini OCR + structured extraction + deterministic trust/grounding layer → review screen → on Approve, a tournament is created with categories and prizes.

**Phase 2** extends the same engine into a Universal Extraction Engine serving three platforms and eventually external developers. The engine is doc-type-driven; adding a document type requires a new schema row and new trust invariants, not a new pipeline.

**Three-platform context:**
- **prize-manager.com** — Tournament prize management (live). Phase 2A/2A-2/2A-3 added payment screenshot verification, the full payment lifecycle, UTR trust hardening, the profile prerequisite, **conditional auto-approval (live 20 August 2026)**, the auto-approval oversight loop (F3-A/B/C, 28 August), B13 #0 plus the `extraction_review_queue` security fix and the Resend SMTP migration (29 August), F3-C2 batch A (30–31 August), the B16 investigation which closed B16 and opened B18 (31 August), batch F1 plus the backlog sweeps which uncovered X1/X2/X3 (1 September), and now **batch G1 and G2, which closed the X-exposure entirely (2 September)**.
- **certificate-hub.com** — Certificate creation, paywalled. Will consume the engine via REST API (Phase 2C). **Parked by owner decision 2 Sep** pending a seamless prize-manager → certificate-hub handoff.
- **sportup.online** — Discovery + tournament management. Will consume via REST API (Phase 2C).

---

## 2. Key identifiers

| Item | Value |
|---|---|
| Supabase project | `nvjjifnzwrueutbirpde` (ap-south-1, Postgres 17.6). Org is on the **FREE** plan |
| Repo | github.com/tushar1669/prize-manager (**public**) · `main` at **`e207f41`** (G3b merge) · `dcb8274` G3 merge · `9f59c51` PROJECT_STATE · `0ccfdcd` G2 merge · `44c289b` G1 merge · prior: `2c72a0b` docs · `6020d65` sweeps · `22aa425` batch F1 · `42d920f` F3-C2 batch A · `a5bebf8` F2. **`PROJECT_STATE.md` lives at the repo root only** |
| **Edge functions** | `extract` **v48** · `send-payment-notifications` **v9**, `verify_jwt=false` · `commit-extraction` **v14** · `sendWelcomeOnboardingEmail` **v21** · `allocatePrizes` v368 · `finalize` v355 · `generatePdf` v353 · `parseWorkbook` v341 · `allocateInstitutionPrizes` v251 · `publicTeamPrizes` v240 · `pmPing` v238 · `backfillTeamAllocations` v38. **Untouched 29 Aug – 2 Sep** |
| **Version-vs-hash rule (Y3)** | A version bump is not evidence of a deploy; the `ezbr_sha256` is |
| **Free-plan log retention** | **1 day.** Edge-function logs older than ~24h are gone |
| Active extraction schema | v5 (chess_brochure), v3 (payment_screenshot, id `4e8beb4d-4a07-4ef8-a774-18b22f722522`) |
| Gemini model | `GEMINI_MODEL` = `gemini-3.1-flash-lite` |
| Local paths | repo `~/Desktop/prize-manager`, test PDFs `~/Desktop/prize-manager/test-brochures/` |
| Payment trust invariants | 8 in `extract/paymentTrustCheck.ts` · returns `{flags, verdicts}` |
| Checker version | `PAYMENT_CHECKER_VERSION = 1`; the RPC gate pins the literal `1` |
| **F2 kill switch** | `platform_feature_flags` — row `key='payment_auto_approve'`, `enabled = true` since 2026-08-20 17:26:33 UTC. RLS on, zero policies. Off switch: `supabase/ops/f2_auto_approve_off.sql` |
| **F3 oversight objects** | `payment_auto_approval_audit` · `record_auto_approval_audit` · `revoke_auto_entitlement` · `list_auto_approvals()`. RLS on, zero policies, zero client table grants, `anon` no EXECUTE |
| **`public.referrals` triggers** | **ZERO, by design, since `20260822120000`.** Do not re-add one — see W1 |
| Test baseline | **479 passing / 3 known failures** (conflict-utils ×2, martech-metrics ×1) of **482**. Was 476/479 before G2 added 3 guard assertions |
| TypeScript check | `npx tsc -p tsconfig.app.json --noEmit` — **12 errors in 6 files**. **Per-file baseline:** `PendingPaymentsPanel.tsx` 5 · `TournamentUpgrade.tsx` 2 · `BrochureImportDialog.tsx` 2 · `BrochureReview.tsx` 1 · `AdminPayments.tsx` 1 · `useAuth.tsx` 1. **`AutoApprovedPanel.tsx`, `Finalize.tsx`, `AdminTournaments.tsx` and `admin/ColumnFilter.tsx` have zero and must keep zero.** Root `npx tsc --noEmit` and `npm run typecheck` check **nothing** |
| pg_cron jobs | jobid 1 `expire-stuck-extraction-documents` (*/10); jobid 2 `drain-payment-notifications` (*/2) |
| Claim RPC | **5-arg only**, `RETURNS uuid`, 1 overload, **15 `RAISE EXCEPTION` across 11 codes** |
| Backstop index | `uq_tournament_payments_utr_active` — UNIQUE on `normalize_utr(utr)` WHERE `status <> 'rejected'` |
| **Brochure upload cap** | `storage.buckets.file_size_limit = 10485760` (10 MB) on `extraction-uploads`. See B17 |
| Verification harnesses | `f2_gate_checks.sql` 24/24 · `f3_audit_checks.sql` 33/33 · `f3c_read_checks.sql` 13/13 · `f0d_rpc_checks.sql` 17/17 · `pf1b_expected_amount.sql` 9/9 · **`g1_publish_state_checks.sql` 16/16 (new 2 Sep)**. **No harness covers `publish_tournament` — see B18** |
| **Backlog sweeps** | `supabase/ops/backlog_sweep.sql` (**22 checks** after the G1 X3 respec + X4 addition) · `scripts/backlog_sweep_repo.sh` (10 checks + tsc baseline). **Run both before planning anything** |
| Operational scripts | `f2_auto_approve_on.sql` · `f2_auto_approve_off.sql` · `f2_auto_approval_report.sql` · the two sweeps. **Not migrations** |
| Design doc | `docs/design/UI_CONVENTIONS.md` — dark-only, enforced by `tests/ui-conventions.spec.ts` |
| **Live census (verified 2 Sep, post-G2)** | 43 auth users · **133 tournaments, 35 published** · **35 active publications** · **0 drifted** · 32 archived · 23 soft-deleted · 12 payments · 6 referrals · 5 referral_rewards · 1 audit row |
| Platform payee VPA | `9559161414-5@ybl` — hardcoded as `UPI_ID` in `TournamentUpgrade.tsx` **and** held as the `PLATFORM_PAYEE_VPA` secret |

### Publish path — REVISED 2 September

| Item | Value |
|---|---|
| **Frontend entry** | `src/pages/Finalize.tsx` → `handlePublish` → **step 1** `functions.invoke('finalize')` → **step 2** `rpc('publish_tournament', { tournament_id, requested_slug: null })` |
| **Unpublish callers** | `PublishSuccess.tsx` (organizer) **and `AdminTournaments.tsx` (master, since G2)**. Both call `unpublish_tournament(uuid)` |
| `publish_tournament(uuid, text)` | One overload, SECURITY DEFINER, owner `postgres`. Auth: `v_owner_id = v_uid OR has_role(v_uid,'master')`. **Validates NOTHING else — no title, no dates, no allocations.** Deactivates prior publications, computes `max(version)+1`, inserts, sets `is_published/public_slug/status='published'` |
| **Slug precedence (B22)** | `COALESCE(NULLIF(requested_slug,''), NULLIF(existing public_slug,''), slugify(title))`. **The existing slug wins over the title**, and `Finalize.tsx:367` always passes `requested_slug: null`. **Renaming a tournament never changes its public URL.** No UI exposes a slug change |
| `unpublish_tournament(uuid)` | **Correct and always was.** Clears `publications.is_active`, sets `is_published=false` AND `status='draft'` in one transaction. Idempotent |
| **`publications` triggers** | `trg_enforce_team_snapshots_on_publications` [INSERT, UPDATE] and `trg_guard_publication_requires_team_snapshots` [UPDATE]. Both block activating a publication when the tournament has active `institution_prize_groups` but no `team_allocations` at that version. **See B21 — this is a one-way door** |
| **`get_public_tournament_results(uuid)`** | SECURITY DEFINER. Gates on `tournaments.is_published = true`, selects **`MAX(allocations.version)`**, **never joins `publications`**. This is B18 |
| **`allocations` FKs** | `prize_id → prizes ON DELETE CASCADE` · `player_id → players ON DELETE CASCADE` · `tournament_id → tournaments ON DELETE CASCADE`. **3 cascades; the first two rewrite published history** |
| **Public RLS — re-keyed by G1** | `allocations.public_read_published_allocations`, `prizes.public_read_published_prizes`, `publications.public_read_active_publications`, `tournaments.anyone_read_published_tournaments` — all four are role **PUBLIC** and now key off **`tournaments.is_published`**. `players.anon_read_published_players` was already correct and is the reference shape |
| `anon` table grants | SELECT true on `allocations`, `publications`, `prizes`; SELECT false on `players`. **Grants are not the exposure (BB4)** |
| **Public route split** | `/p/:slug` is the real public page. `/t/:id/public` → `LegacyPublicRouteCompat` shim |
| **`is_master` has only a zero-arg overload** | `is_master(uuid)` does not exist. `detect_missing_team_snapshots()` calls `public.is_master(auth.uid())` and raises `42883` every call. This is the `/admin/team-snapshots` failure |

### Email infrastructure (migrated 29 August 2026)

Custom SMTP via Resend. Host `smtp.resend.com`, port `465`, user `resend`, password = `RESEND_API_KEY`, sender `noreply@prize-manager.com`. Edge-function sender `WELCOME_EMAIL_FROM` = `hello@prize-manager.com`. Domain verified. Auth limits: emails 100/h, 60 s per user, sign-ups/sign-ins 30/5min. `RESEND_API_KEY` rotated 29 Aug; old key still live pending B15. **Edge-function secrets are runtime env vars — rotating one needs no redeploy.**

### Migrations (all applied, repaired, version-matched)

`20260817120000` F2-A · `20260817130000` F2-B · `20260817140000` F2-D · `20260817150000` F2-E · `20260817160000` F2-G · `20260822120000` drop dead referrals trigger · `20260827120000` F3-A · `20260827130000` F3-B · `20260828120000` F3-C0 · `20260828130000` F3-C0b · `20260829120000` SEC `extraction_review_queue` · **`20260902120000` G1 publish-state reconcile**.

**G2 was frontend only. No migration on 30, 31 August or 1 September.**

---

## 3. Non-negotiable guardrails

**Phase 1:**
1. NEVER touch the allocation engine — allocations, `rule_config`, conflicts, player-to-prize matching — unless Tushar explicitly names it. Lives in `supabase/functions/allocatePrizes`, `allocateInstitutionPrizes`, `backfillTeamAllocations`. The frontend invokes it **by string name**; never alter an invoke name or payload. **Tushar explicitly authorised altering RLS policies ON the allocations table for G1 on 2 Sep; that authorisation does not extend further. Open scope question, must be settled before B18 phase 3: does `supabase/functions/finalize` fall inside this guardrail? It writes `allocations` rows but computes nothing.**
2. `criteria_json` committed as always `'{}'`.
3. Never weaken grounding or arithmetic. Never weaken checks to force a pass.
4. Client never writes production tables; only `commit-extraction` does, on explicit Approve.
5. No paid services, no new dependencies without justification.
6. Sequential phases, one prompt at a time, max 3–4 deploy cycles then stop and report.
7. Builder/auditor split: Claude Code builds; Claude (chat) verifies via Supabase SQL before advancing.

**Phase 2A:** 8. Auto-approval is CONDITIONAL, server-side, gated on **named invariant verdicts** (D28); **`skipped` is not `pass`** (D39). 9. NEVER use `commit-extraction` for payment data. 10. NEVER modify `review_tournament_payment`'s entitlement-insert logic. 11. Screenshot upload is OPTIONAL; **no screenshot can never auto-approve**. 12. NEVER expose the kill switch in frontend code or logs.

**Master / admin / auth:** M1–M5. **Phase 2A-2:** N1–N5. **Phase 2A-3:** P1–P6. **F0d:** Q1–Q7. **UI:** U1–U5. **F1:** R1–R7. **Client write-grant audit:** S1–S8. **PF1:** T1–T6. **F2:** V1–V8. **Referrals:** W1–W4. **F3:** X1–X9. **F3-C:** X7–X9. **Security and ops:** Y1–Y5. **Testing and state ownership:** Z1–Z4. **Investigation and version semantics:** AA1–AA5. **Documentation and verification:** BB1–BB5. (See prior PROJECT_STATE for full text; unchanged.)

> **Naming note:** the F3 guardrails X1–X9 predate the exposure items labelled X1–X4. The exposure items are written as **X1-exposure … X4-exposure**. All four are now CLOSED.

**Publish-state and audit — CC1–CC5 (2 September 2026):**

**CC1. Read the triggers on the table a function writes, not just the function.** `publish_tournament` was audited end to end and pronounced safe to call for an operational restore. It is — but `publications` carries two triggers that block activation when team snapshots are missing, and neither is visible from the function body. The restore failed in production. Same family as D40: *the dangerous object is often not the one you are reading.*

**CC2. A defect's name can encode a wrong cause.** The batch was called "unpublish must actually unpublish". `unpublish_tournament` was correct the whole time and had been since it was written. The real writer was `AdminTournaments.tsx`'s raw client update. **The give-away was in the data:** all 7 drifted rows had `status='published'`, a value the unpublish RPC cannot leave behind. Read the drifted rows before naming the cause.

**CC3. Three flags described one state, not two.** BB3 said two. It was `is_published`, `status` **and** `publications.is_active`, and four PUBLIC policies across four tables read the wrong ones. The §12.11 control test queried allocations, prizes and players only, so it under-reported the exposure by two tables — the tournament row and its title were readable too. **Enumerate every policy on every related table, then control-test each one.**

**CC4. A measurement that cannot ever read CLOSED is not a measurement.** The sweep's X3 checked whether `anon` holds a SELECT grant on `allocations`. That grant is legitimate and permanent, so X3 would have reported the exposure OPEN forever. Worse, the control-test probe required an *active* publication — a condition the fix destroys — so the anon control would have gone dark exactly when it most needed to keep passing. **When filing a check, ask what its CLOSED state looks like and whether the fix dissolves its own probe.**

**CC5. Placeholder rows travel.** The Dashboard "New Tournament" button inserts a complete, valid, publishable row before the organizer types anything. Nothing between that insert and a live public page requires a single real value. **A default that is valid enough to save is a default that will reach production.**

**CC6. A green check on an unchanged file looks identical to a green check on a correct one.** G3 was committed as `1 file changed` — the new `ColumnFilter.tsx` only. `AdminTournaments.tsx` never changed, because the browser had saved the second download as `AdminTournaments (1).tsx` and the `cp` copied the *old* file over itself. tsc passed, vitest passed, the merge succeeded and the push succeeded. Nothing failed, because nothing had changed. It surfaced only when Lovable reported nothing to publish. **After any `cp` into the repo, run `git --no-pager diff --stat` and confirm every file you expected is listed, before running tsc.** A passing baseline is evidence about whatever is on disk, not about what you meant to put there.

**Phase 2B:** 13. Bank statements are `privacy_class='sensitive'`. NEVER through Gemini. pdfplumber only.

---

## 4–12.11. Phases 1 through 1 September — COMPLETE

See prior PROJECT_STATE for full detail on Phase 1, Phase 2A, Workstream C, Phase 2A-2, F0a–F0e, F1, the E1–E3 audit, PF1, **F2 (live 20 Aug)**, the **referrals repair (22 Aug)**, **production validation (25–26 Aug)**, **F3-A/B/C0/C0b/C1 (28 Aug)**, **B13 #0 + `extraction_review_queue` + Resend SMTP (29 Aug)**, **F3-C2 batch A (30–31 Aug)**, **the B16 investigation (31 Aug)**, and **batch F1 + the backlog sweeps (1 Sep, §12.11)**.

Governing decisions unchanged: **D38, D39, D40, D41, X1–X9, Y1, Z1–Z4, AA1–AA5, BB1–BB5**.

---

## 12.12 · 2 September 2026 — G1 and G2 shipped, X-exposure closed

### Batch G1 — publish-state reconciliation. Migration `20260902120000`, merged `44c289b`.

**The premise in §13 was wrong and was corrected before any code was written.** §13 step 1 said to "clear `publications.is_active` in whatever RPC `PublishSuccess.tsx` calls". That RPC already did exactly that, and also set `status='draft'`. Building step 1 would have edited a correct function.

**Real cause, identified by measurement:** all 7 drifted rows carried `status='published'` and `is_archived=true`. `unpublish_tournament` cannot produce that combination. `AdminTournaments.tsx:159` could — a raw `supabase.from("tournaments").update(...)` whose hide/archive/softDelete actions set `is_published:false` and touched nothing else. Five of the seven were archived in one session on 2026-06-13.

**Scope was wider than documented.** Four PUBLIC-role policies read the wrong flags, not one:

| Policy | Table | Was keyed on | Now keyed on |
|---|---|---|---|
| `public_read_published_allocations` | allocations | `publications.is_active` | `tournaments.is_published` |
| `public_read_published_prizes` | prizes | `publications.is_active` | `tournaments.is_published` |
| `public_read_active_publications` | publications | `is_active` alone | `is_active` AND `is_published` |
| `anyone_read_published_tournaments` | tournaments | **`status='published'`** | `is_published` |

**Re-keyed, not dropped.** §13 offered dropping in favour of the `is_published`-gated siblings. Those siblings are restricted to role `anon`; the policies above are role PUBLIC. A signed-in visitor who is neither owner nor master reads public results **only** through the PUBLIC policies. Dropping them would have broken every signed-in visitor. Roles were left untouched; only `USING` changed.

**Safe because measured:** 36 tournaments had `is_published=true`, 43 had `status='published'`, difference exactly 7, and **zero** rows had `is_published=true` with `status<>'published'`. The sets nested, so re-keying strictly narrowed. Zero published rows were archived or soft-deleted, so `is_published` alone equalled the three-condition gate used by the `published_tournaments` view.

**Dry-run discipline.** The MCP's transaction semantics were control-tested first (`create table … ; select 1/0;` → table did not survive), then the entire migration body was executed against production and force-aborted. All checks passed and rolled back; the 7 rows and old policies were verified still in place before the real run.

**Result, verified independently of the harness.** As `anon`, across all 7 formerly exposed tournaments: `tournaments=0 publications=0 allocations=0 prizes=0`, total **0 rows** (was 2,625 allocations plus 7 titles). Positive control `0fa8d2f9`: `tournaments=1 allocations=875 prizes=180 players=1220`. All 35 published tournaments still readable.

### Batch G2 — the write path. Merged `0ccfdcd`.

`AdminTournaments.tsx`: hide / archive / softDelete now call `unpublish_tournament` first, then apply archive flags in a narrowed update. Order is deliberate — if the second write fails the tournament is left MORE restricted, not less. `unarchive` and `restore` were untouched; they never cleared `is_published`.

`tests/admin-tournaments-unpublish.spec.ts` — a mechanical source guard, **verified to fail all three assertions against the pre-G2 file** before being trusted (D35). vitest 476→479 passed of 482; tsc unchanged at 12/6.

**Proven live, not from the harness.** One archive click on `74e1bd2b` produced all three writes in one action: `is_published` true→false, `status` published→draft, `active_pubs` 1→0. Before G2 the last two would not have moved.

### Column-level UPDATE on `tournaments` — deliberately deferred

`authenticated` holds UPDATE on **all 29 columns** including `is_published`, `status`, `public_slug`. RLS restricts rows, never columns (D36). This is the enabling condition for the whole defect. **Not revoked**, because `TournamentSetup.tsx:723` performs a bare `.update(values)` and what `values` carries has not been established — revoking first would break tournament editing. After G1 the exposure is closed regardless, so this is Tier 2 hygiene, not a live hole.

### GTM1 RCA — the stub, and a second defect underneath it

`16b9cf29` "Untitled Tournament" is a **real customer event** (owner `sankalparora5555@gmail.com`, 61 players, 3 categories, 40 prizes, 240 allocations, published five times on 2026-04-04). `deleted_at` is null — it was never deleted.

**Cause:** `Dashboard.tsx:172`, the New Tournament button, inserts a stub — `title:'Untitled Tournament'`, `start_date=end_date=today`, status draft — then navigates to setup. Every other text field is `''`, not null. Nothing between that insert and a live public page requires a real value, and `publish_tournament` validates only ownership.

**Systemic measurement:** 34 of 133 still carry the stub title but only **1 published**. **23 of 35 published tournaments have `start_date = end_date = creation date`** — the stub default and a genuine same-day event are indistinguishable in the data, so an unknown share of public pages advertise the data-entry day as the event day.

**B22, found while reading `publish_tournament`:** slug precedence is `requested_slug` → **existing `public_slug`** → slugified title, and `Finalize.tsx:367` always passes null. Sankalp's slug is already `untitled-tournament`. **Renaming the tournament will not change the public URL.** Fixing GTM1 needs the title *and* a `public_slug` clear so the next publish regenerates it.

Sankalp has been contacted and will update the title.

### B21 — a one-way door in the publish path

`74e1bd2b` "Road To GCL — Shining Stars: Varanasi Edition" was archived as the G2 live test and **cannot be republished**. It has 2 active `institution_prize_groups` and **zero `team_allocations` at any version**; both `publications` triggers block activation, on UPDATE as well as INSERT. It was published at v3 in December 2025, before that guard existed.

**Blast radius measured: 2 tournaments have active team prize groups, both owned by Tushar.** The other (`0d54de9f`) has 3 snapshots and 300 allocations and is fine. **No customer can hit this today.**

The archive dialog says "You can unarchive it later" — true of the flag, false of the publication. **Decision: leave `74e1bd2b` archived.** Its public page had 0 players and 0 allocations, so nothing was displayed; the 6 categories and 16 prizes are intact and it will publish normally once a field is imported and finalized.

### Sweep results

DB sweep **18 OPEN / 2 CLOSED → 15 OPEN / 6 CLOSED**. X1, X2, X3 and the new X4 all read CLOSED. Repo sweep 7 OPEN / 3 CLOSED, unchanged. X3 was re-specified from a permanent grant check to a real anon read, and X4 added for the tournament and publication rows (CC4).

### Batch G3 / G3b — admin column filters. Merged `dcb8274`, wired `e207f41`.

`/admin/tournaments` had no way to see one organizer's tournaments: the text search covered title, venue and city but **not `owner_email`**, which is why searching for an organizer by name returned nothing.

- Text search now also matches `owner_email`.
- New `src/components/admin/ColumnFilter.tsx` — an Excel-style funnel on **Owner**, **Location** and **Time Control**. Searchable checkbox list of distinct values with counts, sorted most-frequent first, Select all / Clear. Built from `popover` + `checkbox` + `scroll-area`; **no new dependency** (guardrail 5).
- **Empty selection means unfiltered**, so the page behaves exactly as before until a value is ticked — adding a filter to a column cannot hide rows by default.
- Option lists are built from `statusScoped` (rows matching the current status chip), so counts match the tab on screen and deselecting a value never removes it from its own list.
- Blanks bucket under `(blank)` and stay selectable — that is how you list every tournament with no location, which the stub problem makes worth having.
- The status switch was extracted to a shared `matchesStatus()` used by both the chips and the option lists, so the two cannot drift.

**G3 shipped the component unused.** See CC6. G3b wired it. tsc stayed 12/6 with neither new file listed; vitest stayed 479/3 of 482, which also re-confirmed the G2 source guard survived the edits.

**No test covers the filter behaviour** — logged as Tier 3 debt.

---

## 13. Immediate next step

**B18 phases (a)+(b) — published results are not immutable.** Fresh chat, new branch off `main` at `e207f41`. Backend, with its own harness.

Scope:
1. Add `allocation_version integer` to `publications`.
2. `publish_tournament` records `max(allocations.version)` at insert.
3. `get_public_tournament_results` reads the active publication's `allocation_version`, falling back to `MAX()` when NULL.
4. Fix `detect_missing_team_snapshots`'s `a.version = p.version` join and the missing `is_master(uuid)` overload (`42883`), or explicitly defer to B7.
5. Matched-pair harness. **No harness has ever touched `publish_tournament`.**

**Two decisions owed before writing anything:**
- Backfill the 35 active publications with their current `MAX(allocations.version)`, freezing them immediately? **Recommended yes.**
- Does `supabase/functions/finalize` fall inside guardrail 1?

**Operational hold:** do not open `/t/8d1fbd83-…/finalize` until B18 ships. Auto-finalize fires on page load and creates new allocation versions (§12.11).

**Opening line for the next chat:**

> *Continue the Prize Manager project. Read PROJECT_STATE.md §12.12, §13 and §14. G1, G2 and G3 shipped 2 Sep; `main` is `e207f41`; X1–X4-exposure are CLOSED and verified as `anon`. Baselines: tsc **12 errors in 6 files** (per-file breakdown in §2), vitest **479 passed / 3 known failures of 482**. Next: **B18 (a)+(b) — version-pin published results**, backend only, matched-pair harness required, and it is the last Tier 1 engineering gate before the GTM pages. **Do not open `/t/8d1fbd83-…/finalize`** — operational hold in §12.11. Run `supabase db query --linked -f supabase/ops/backlog_sweep.sql` and `bash scripts/backlog_sweep_repo.sh` first, paste both outputs, then show me the plan before writing any migration.*

---

## 14. Backlog — the GTM gate

**The bar is not "clear everything."** The bar is: does it make a public statement false, produce wrong participant-facing output, or embarrass us at the National Championship.

### Tier 1 — must close before any marketing page is written

| Item | Status | Why it gates GTM |
|---|---|---|
| **X1–X4-exposure** — unpublish/archive did not unpublish | ✅ **CLOSED 2 Sep, G1+G2** | Verified 0 rows readable as `anon` across all 7 |
| **B18-a / B18-b** — published results are not immutable | **OPEN, HIGH — next** | Marketing drives traffic to `/p/` pages that follow `MAX(allocations.version)` and change when an editor page is opened |
| **GTM1** — 1 published tournament titled "Untitled Tournament" | **OPEN — owner** | Sankalp contacted. **Also needs the `public_slug` cleared (B22) or the URL stays `/p/untitled-tournament`** |
| **sportup.online claims** — "Official FIDE Partner" without written authorisation; player-count figure; ToS dated Oct 2023 naming wrong processors; sitemap 404 | **OPEN — owner** | **Decision 2 Sep: remove the FIDE line** until something materialises. Cannot be measured from this repo |

### Tier 2 — before the National Championship, not before the pages

- **G4 — required details before publish.** Server-side field gate in `publish_tournament` (title not blank and not the placeholder; venue, city, chief arbiter, tournament director present) plus a CHECK of the shape `is_published = false OR (all required non-blank)`, which enforces "may change, may not blank" in one object. Needs `NOT VALID` + backfill; 9 published rows violate it today. **Do this before marketing brings new organizers into the stub flow.**
- **B22 — sticky public_slug.** Renaming never changes the URL, and no UI exposes a slug change.
- **B21 — publish one-way door.** Team prize groups with no snapshots make a tournament permanently unpublishable. 2 tournaments, both Tushar's, no customer exposure. Needs a sweep check (BB5) and a warning in the archive dialog.
- **Stub dates** — 23 of 35 published carry `start_date = creation date`. Likely fix is not creating the stub with today's date.
- **B7** drift migration — 8 untracked functions; `anon` EXECUTE on `admin_create_coupon`, `admin_list_coupons`, `redeem_coupon_for_tournament`, **`bootstrap_master`**; `is_master(uuid)` missing.
- **Column-level UPDATE on `tournaments`** — revoke `is_published`/`status`/`public_slug` from `authenticated`. Blocked on auditing `TournamentSetup.tsx:723`.
- **B13 batch B** (#1 toast, #2 `/account` dead end, #5 screenshot copy); **batch C** (#3 spent coupons); **#9** `PublishSuccess.tsx`; **#7** clipping.
- **B17 + B8b** — 10 MB cap forces lossy compression; compressed vs uncompressed disagree on category naming. Fixture suite first; judge against expected output, never flag count (D41).
- **B5** — audit cadence. Count is 0 today, the easiest moment to forget it.
- **Publish-path harness** — six harnesses exist and none touches `publish_tournament`.
- **Team-tie guard design** — inert code removed in F1; the guard is not built.
- **B19** — one unexplained `finalize` 500. Likely dissolved by B18, possibly authorization-caused.
- **B18-c** — the `ON DELETE CASCADE` into published history. Own decision; deferred.

### Tier 3 — rides as debt, stated openly

**no test covers `ColumnFilter` / the admin filter predicate (G3)** · B1 (`authenticated` holds full DML on `coupons`/`coupon_redemptions`; control-tested non-exploitable) · Y2 (`anon` write grants on `extraction_review_queue`, control-tested inert) · B10 (2 dangling referral rows) · B12 · B14 (Resend reports accepted, not delivered — 0 unsent) · B15 (old API key still live) · B2 · B3 · B6 · layout regression test (Playwright is a new dependency, guardrail 5) · `CLAUDE.md` schema drift · `MAX_ATTEMPTS=5` with no backoff · `brew unlink node` fragility · `tsconfig.app.json` scope gap · `.claude/settings.local.json` wildcard rule · accepted residuals.

### Closed by measurement

| Item | Verdict |
|---|---|
| X1/X2/X3/X4-exposure | **CLOSED 2 Sep** — G1 policies + G2 write path, verified as `anon` |
| Archive re-dirtying publish state | **CLOSED 2 Sep** — G2, proven live |
| B16 organizer publish failure | CLOSED 31 Aug — transport |
| B13 #8 two publish buttons · B20 silent failures | CLOSED — batch F1 |
| B5 unaudited auto-approvals · B14 unsent outbox rows | **0**, CLOSED by sweep |

---

## 15–18. Phase 2B / 2C-D / 3 / 4 — unchanged

**Ordering (revised 2 Sep):** B18 (a)+(b) → G4 required-fields → GTM pages → Tier 2 → Phase 2B.

certificate-hub.com integration parked by owner decision 2 Sep.

---

## 19. Tracked debt

Superseded by §14's three-tier gate. The sweeps are the canonical *measurement*. Where this document and a sweep disagree, **the sweep wins and the document gets corrected** (BB1).

---

## 20. How to start each new chat

**One chat per workstream.** At every phase boundary: Claude gives an updated `PROJECT_STATE.md` → delete the old one in the Project knowledge panel → upload the new one → open a fresh chat → paste the opening line.

**Division of labour:** design, schema audit and independent verification belong in **chat**; write-run-fix loops on SQL and TypeScript belong in **Claude Code**.

**The backlog loop:**
1. **Run both sweeps at the start of every session**, before planning anything.
2. **Where a verdict contradicts this document, correct the document first** (BB1).
3. **After shipping, re-run.** The item must flip to CLOSED.
4. **UNMEASURED is never CLOSED.**
5. **Every new backlog item gets a check the day it is filed** (BB5), and that check must have a reachable CLOSED state (CC4).

**Working rules that do not change:**
- `git config --global core.editor "true"` is set, so `git merge` no longer opens vim. Still prefer `git merge --no-ff -m "…"`.
- Always `/clear` in Claude Code before a new prompt — **and verify it took.**
- **First command in any new Terminal window is `cd ~/Desktop/prize-manager`.**
- **`npm run dev` reads and writes the live database. Check which account you are signed in as.**
- Edge-function changes need `supabase functions deploy <name>`. **Confirm the bundle hash changed, not the version number** (Y3).
- **`supabase functions logs` does not exist.** Dashboard only, 1-day retention.
- **A new database function also needs `notify pgrst, 'reload schema'`** (T6).
- **Publishing is separate from merging.** A database-only migration is live the moment `supabase db query` runs; a `src/` change is not live until Lovable publishes.
- Use `git --no-pager diff`, never plain `git diff`. Merge with `--no-ff`. After merging, re-run tsc **and vitest** on `main`.
- Paste terminal output as **text**, never screenshots.
- **A build report is a claim, not evidence. Require the full `git --no-pager diff`.**
- **After any `cp` into the repo, run `git --no-pager diff --stat` and confirm every expected file is listed — before tsc** (CC6). Chrome renames a repeat download to `name (1).ext`, so `cp ~/Downloads/name.ext` silently re-copies the previous version. Prefer `cp "$(ls -t ~/Downloads/<name>*.ext | head -1)" <dest>` and then `grep -c` for a token you know is in the new file.
- Migration workflow: `supabase db query --linked -f <file>` then `supabase migration repair --status applied <version>`. `supabase db execute` does not exist.
- **`RAISE NOTICE` is swallowed.** Put failures in `RAISE EXCEPTION`. **`RAISE` uses `%`, not `%s`** — `%s` substitutes and leaves a stray `s`.
- **Every migration must self-verify and fail loudly**, in one transaction, opening with a pre-flight that asserts the audited state.
- **Dry-run a migration by executing its body and force-aborting**, then verify production is untouched. The MCP batches a multi-statement script into one transaction — control-tested 2 Sep.
- **Prove the fix with a test that can only pass if the fix works.** Prefer *matched pairs*, and **assert the positive side is non-zero** — a matched pair whose positive cannot produce a positive proves nothing.
- **Verify a guard fails on the broken input before trusting it** (D35).
- **Read the triggers on any table a function writes to** (CC1).
- **Read the drifted rows before naming the cause** (CC2).
- **Enumerate every policy on every related table, then control-test each** (CC3).
- **Ask what a new check's CLOSED state looks like, and whether the fix dissolves its own probe** (CC4).
- **A grant is not an exposure until a real read returns rows — and it is one once it does** (BB4).
- **Two flags for one state will disagree; ask which one RLS reads** (BB3) — and count them, there may be three.
- **An effect that writes on mount makes visiting a page a mutation** (AA5).
- **Never let an error handler discard the input that caused the error** (W4).
- **Never redirect a generator onto a tracked file** (R7). Temp file → verify → `cp`.
- Additive migration → verify → frontend → verify → restrictive migration. Never the reverse.
- **Do not fix what measurement says is not broken.** Record it as drift and move on (W3).
- **When a new finding arrives mid-workstream, log it and finish the batch.** B21, B22 and the stub RCA all surfaced during G1/G2 and none was chased. That is why both closed cleanly.
