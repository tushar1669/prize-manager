# PROJECT_STATE — Prize Manager · Universal Extraction Engine
**Last updated:** 31 August 2026 · **Owner:** Tushar · **This file is the single source of truth for continuing work in any new chat.**

Replace the previous PROJECT_STATE.md in the repo with this file. Paste it at the start of every new chat to re-establish context.

---

## 1. What this project is

**Prize Manager** (prize-manager.com) is a chess tournament management platform. Phase 1 built a brochure extraction engine: organizer uploads a PDF brochure → two-pass Gemini OCR + structured extraction + deterministic trust/grounding layer → review screen → on Approve, a tournament is created with categories and prizes.

**Phase 2** extends the same engine into a Universal Extraction Engine serving three platforms and eventually external developers. The engine is doc-type-driven; adding a document type requires a new schema row and new trust invariants, not a new pipeline.

**Three-platform context:**
- **prize-manager.com** — Tournament prize management (live). Phase 2A/2A-2/2A-3 added payment screenshot verification, the full payment lifecycle, UTR trust hardening, the profile prerequisite, **conditional auto-approval (live 20 August 2026)**, the auto-approval oversight loop (F3-A/B/C, 28 August), B13 #0 plus the `extraction_review_queue` security fix and the Resend SMTP migration (29 August), and now **F3-C2 batch A — B13 #4 and B13 #6 (30–31 August 2026)**.
- **certificate-hub.com** — Certificate creation, paywalled. Will consume the engine via REST API (Phase 2C).
- **sportup.online** — Discovery + tournament management. Will consume via REST API (Phase 2C).

---

## 2. Key identifiers

| Item | Value |
|---|---|
| Supabase project | `nvjjifnzwrueutbirpde` (ap-south-1, Postgres 17.6). Org is on the **FREE** plan |
| Repo | github.com/tushar1669/prize-manager (**public**) · `main` at **`42d920f`** (F3-C2 batch A merge, 30–31 Aug) · batch A commits `1f732be` (#4) and `1b87962` (#6) · SEC migration `5004462` · B13 #0 merge `8aa3056` · F3-C1 merge `302732f` · F3-C0 merge `3aed330` · F3-B merge `2d47197` · F3-A merge `96555f7` · referrals repair merge `1ee42db` · F2 merge `a5bebf8`. **`PROJECT_STATE.md` lives at the repo root only** |
| **Edge functions** | `extract` **v48**, sha `704f5074…` · `send-payment-notifications` **v9**, sha `ccf8c3be…`, `verify_jwt=false` · `commit-extraction` **v14**, sha `a4507fc1…` · `sendWelcomeOnboardingEmail` **v21** · `allocatePrizes` v368 · `finalize` v355 · `generatePdf` v353 · `parseWorkbook` v341 · `allocateInstitutionPrizes` v251 · `publicTeamPrizes` v240 · `pmPing` v238 · `backfillTeamAllocations` v38. **Untouched by any work on 29, 30 or 31 Aug — batch A was frontend only** |
| **Version-vs-hash rule (Y3)** | A version bump is not evidence of a deploy; the `ezbr_sha256` is. All twelve functions re-versioned platform-side on 29 Aug with byte-identical hashes |
| Active extraction schema | v5 (chess_brochure), v3 (payment_screenshot, id `4e8beb4d-4a07-4ef8-a774-18b22f722522`) |
| Gemini model | `GEMINI_MODEL` = `gemini-3.1-flash-lite` |
| Local paths | repo `~/Desktop/prize-manager`, test PDFs `~/Desktop/prize-manager/test-brochures/` |
| Payment trust invariants | 8 in `extract/paymentTrustCheck.ts` · returns `{flags, verdicts}` |
| Checker version | `PAYMENT_CHECKER_VERSION = 1` in `paymentTrustCheck.ts`; the RPC gate pins the literal `1` |
| **F2 kill switch** | `platform_feature_flags` — row `key='payment_auto_approve'`, `enabled = true` since 2026-08-20 17:26:33 UTC. **Shape is `(key, enabled, description, updated_at, updated_by)` — there is no `payment_auto_approve` *column*.** RLS on, zero policies, `authenticated` cannot read it. Off switch: `supabase/ops/f2_auto_approve_off.sql` |
| **F3 oversight objects** | `payment_auto_approval_audit` (table) · `record_auto_approval_audit(uuid,text,text,text)` · `revoke_auto_entitlement(uuid,text) RETURNS jsonb` · `list_auto_approvals() RETURNS jsonb`, zero-arg, master-only. All locked to the `payment_invariant_verdicts` shape: RLS on, zero policies, zero client table grants, `anon` holds no EXECUTE, `authenticated` holds EXECUTE on the three RPCs only |
| **`list_auto_approvals()` contract** | jsonb **array**, newest first, **26 keys per row**, keyed on the `auto_upi` entitlement (X1). `pro_still_active` / `active_sources` use **exactly** `revoke_auto_entitlement`'s predicate |
| **`record_auto_approval_audit` is an UPSERT** | One row per `payment_id`, PK on `payment_id`. Re-recording **overwrites** outcome, reason, `audited_at` and `audited_by`. There is no history table. See Z1 |
| **`revoke_auto_entitlement` writes `review_note`** but never sets `status='rejected'` — verified 30 Aug. X2 (quiet revocation) holds |
| **RPC error tokens** | Six, and only six: `not_master`, `reason_required`, `not_an_auto_approval`, `invalid_outcome`, `invalid_action_taken`, `payment_not_found`. `src/integrations/supabase/autoApprovals.ts` maps all six |
| **`public.referrals` triggers** | **ZERO, by design, since `20260822120000`.** Do not re-add one — see W1 |
| Test baseline | **476 passing / 3 known failures** (conflict-utils ×2, martech-metrics ×1) of 479. **Re-verified on `main` at `42d920f`** |
| TypeScript check | `npx tsc -p tsconfig.app.json --noEmit` — **12 errors in 6 files**, unchanged across all of batch A. **Per-file baseline** (capture before any batch): `PendingPaymentsPanel.tsx` 5 · `BrochureImportDialog.tsx` 2 · `TournamentUpgrade.tsx` 2 · `useAuth.tsx` 1 · `AdminPayments.tsx` 1 · `BrochureReview.tsx` 1. **`AutoApprovedPanel.tsx` has zero and must keep zero.** Root `npx tsc --noEmit` and `npm run typecheck` check **nothing** — root `tsconfig.json` has `"files": []` |
| pg_cron jobs | jobid 1 `expire-stuck-extraction-documents` (*/10); jobid 2 `drain-payment-notifications` (*/2) |
| Claim RPC | **5-arg only**, `RETURNS uuid`, 1 overload, **15 `RAISE EXCEPTION` across 11 codes** |
| **`review_tournament_payment` note handling** | Stores `review_note = left(coalesce(p_note,''), 2000)`. **A NULL note becomes an empty string, never NULL** — which is why every blank note in the table reads `''`. The RPC is frozen (guardrail 10); the only lever is the frontend. Closed for rejections by B13 #4 |
| Client grants: `tournament_payments` / `profiles` | `authenticated` SELECT only; `anon` nothing. `users_read_own_payments` = SELECT WHERE `user_id = auth.uid()` — **this is what makes B13 #1 buildable with no RPC change** |
| Client grants: `coupons` / `coupon_redemptions` | `authenticated` holds **SELECT, INSERT, UPDATE, DELETE** on both. Writes bounded only by master-only RLS; no permissive policy matches a non-master write. Reads scoped by `coupons_read_own` and `coupon_redemptions_read_own`. **This is B1** |
| Client grants: `payment_invariant_verdicts` / `platform_feature_flags` / `tournament_player_watermark` / `payment_auto_approval_audit` | **NOTHING for either role.** RLS on, zero policies. All owned by `postgres` with `relforcerowsecurity = false`, which is *why* the SECURITY DEFINER RPCs can read them |
| Backstop index | `uq_tournament_payments_utr_active` — UNIQUE on `normalize_utr(utr)` WHERE `status <> 'rejected'` |
| Pending index | `uq_tournament_payments_pending` — UNIQUE `(tournament_id, user_id)` WHERE pending |
| Outbox uniqueness | `uq_payment_notification_outbox_payment_action` — UNIQUE **INDEX** on `(payment_id, action)` |
| **Entitlement constraints** | `tournament_entitlements_window_valid` CHECK `starts_at < ends_at` · composite FK **`(tournament_id, owner_id) → tournaments(id, owner_id)`** · **NO uniqueness on `(tournament_id, owner_id)` — entitlements can stack.** See X3, X4, X5 |
| **Brochure upload cap** | `storage.buckets.file_size_limit = 10485760` (10 MB) on `extraction-uploads`. **This is a correctness issue, not a convenience one — see B17** |
| Verification harnesses | `supabase/tests/f2_gate_checks.sql` — 24 checks, 24/24 on 22 Aug<br>`supabase/tests/f3_audit_checks.sql` — 33 checks, 33/33 twice on 28 Aug<br>`supabase/tests/f3c_read_checks.sql` — 13 checks, 13/13 on 28 Aug<br>`supabase/tests/f0d_rpc_checks.sql` — 17 branches, 17/17 on 19 Aug<br>`supabase/tests/pf1b_expected_amount.sql` — 9 cases, 9/9 on 19 Aug |
| Operational scripts | `supabase/ops/f2_auto_approve_on.sql` · `f2_auto_approve_off.sql` · `f2_auto_approval_report.sql`. **Not migrations — never `migration repair` them** |
| Design doc | `docs/design/UI_CONVENTIONS.md` — dark-only, enforced by `tests/ui-conventions.spec.ts` |
| **Live counts (verified 31 Aug)** | **43 auth users · 43 profiles** (was 41/41; +2 including `varanasichessassociation@gmail.com`, created 30 Aug 07:46 UTC) · **47 coupons** (was 45) · 8 coupon_redemptions · **133 tournaments** (was 129) · **12 payments** (1 auto-approved, 3 approved total, **9 rejected**, 0 pending) · 12 entitlements (1 `auto_upi`, 8 `coupon`) · **12 outbox rows, all `sent`, zero failures ever** · 8 verdict rows · 1 `payment_auto_approval_audit` row · 6 referrals · 5 referral_rewards |
| **Blank-note census (31 Aug)** | **5 of 9 rejections and 2 of 3 approvals still carry an empty `review_note`.** These are historical and not backfillable with real reasons. The 30 Aug test rejection is **the first non-blank rejection this project has ever produced** |
| Platform payee VPA | `9559161414-5@ybl` — hardcoded as `UPI_ID` in `TournamentUpgrade.tsx` **and** held as the `PLATFORM_PAYEE_VPA` secret |

### Email infrastructure (migrated 29 August 2026)

| Item | Value |
|---|---|
| **Auth email transport** | **Custom SMTP via Resend.** Was Supabase's built-in service, capped at **2 emails/hour project-wide** — the root cause of registration and password-reset failures |
| SMTP settings | Host `smtp.resend.com` · Port `465` · Username `resend` (literal) · Password = `RESEND_API_KEY` · Sender `noreply@prize-manager.com` · Sender name `Prize-Manager` |
| **Edge-function sender** | `WELCOME_EMAIL_FROM` = **`hello@prize-manager.com`** (a secret, read at runtime by both `send-payment-notifications` and `sendWelcomeOnboardingEmail`). Deliberately a different address from the SMTP sender; both on the same verified domain |
| Resend domain | **`prize-manager.com`, Verified**, the only domain on the account (`chess.tushar`) |
| Auth rate limits | **emails 100/h** · min interval per user 60 s · token refreshes 150/5min · token verifications 30/5min · sign-ups and sign-ins 30/5min · anonymous 30/h |
| `RESEND_API_KEY` | **Rotated 29 Aug.** Old key still live pending the audit in B15 |
| **Re-proven 30 Aug** | The B13 #4 test rejection delivered to `tusharsaraswat68@gmail.com` from `hello@prize-manager.com`, carrying the reason text in the body. The transactional path is healthy end to end |
| **No redeploy required for secrets** | Edge-function secrets are runtime env vars. Redeploying to "be safe" ships your working tree — avoid it |

### Migrations (all applied, repaired, and version-matched to repo filenames)

| Version | What |
|---|---|
| `20260817120000` | F2-A — `payment_invariant_verdicts` |
| `20260817130000` | F2-B — `source` admits `auto_upi` |
| `20260817140000` | F2-D — outbox `action` admits `auto_approved` |
| `20260817150000` | F2-E — `payment_auto_approve` flag, created disabled |
| `20260817160000` | F2-G — the auto-approval gate |
| `20260822120000` | Drop the dead `trg_referrals_set_snapshot` trigger and its function |
| `20260827120000` | F3-A — `payment_auto_approval_audit` + `record_auto_approval_audit()` |
| `20260827130000` | F3-B — `revoke_auto_entitlement()` |
| `20260828120000` | F3-C0 — `list_auto_approvals()`, master-only read path |
| `20260828130000` | F3-C0b — adds `file_path` / `file_name` to `list_auto_approvals()` |
| `20260829120000` | SEC — `extraction_review_queue` to `security_invoker`, revoke `anon` SELECT. See §12.8 |

**No migration was written on 30–31 August.** F3-C2 batch A is frontend only. (F2-C and F2-F were edge-function deploys. The 20 Aug flag flip was an operational UPDATE, not a migration.)

**Note on the two F3 version stamps:** they read `20260827…` but the work landed on **28 August**.

### Real frontend routes

| Purpose | Path |
|---|---|
| Tournament landing | `/t/:id/setup?tab=details` |
| Payment page | `/t/:id/payment` |
| Account / profile | `/account` |
| Admin payments | `/admin/payments` |
| Admin users | `/admin/users` |
| Admin coupons | `/admin/coupons` |

---

## 3. Non-negotiable guardrails

**Phase 1:**
1. NEVER touch the allocation engine — allocations, `rule_config`, conflicts, player-to-prize matching — unless Tushar explicitly names it. Lives in `supabase/functions/allocatePrizes`, `allocateInstitutionPrizes`, `backfillTeamAllocations`. The frontend invokes it **by string name**; never alter an invoke name or payload.
2. `criteria_json` committed as always `'{}'`.
3. Never weaken grounding or arithmetic. Never weaken checks to force a pass.
4. Client never writes production tables; only `commit-extraction` does, on explicit Approve.
5. No paid services, no new dependencies without justification.
6. Sequential phases, one prompt at a time, max 3–4 deploy cycles then stop and report.
7. Builder/auditor split: Claude Code builds; Claude (chat) verifies via Supabase SQL before advancing.

**Phase 2A:**
8. Payment auto-approval is CONDITIONAL and server-side only. Gates on **named security-relevant invariant verdicts**, not flag count (D28), and **`skipped` is not `pass`** (D39).
9. NEVER use `commit-extraction` or `commit_extraction_transaction` for payment data.
10. NEVER modify `review_tournament_payment`'s core entitlement-insert logic.
11. Screenshot upload is OPTIONAL. The UTR-text-only path must keep working. **A claim with no screenshot can never auto-approve.**
12. NEVER expose the **auto-approve kill switch** in frontend code or logs. The payee VPA is necessarily public and is *not* covered by this guardrail.

**Master / admin / auth:** M1–M5. **Phase 2A-2:** N1–N5. **Phase 2A-3:** P1–P6. **F0d:** Q1–Q7. **UI:** U1–U5. **F1:** R1–R7. **Client write-grant audit:** S1–S8. **PF1:** T1–T6. **F2:** V1–V8. **Referrals:** W1–W4. **F3:** X1–X6. **F3-C:** X7–X9. (See prior PROJECT_STATE for full text; unchanged.)

**Security and ops — Y1–Y5 (29 August 2026):**

Y1. **A SECURITY DEFINER *view* is the same class of hole as a SECURITY DEFINER *function* (D38), and RLS cannot see either.** `public.extraction_review_queue` exposed 138 rows to `anon`. **Every new view must set `security_invoker = on` at creation.**

Y2. **Revoking one privilege is not revoking the grant.** Audit the whole privilege row, not the one you were thinking about.

Y3. **A version number is not evidence of a deploy; the bundle hash is.**

Y4. **Supabase's built-in email service is 2 messages/hour, project-wide, and is not for production.** Newly enabled SMTP starts at 30/h and must be raised explicitly.

Y5. **Never save an SMTP sender address whose domain is not verified with the provider.** Supabase does not warn; auth email simply stops arriving.

**Testing and state ownership — Z1–Z4 (new, 30–31 August 2026):**

Z1. **A test that writes through a production RPC overwrites production data. Choose a fixture, not the live record.** The B13 #6 collapse-regression test said "click Record audit" on the only real auto-approval. `record_auto_approval_audit` is an upsert keyed on `payment_id` with no history table, so it replaced the 28 Aug oversight record (`ok`, full verification text) with `uncertain` / "re-audit collapse test". Caught by reading the table after the test, not during it. **Restored through the same RPC**, with a bracketed note explaining the re-record, because back-dating `audited_at` by direct UPDATE would have made the audit trail lie. **The honest repair is always preferable to the invisible one.**

Z2. **Write a guard assertion from the measured baseline, not from an expected constant.** The check for "the temporary test inversion is gone" was specified as `grep -c "!== null"` must be `0`. It returned `2` — and `main` also has exactly `2`, at `row.file_path !== null` and `revokeTarget !== null`, both legitimate. A correct-looking assertion with a wrong constant produces a false alarm, which costs the same trust as a missed one. The right form was "equals main's count". Same family as the B13 #0 `.slice(0,12)` error: **measure against the artifact, never against your memory of it.**

Z3. **To check a large re-indent for lost content, sort the file with indentation stripped and diff that.** `sed 's/^[[:space:]]*//' | sort` on both versions cancels out every line that merely moved, leaving only genuine additions and deletions. The B13 #6 diff moved ~300 lines; this reduced the review to six deletions, all of which were replacements. A visual check of the rendered page cannot do this — it only exercises the branches that render today, not the rare ones (`verdicts === null`, the unreachable `file_path` notice, the revoke-result block).

Z4. **Separate an owned decision from a derived description, and treat them oppositely.** A per-row expand state is a *decision* the user owns: seed it once per key, never re-derive it, or a refetch will undo the user's action mid-task. An "Expand all / Collapse all" label is a *description* of present state: derive it on every render, or it will drift from what the rows are actually doing. Both live in the same component and the rules are exact opposites. The two must share one fallback expression, or they disagree on first render.

**Phase 2B:**
13. Bank statements are `privacy_class='sensitive'`. NEVER process through Gemini. pdfplumber only.

---

## 4–12.8. Phases 1 through 29 August — COMPLETE

See prior PROJECT_STATE for full detail on: Phase 1, Phase 2A, Workstream C, Phase 2A-2, F0a–F0e, F1, the E1–E3 client write-grant audit, PF1, **F2 (live 20 Aug)**, the **referrals repair (22 Aug)**, **end-to-end production validation (25–26 Aug)**, **F3-A / F3-B / F3-C0 / F3-C0b / F3-C1 (28 Aug)**, and **B13 #0 + the `extraction_review_queue` exposure + the Resend SMTP migration (29 Aug)**.

Governing decisions unchanged: **D38** (a definer function's EXECUTE grant is a write path RLS cannot see), **D39** (absence of a flag is not evidence a check passed), **D40** (a trigger that writes a column is a dependency of that column), **D41** (fewer flags is not a better extraction), **X1** (an auto-approval is identified by its entitlement, never by `reviewed_by IS NULL`), **X2** (revocation is quiet by design), **Y1** (a definer view is the same hole as a definer function).

---

## 12.9 · 30–31 August 2026 — F3-C2 batch A shipped, plus three findings logged

Frontend only. No migration, no edge-function deploy, no backend change of any kind. Merge `42d920f`, published via Lovable.

### B13 #4 — a rejection now requires a reason

`src/components/master/PendingPaymentsPanel.tsx`, commit `1f732be`.

**The pre-audit found the mechanism, and it was not what the backlog said.** Not one blank note is NULL — all of them are empty strings, because `review_tournament_payment` stores `left(coalesce(p_note,''), 2000)`. The client was sending `rejectNotes[p.id] || undefined`, and `||` treats a whitespace-only string as truthy. So `"   "` would have been sent and stored as three spaces, indistinguishable from blank in the organizer's email. **Both the guard and the payload had to trim, not null-check.**

That panel is the **only** client caller of `review_tournament_payment` in the repo, so the fix is one file. `revoke_auto_entitlement` also writes `review_note` but never sets `status='rejected'` and already demands a reason, so it cannot produce a blank-note rejection.

**Scope decision: Reject only.** Two of three approvals are also blank, but an approval explains itself — the organizer gets Pro. Requiring a note on Approve would add friction to the one path that must stay fast.

**Verified end to end on live data**, because there were zero pending payments and the button had nothing to render against. A UTR-only claim (`F3C2TESTA001`, ₹500, no screenshot, so guardrail 11 makes auto-approval impossible) was submitted from the test organizer, then rejected through the new UI. Matched triple:

| State | Reject button | Result |
|---|---|---|
| empty note | disabled | ✅ |
| three spaces | **still disabled** | ✅ — the case the old `||` would have passed |
| real text | enabled | ✅ |

Database after the click: `status = rejected`, `review_note = 'Test rejection for F3-C2 verification'` (exact, 37 chars, `btrim <> ''`), `reviewed_by` = master, **zero entitlements created**, one outbox row. The email arrived at the organizer's inbox with **"Reason: Test rejection for F3-C2 verification"** in the body. Every rejection email before this one had an empty reason box.

A hint span was width-constrained to `w-48` before commit: it sits in an `items-end` flex column beside a `w-48` input, and unconstrained it would size to ~390px of `max-content` and widen the table cell. Given B13 #0 was a width defect on this exact page, constraining beat measuring later.

### B13 #6 — auto-approved rows collapse

`src/components/payments/AutoApprovedPanel.tsx`, commit `1b87962`.

Rows default open when un-audited, closed when audited, and the collapsed header carries tournament, organizer, **amount**, the audit badge and **Pro access now** — the last two lifted out of body sections that are now hidden.

**The defect worth naming is not the collapse, it is the auto-collapse.** If expansion were read as `row.audit === null` on every render, recording an audit would refetch, flip `audit` non-null, and slam the row shut under the master's hands — destroying the revoke-result record, the typed reason and the chosen outcome. So the default is seeded **once per `payment_id`** by an effect that adds only absent keys, returns `prev` when nothing changed, and never deletes. From then on the state belongs to the user. See Z4.

**Both branches were exercised, including the one with no data.** There are zero un-audited auto-approvals, so the "open by default" branch could not fire on live data. It was forced by temporarily inverting the seed to `row.audit !== null`, confirming the row then defaulted open, and reverting. A negative result needs a control that can produce a positive.

`Expand all` / `Collapse all` began as two buttons and was reduced to one that names the action currently available, derived live from whether every loaded row is open. Confirmed to flip correctly when the row is collapsed **by its own header** rather than by the button — which is what proves the label reads state rather than remembering the last click.

The ~300-line re-indent was checked mechanically per Z3: six deletions, every one a replacement.

**tsc per-file baseline unchanged at every step** — after commit 1, after commit 2, after the single-button change, and on `main` after the merge. vitest 476/3 throughout.

### Three findings raised mid-session, logged and not chased

**1. The VCA publish failure — highest priority of the three.** `varanasichessassociation@gmail.com` (`0f320e2c…`, created 30 Aug 07:46 UTC) tried to publish `1ST VCA RAPID CHESS TOURNAMENT` and it broke; master completed it instead. **Measured signature:** tournament `8d1fbd83…` carries two `publications` rows, versions 1 and 2, three minutes apart, and **both have `published_by = chess.tushar@gmail.com`**. Zero rows were written by the owner, so it failed **before** the write, not partway through. Tracked as **B16**.

**2. The same brochure extracted twice, differently.** Two import sessions of the 1ST VCA RAPID brochure: `9956d40c…` produced 7 categories with **6 unnamed**, `5fb4c2b9…` named them correctly ("Under 09/11/15 Open", "Under 09/11/15 Girls"). This is B8b and the D41 shape. **It is now a real fixture pair**, which is more than B8b had before.

**3. The 10 MB cap is a correctness problem, not a convenience one.** The original brochure is **12.19 MB**; the compressed one the cap forced is **0.47 MB** — 26× smaller. The two runs above are that same file at two compression levels. If the cap forces lossy compression and compression changes what the model can read, the cap is upstream of extraction quality. Tracked as **B17**, chained to B8b.

---

## 13. Immediate next step

**F3-C2 batch B.** Fresh chat, new branch off `main` at `42d920f`. **Frontend only; no backend change is needed or permitted.**

| Batch | Page | Items | Status |
|---|---|---|---|
| **A** | `/admin/payments` | #6 collapse/expand, #4 rejection note required | ✅ **DONE 30–31 Aug**, merge `42d920f` |
| **B** | payment gate | #1 false toast, #5 screenshot copy, #2 `/account` return_to | **NEXT** |
| **C** | `/account` | #3 coupon capacity | after B |

B before C — both touch `Account.tsx`. All three of batch B's items live in `TournamentUpgrade.tsx`, which holds **2** of the 12 baseline tsc errors and contains `as never` RPC casts (tracked debt). Capture the per-file baseline before editing it.

**Opening line for the next chat:**

> *Continue the Prize Manager project. Read PROJECT_STATE.md §12.9, §13 and §14 (B13). F2 is live (20 Aug); referrals repaired 22 Aug, validated 25–26 Aug; F3-A/B/C0/C1 shipped 28 Aug; B13 #0, the `extraction_review_queue` exposure and the Resend SMTP migration all closed 29 Aug; **F3-C2 batch A (B13 #4 + #6) shipped and published 30–31 Aug**. `main` is `42d920f`. Baselines: tsc **12 errors in 6 files** (per-file breakdown in §2), vitest **476 passed / 3 known failures**. Next: **F3-C2 batch B — B13 #1 (false "awaiting approval" toast), #5 (screenshot copy), #2 (`/account` return_to)**, all in `TournamentUpgrade.tsx`. Note B16 (VCA publish failure) and B17 (10 MB brochure cap) are new and unstarted — read §14 before deciding whether they preempt batch B. Audit before code: re-verify both baselines by running them, and capture the per-file tsc baseline to a file for diffing. Show me the plan before writing any `src/` code.*

---

## 14. Backlog — carried forward, NOT forgotten

### B16 — organizer publish failed for `varanasichessassociation@gmail.com` · **HIGH, new 30 Aug, UNSTARTED**

A real user on Tushar's own association account could not publish; master had to complete it. **The National Championship runs through this path**, which is what makes it the highest-priority open item.

Measured: `publications` for `8d1fbd83…` holds versions 1 and 2, three minutes apart, both `published_by = chess.tushar@gmail.com`. **Zero rows from the owner — it failed before the write.**

Candidate causes, none confirmed: the ownership check added to `publish_tournament` in the E1–E3 audit (14 Aug); or the team-snapshot publication guards `guard_publication_requires_team_snapshots` / `enforce_team_snapshots_on_publication_activate`, both of which are **untracked functions on the B7 list**, with `/admin/team-snapshots` already returning 404 on `detect_missing_team_snapshots`.

**Do not guess.** Reproduce as a non-master organizer and capture the actual error text and PostgREST response before touching anything. The second tournament `4d8c0981…` is still `draft` with zero publications and is available as a reproduction target.

### B17 — the 10 MB brochure cap forces lossy compression · **MEDIUM-HIGH, new 30 Aug, UNSTARTED**

`storage.buckets.file_size_limit = 10485760` on `extraction-uploads`. The VCA brochure is 12.19 MB and had to be compressed to 0.47 MB to upload at all — and the compressed and uncompressed runs did not agree on category naming (see B8b).

Raising the number is one SQL update, but it is not the whole change: there is very likely a client-side guard in the upload component, and a larger PDF means a larger Gemini payload with its own limits and cost. **Sequence it with B8b's fixture suite**, so the before/after is measured on expected output rather than on impressions. Do not raise the cap blind.

### B13 — UI defects · **#0, #4, #6 DONE; four remain**

0. ~~**Horizontal overflow on `/admin/payments`**~~ ✅ **29 Aug**, `c116d2b` / `8aa3056`. Pre-existing in `AdminLayout.tsx`, not an F3-C1 regression.

1. **"Awaiting admin approval" is shown on an auto-approved payment.** `TournamentUpgrade.tsx:472` hardcodes the toast; the claim RPC returns only a uuid. Line 660 then adds "already has Pro access" — two contradictory messages, the first false. Fix by re-reading payment status after submit; do **not** change the RPC's return type. Confirmed buildable with no RPC change: `users_read_own_payments` is a SELECT policy on `user_id = auth.uid()` and `authenticated` holds SELECT on `tournament_payments`. **Batch B.**

2. **`/account` is a dead end from the payment gate.** `TournamentUpgrade.tsx:734` is a bare `<Link to="/account">`; `Account.tsx` has no `return_to`. The `returnToForClaim` mechanism (D20/L6) exists and was never applied here. **Batch B.**

3. **Spent coupons still look available.** `Account.tsx:284` selects by `issued_to_user_id` and never joins `coupon_redemptions`; `is_active` stays `true` after redemption. **Batch C.**

   **The correct reason is the X4 principle applied to coupons: the display predicate must be the authoritative one.** `redeem_coupon_for_tournament` accepts a coupon iff **all six** hold — `is_active`, `starts_at` window, `ends_at` window, assignee match (`issued_to_user_id IS NULL OR = caller`), global capacity (`max_redemptions IS NULL` = unlimited), per-user capacity (`max_redemptions_per_user IS NULL` = unlimited). Mirror exactly that, and handle NULL as unlimited explicitly. (The earlier `TRIAL` justification was wrong and was corrected on 29 Aug: `TRIAL` has `issued_to_user_id IS NULL`, so it can never appear on anyone's `/account`.)

   **Actual live scope is small:** exactly **two** coupons have redemptions and are fully spent — `REF1-4DC17AB9` and `WELCOME-2E54DF13`, both `max_redemptions = 1`, both still displaying as available.

   **The client CAN compute this correctly, narrowly**, because the redeem RPC refuses any assigned coupon presented by a non-assignee, so for the coupons `/account` shows, your own redemptions **are** the global set. **Accepted residual:** if a master re-assigns an already-redeemed coupon, the client under-counts. Zero rows today, master only. **No backend change.**

   Show expiry as its own distinct reason ("expired 8 May 2026"), never merged with "fully used" (D32).

4. ~~**Rejection notes optional**~~ ✅ **30 Aug**, `1f732be`. **5 of 9 rejections and 2 of 3 approvals remain blank historically** — not backfillable with real reasons, and left as-is deliberately. Approve is still note-optional by design.

5. **Screenshot "optional" copy understates the trade-off.** Optional to submit, mandatory for auto-approval. Say so. **Batch B.**

6. ~~**The auto-approved section does not collapse**~~ ✅ **30–31 Aug**, `1b87962`.

7. **`/admin/coupons` filter row may be clipping controls.** The `PROFILE- REF1- REF2- REF3-` filter chips render cut off at the right edge, yet the page measures **0px page-level overflow** — clipped inside a container rather than pushing the page, and possibly unreachable. **`min-w-0` on `AdminLayout` does not address this failure mode**; it is the opposite one. Same "present but unreachable" shape as B13 #0. **Still not measured.**

### B5 — F3 audit cadence · **still open**
There are **0 unaudited auto-approvals**. Nothing ages an unaudited auto-approval into an alert, and the count being zero is the most dangerous moment to forget that. Options never chosen: a pg_cron job that emails when an auto-approval passes N days unaudited, or folding the count into the existing oversight email. **Decide before the National Championship.**

### B6 — deferred tests · LOW
1. Assert the **verdicts**, not just the flags, in `payment-utr-normalization.spec.ts` and `extraction-grounding.spec.ts`.
2. Assert `PAYMENT_CHECKER_VERSION === 1` in TypeScript. The SQL half is asserted by F2 harness S4, the TS half by nothing.
3. A failure-path test for `useApplyPendingReferral` asserting the code is retained on `rpcError` and on a non-terminal reason.

### B7 — untracked functions in `public` · **MEDIUM**
9 of 53 `public` functions appear in no migration: `admin_create_coupon`, `admin_list_coupons`, `detect_missing_team_snapshots`, `enforce_team_snapshots_on_publication_activate`, `guard_publication_requires_team_snapshots`, `issue_welcome_onboarding_reward`, `resolve_team_tie`, `tg_coupons_set_snapshot`, and `tg_referrals_set_snapshot` (now dropped). Dump each with `pg_get_functiondef`, sanity-check, land one no-behaviour-change "capture drift" migration. **Read-only audit first.**

**Two of these are prime suspects for B16** — the publication guards. That raises B7's priority by association.

`admin_create_coupon` and `admin_list_coupons` both grant EXECUTE to `anon`. Neither is exploitable — both open with a master gate, control-tested `42501` on 28 Aug — but D18's two revoke paths were never closed on them. `redeem_coupon_for_tournament` also grants `anon` EXECUTE and should be checked the same way.

**Also in this sweep:**
- **`bootstrap_master()` is executable by `anon`.** Almost certainly gated internally, but "anon can call the function that creates masters" must be control-tested, not assumed.
- **Residual `anon` write grants on `extraction_review_queue`** (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER). Control-tested inert (`55000 cannot delete from view`); revoke for hygiene. See Y2.
- **`coupon_redemptions_sync_user_id` raises `not_authenticated` unless `auth.role() = 'authenticated'`.** Any SQL harness seeding a redemption from `postgres` must set the role and JWT claims first.

### B8 — brochure category structuring · **MEDIUM, now with a fixture pair**
**8a WITHDRAWN 27 Aug** — `sum_mismatch` is correct and already rank-aware.

**8b** — column-header category names are lost. Shahdol yields 20 categories, 6 named, 14 unnamed, exactly the age-group columns; an earlier run of the same file produced 6 categories and **1 flag**, silently dropping 14 categories and 42 trophies. **Fewer flags meant more data loss (D41).**

**New evidence 30 Aug:** the 1ST VCA RAPID brochure gives a second reproduction, and this one isolates a *different* variable — the same file at two compression levels, `9956d40c…` (7 categories, 6 unnamed) versus `5fb4c2b9…` (named correctly). Build the fixture suite with expected outputs and measure run-to-run **and compression-to-compression** variance before touching any prompt. Judge against expected output, never against flag count. **Sequence with B17.**

### B14 — Resend delivery webhooks · **MEDIUM**
The outbox marks a row `sent` when **Resend accepts** it, not when it arrives. A bounce, spam rejection or dead mailbox all still read `sent`. This matters because the oversight email is the primary auto-approval alert. **Acceptance is not evidence of delivery — the D39 shape applied to email.** Resend webhooks (`email.bounced`, `email.complained`, `email.delivered`) into a small handler would close it. Pairs with the `MAX_ATTEMPTS=5` / no-backoff debt. *(The 30 Aug rejection email did arrive and was read, so the transactional path is currently healthy — but that is one observation, not instrumentation.)*

### B15 — delete the old Resend API key · **LOW**
Rotated 29 Aug; the old key is still live and still the rollback. Before deleting: **Resend → Emails → filter by the old key over the last 30 days.** If the only sends are Prize Manager's, delete. If `certificate-hub.com` or `sportup.online` send through the same account, find their configuration first.

### B1 — `coupons` admin hardening · MEDIUM, defence-in-depth
`authenticated` holds full DML on `coupons` and `coupon_redemptions`; not exploitable because every write policy is master-only, control-tested `42501`. Ordering is the decision (D36 pattern): additive `admin_update_coupon(...)` → frontend off direct table writes → production HAR proving zero PATCH/POST to `/rest/v1/coupons` → revoke and drop the write policies together. **B7 and B1 should be sequenced together.**

### B10 — deleting a user silently orphans their referral history · LOW
`referrals` has no FK on `referrer_id`/`referred_id`; 2 of 6 rows dangle.

### B12 — `self_referral_not_allowed` is unreachable in practice · LOW
Shadowed by the 300-second window. Still refused, so no security gap. **Do not touch `apply_referral_code`** (W3).

### B2 — `master_allowlist` dead grants · LOW, blocked on M1
### B3 — Watermark UI for the master reset · LOW
### B4 — "eight" hardcoded in the oversight email · LOW
`send-payment-notifications/index.ts` states "All eight payment invariants returned pass". Redundant rather than wrong. **Deprioritised five times now** — either do it or delete the entry.

---

## 15–18. Phase 2B / 2C-D / 3 / 4 — unchanged

Phase 2B (bank statement reconciliation) blocked on 2A-3, which is complete. Phase 2C-D (REST API + MCP) blocked on 2B.

**Ordering note:** the path was `F3-C2 → B7 (+B1) → Phase 2B`. **B16 now has a claim to jump the queue** — it is a live organizer-facing failure on the account that will run the National Championship, and two of its prime suspects are B7 functions. Decide explicitly at the start of the next chat rather than defaulting.

### GTM — later / good-to-have

Resend capabilities deliberately **not** adopted now: Broadcasts and Audiences (different compliance surface — needs consent capture, unsubscribe handling, list hygiene); React Email templates for the edge-function emails; a dedicated sending IP (irrelevant at current volume); restyling the Supabase Auth templates (purely cosmetic). None is needed before the National Championship. **B14 is the one email item with a real correctness argument and is tracked as debt, not GTM.**

---

## 19. Tracked debt

| Item | Priority | Detail |
|---|---|---|
| ~~F0a–F0e / F1 / audit / PF1 / F2~~ | ✅ RESOLVED | Phases 2A-3 and F2 |
| ~~`public.referrals` insert raises 42703~~ | ✅ RESOLVED 22 Aug | `20260822120000` |
| ~~Referral error swallowed and code destroyed~~ | ✅ RESOLVED 22 Aug | |
| ~~F2 false auto-approval rate unmeasured~~ | ✅ RESOLVED 26 Aug | **0% across 8 adversarial cases** |
| ~~No way to flag or revoke a bad auto-approval~~ | ✅ RESOLVED 28 Aug | F3-A + F3-B, 33/33 harness |
| ~~No `/admin/payments` UI for auto-approvals~~ | ✅ RESOLVED 28 Aug | F3-C0 + C0b + C1 |
| ~~`/admin/payments` scrolls horizontally~~ | ✅ RESOLVED 29 Aug | `min-w-0` on `AdminLayout.tsx` |
| ~~`extraction_review_queue` readable by `anon`~~ | ✅ RESOLVED 29 Aug | `20260829120000`. 138 rows → 0 |
| ~~Auth email capped at 2/hour~~ | ✅ RESOLVED 29 Aug | Custom SMTP via Resend; now 100/h |
| ~~Rejections can be sent with a blank reason~~ | ✅ **RESOLVED 30 Aug** | `1f732be`. Trim on guard and payload |
| ~~Auto-approved rows do not collapse~~ | ✅ **RESOLVED 30–31 Aug** | `1b87962` |
| **Organizer publish failed for VCA** | **HIGH — B16, new** | Failed before the write; master completed it. National Championship path |
| **10 MB brochure cap forces lossy compression** | **MEDIUM-HIGH — B17, new** | 12.19 MB → 0.47 MB, and the two runs disagree |
| **5 of 9 rejections and 2 of 3 approvals carry a blank note** | Accepted residual | Historical, pre-fix, not backfillable with real reasons |
| **`record_auto_approval_audit` has no history** | LOW — new | It is an upsert on `payment_id`; a re-audit silently replaces the prior record. Consider an append-only log if audit volume ever grows. See Z1 |
| **Old Resend API key not deleted** | LOW — B15 | Rotated 29 Aug; old key still live and unaudited |
| **Resend reports `sent`, not delivered** | MEDIUM — B14 | A bounced oversight email is invisible. D39 shape applied to email |
| **`/admin/coupons` filter chips may be clipped** | MEDIUM — B13 #7 | 0px page overflow but visibly cut. **`min-w-0` does not cover this shape.** Unmeasured |
| **Four UI defects remain** | MEDIUM — B13 | #1, #2, #5 (batch B), #3 (batch C), plus #7 unmeasured |
| **Organizer-facing pages never measured for overflow** | **MEDIUM — new 31 Aug** | The `min-w-0` fix covers `AdminLayout` and therefore the six admin routes only. Dashboard, `/t/:id/setup`, `/t/:id/payment` and `/account` use a different shell and have never been checked |
| **`bootstrap_master()` grants `anon` EXECUTE** | MEDIUM — B7 | Control-test before assuming it is gated |
| **Residual `anon` write grants on `extraction_review_queue`** | LOW — B7 | Control-tested inert (`55000`); revoke for hygiene. See Y2 |
| **`action_taken` can regress server-side** | MEDIUM — X8 | Panel carries the value forward — client half only. Server should refuse the regression. Do it with B7's drift migration |
| **`admin_create_coupon` / `admin_list_coupons` grant `anon` EXECUTE** | MEDIUM — B7 | Not exploitable; D18's two revoke paths never closed on them |
| **Nothing ages an unaudited auto-approval into an alert** | MEDIUM — B5 | Count is 0 today, the easiest moment to forget it |
| **Brochure column-header category names lost** | MEDIUM — B8b | 14 of 20 Shahdol categories unnamed; VCA gives a second, compression-isolating repro |
| **9 untracked functions in `public`** | MEDIUM — B7 | Migration-reading audits are blind to them. Two are B16 suspects |
| **`apply_referral_code` body is untracked drift** | MEDIUM | Measured and left alone (W3) |
| **3 referrals lost between 12 May and 22 Aug** | Accepted residual | Not backfillable |
| **Client under-counts coupon capacity if master re-assigns** | Accepted residual — B13 #3 | No UI does it, master only, zero rows today |
| **Three named invariants have never fired in production** | MEDIUM | `utr_format`, `date_stale`, `required_fields_missing` |
| **`payee_vpa` present in only 7 of 17 extractions** | MEDIUM | Caps the achievable auto-approval rate |
| **`field_flags` readable by its uploader** | MEDIUM | Partial fraud oracle, pre-existing. Bounded |
| **`/extract` has no caller-ownership check** | MEDIUM | Mitigated by the decision living at claim time |
| **`FieldFlag.reason` union in `trustCheck.ts` is stale** | MEDIUM | Compiles only because `tsconfig.app.json` excludes `supabase/functions/` |
| **Gate / helper drift risk** | MEDIUM | Nothing tests `my_payment_gate_status()` (R4) |
| **`is_master()` vs `has_role(auth.uid(),'master')` idiom split** | LOW | Both read the same roles, but a reader will assume they are interchangeable |
| **No layout regression test exists** | MEDIUM | jsdom cannot compute layout, so vitest structurally cannot catch overflow bugs. B13 #0 and #6 were both found by hand. Playwright would cover the class — **new dependency, guardrail 5, decide explicitly before the Championship** |
| `CLAUDE.md` schema drift | MEDIUM | Says v3 active; actual is v5. Missing R1–R7, S1–S8, T1–T6, V1–V8, W1–W4, X1–X9, Y1–Y5, **Z1–Z4** |
| `MAX_ATTEMPTS=5` with no backoff | MEDIUM | Pairs with B14 |
| `/admin/team-snapshots` broken | MEDIUM | `detect_missing_team_snapshots` 404; on the B7 list; **possible B16 cause** |
| `brew unlink node` fragile | MEDIUM | Any `brew upgrade` re-shadows v22 → 9 test failures |
| `tsconfig.app.json` scope gap | MEDIUM | Covers `src/` only |
| **3 local test failures are environment-specific** | LOW | Pass 477/477 in a clean Node v22.22.2 container |
| Deferred verdict + checker-version + referral-failure tests | LOW — B6 | |
| Deleting a user orphans referral rows | LOW — B10 | |
| `self_referral_not_allowed` unreachable | LOW — B12 | |
| `net._http_response` retains ~6 hours | LOW | |
| No watermark UI | LOW — B3 | |
| `as never` RPC casts in `TournamentUpgrade.tsx` | LOW | **Batch B edits this file — watch the per-file tsc count** |
| Direction marker regexes lack `\b` anchors | LOW | Bounded by D27 |
| Stale v2 tests reference `direction_label` | LOW | Pass but mislead |
| `app`/`status_text` grounding nondeterministic | LOW | Cosmetic; excluded from the gate per D28 |
| 122 `extraction_documents` with `uploaded_by` NULL | LOW | Legacy; cannot auto-approve |
| Repo is public | LOW | No secrets committed |
| **Advisory duplicate check fails open** | Accepted residual | Bounded by the hard block + unique index (Q6) |
| **Consistent-but-wrong UTR** | Accepted residual | Only Phase 2B closes this |
| **UTR-only valve** | Accepted residual | No screenshot = no auto-approval |

---

## 20. How to start each new chat

**One chat per workstream.** At every phase boundary: Claude gives an updated `PROJECT_STATE.md` → delete the old one in the Project knowledge panel → upload the new one → open a fresh chat → paste the opening line.

**Division of labour:** design, schema audit and independent verification belong in **chat**; write-run-fix loops on SQL and TypeScript belong in **Claude Code**. The findings that matter come from reading live schema, which is chat's job. **Guardrail 6 matters more with Claude Code, not less.**

**Working rules that do not change:**
- Always `/clear` in Claude Code before a new prompt — **and verify it took.**
- **First command in any new Terminal window is `cd ~/Desktop/prize-manager`.**
- **`npm run dev` is a local server only.** It has no connection to production; stop it with **Ctrl+C**. It does read and write the **live** database, so anything done at `localhost:8080` is real data.
- Edge-function changes need `supabase functions deploy <name>` — Lovable publish ships frontend only (P5). **Confirm the bundle hash changed, not the version number** (Y3).
- **Edge-function secrets are runtime env vars.** Rotating one does *not* require a redeploy.
- **A new database function also needs `notify pgrst, 'reload schema'`** if anything reaches it over PostgREST (T6).
- **Publishing is separate from merging.** A database-only migration is live the moment `supabase db query` runs.
- Use `git --no-pager diff`, never plain `git diff`.
- **Always merge with `git merge --no-ff -m "message" <branch>`.**
- **Before merging, run `git --no-pager diff --name-only main...<branch>`.** An empty result means the branch is already fully merged.
- **After merging, re-run tsc and vitest on `main`.** The merge commit is the first time both changes exist in one tree, and that combination has never been compiled.
- Paste terminal output as **text**, never screenshots.
- **A build report is a claim, not evidence. Require the full `git --no-pager diff`, never a summary of it.**
- **Paste one command per line and wait for each.**
- **Check that a database object has a file behind it.**
- Claude (chat) verifies every Claude Code / Lovable claim against Supabase SQL before advancing.
- `npx tsc -p tsconfig.app.json --noEmit`; **capture the per-file baseline to a file and `diff` against it**, because a total of 12 can stay 12 while one file gains an error and another loses one.
- Before starting a branch: `git status` must be clean.
- Migration workflow: `supabase db query --linked -f <file>` then `supabase migration repair --status applied <version>`. `supabase db execute` does not exist.
- **`RAISE NOTICE` is swallowed.** Put failures in `RAISE EXCEPTION`. **`supabase db query` does print SELECT result tables.**
- **Every migration must self-verify and fail loudly**, in one transaction.
- **Open a migration with a pre-flight that asserts the audited state.**
- **Write guard assertions from measurement, not memory** — and **from the measured baseline, not an expected constant** (Z2).
- **Prove the fix with a test that can only pass if the fix works.** Prefer *matched pairs* — F2 cases 7/7B, F3 B5/B6 and B13/B14, F3-C V12/V13, and now B13 #4's blank / whitespace-only / real-text triple.
- **A negative result needs a control that can produce a positive.** Where live data cannot produce the positive case, force it with a temporary, reverted inversion (B13 #6).
- **A measurement that returns exactly its own cap has told you nothing.**
- **Measure the artifact, not a proxy for it.**
- **Check a large re-indent with a sorted, indentation-stripped diff** (Z3).
- **Never point a destructive or upserting test at the live record** (Z1). Restore through the sanctioned RPC, and say in the record that you restored it.
- **Separate an owned decision from a derived description** (Z4).
- **Isolate capture queries from the case body in a harness.**
- **Check the FKs, not just the indexes, before writing a fixture.**
- **When dropping a column, grep every trigger body on that table first** (D40).
- **A write path with no successful writes for a month is a bug until proven otherwise** (D40).
- **Never let an error handler discard the input that caused the error** (W4).
- **Never redirect a generator onto a tracked file (R7).** Temp file → verify → `cp`.
- **Hash-guard any scripted edit to a tracked file**, and **run it twice to watch the guard fire.**
- **Diff a rewritten function body against the live one before applying.**
- When touching allocation-adjacent files, take a SHA-256 baseline of `supabase/functions/` first and diff it afterwards.
- Additive migration → verify → frontend → verify → restrictive migration. Never the reverse.
- **Do not add new tests at a phase boundary while restoring a baseline.**
- **Do not fix what measurement says is not broken.** Record it as drift and move on (W3).
- **When a vendor surface breaks, rule out your own layers by measurement before touching anything.**
- **When a new finding arrives mid-workstream, log it and finish the batch.** B16, B17 and the B8b fixture pair all surfaced during batch A and none of them was chased; that is why batch A shipped.
