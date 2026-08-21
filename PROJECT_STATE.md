# PROJECT_STATE — Prize Manager · Universal Extraction Engine
**Last updated:** 20 August 2026 · **Owner:** Tushar · **This file is the single source of truth for continuing work in any new chat.**

Replace the previous PROJECT_STATE.md in the repo with this file. Paste it at the start of every new chat to re-establish context.

---

## 1. What this project is

**Prize Manager** (prize-manager.com) is a chess tournament management platform. Phase 1 built a brochure extraction engine: organizer uploads a PDF brochure → two-pass Gemini OCR + structured extraction + deterministic trust/grounding layer → review screen → on Approve, a tournament is created with categories and prizes.

**Phase 2** extends the same engine into a Universal Extraction Engine serving three platforms and eventually external developers. The engine is doc-type-driven; adding a document type requires a new schema row and new trust invariants, not a new pipeline.

**Three-platform context:**
- **prize-manager.com** — Tournament prize management (live). Phase 2A/2A-2/2A-3 added payment screenshot verification, the full payment lifecycle, UTR trust hardening, the profile prerequisite, and **conditional auto-approval, which went live on 20 August 2026.**
- **certificate-hub.com** — Certificate creation, paywalled. Will consume the engine via REST API (Phase 2C).
- **sportup.online** — Discovery + tournament management. Will consume via REST API (Phase 2C).

---

## 2. Key identifiers

| Item | Value |
|---|---|
| Supabase project | `nvjjifnzwrueutbirpde` (ap-south-1, Postgres 17) |
| Edge functions | `extract` (**v47**, bundle `704f5074`), `send-payment-notifications` (**v8**, bundle `ccf8c3be`, `verify_jwt=false`), `commit-extraction` (v13), `sendWelcomeOnboardingEmail` (v20), `allocatePrizes`, `allocateInstitutionPrizes`, `backfillTeamAllocations`, `finalize`, `publicTeamPrizes`, `generatePdf`, `parseWorkbook`, `pmPing` |
| Active extraction schema | v5 (chess_brochure), v3 (payment_screenshot, id `4e8beb4d-4a07-4ef8-a774-18b22f722522`) |
| Repo | github.com/tushar1669/prize-manager (**public**) · `main` at **`a5bebf8`** · `f2a-verdict-table` **merged 20 Aug**, branch may be deleted |
| Gemini model | `GEMINI_MODEL` = `gemini-3.1-flash-lite` |
| Local paths | repo `~/Desktop/prize-manager`, test PDFs `~/Desktop/prize-manager/test-brochures/` |
| Payment trust invariants | 8 in `extract/paymentTrustCheck.ts` · returns `{flags, verdicts}` |
| Checker version | `PAYMENT_CHECKER_VERSION = 1` in `paymentTrustCheck.ts`; the RPC gate pins the literal `1` |
| **F2 kill switch** | `platform_feature_flags.payment_auto_approve` — **`true` since 2026-08-20 17:26:33 UTC**. RLS on, zero policies, `authenticated` cannot read it (control-tested). **Off switch: `supabase/ops/f2_auto_approve_off.sql`** |
| Test baseline | **474 passing / 3 known failures** (conflict-utils ×2, martech-metrics ×1) of 477. **Re-verified on `main` 20 Aug** |
| TypeScript check | `npx tsc -p tsconfig.app.json --noEmit` — **12 pre-existing errors, re-verified 20 Aug.** Root `npx tsc --noEmit` checks nothing |
| pg_cron jobs | jobid 1 `expire-stuck-extraction-documents` (*/10); jobid 2 `drain-payment-notifications` (*/2) |
| Claim RPC | **5-arg only**, `RETURNS uuid`, 1 overload, **15 `RAISE EXCEPTION` across 11 codes** |
| Client grants: `tournament_payments` / `profiles` | `authenticated` SELECT only; `anon` nothing |
| Client grants: `payment_invariant_verdicts` / `platform_feature_flags` / `tournament_player_watermark` | **NOTHING for either role.** RLS on, zero policies. All three owned by `postgres` with `relforcerowsecurity = false`, which is *why* the SECURITY DEFINER RPC can read them |
| Backstop index | `uq_tournament_payments_utr_active` — UNIQUE on `normalize_utr(utr)` WHERE `status <> 'rejected'` |
| Pending index | `uq_tournament_payments_pending` — UNIQUE `(tournament_id, user_id)` WHERE pending |
| Outbox uniqueness | `uq_payment_notification_outbox_payment_action` — UNIQUE **INDEX** on `(payment_id, action)` |
| Verification harnesses | `supabase/tests/f2_gate_checks.sql` — **24 checks**, ends `ERROR: F2 GATE HARNESS RESULTS` (pass condition). **24/24 on 20 Aug**<br>`supabase/tests/f0d_rpc_checks.sql` — 17 branches, `ERROR: HARNESS RESULTS`. 17/17 on 19 Aug<br>`supabase/tests/pf1b_expected_amount.sql` — 9 cases. 9/9 on 19 Aug |
| Operational scripts | `supabase/ops/f2_auto_approve_on.sql` · `f2_auto_approve_off.sql` · `f2_auto_approval_report.sql`. **Not migrations — never `migration repair` them** |
| Design doc | `docs/design/UI_CONVENTIONS.md` — dark-only, enforced by `tests/ui-conventions.spec.ts` |
| Live counts (20 Aug) | **97 live tournaments** (+20 soft-deleted = 117 rows; "97" has always meant live) · 13,699 players · 7 payments · 9 entitlements (**0 `auto_upi`**) · 31 coupons · 174 extraction_documents · 172 extractions · **2 verdict rows** · 6 outbox rows · 36 profiles (**4 with a phone**) · 3 referrals · **0 referral_rewards ever** |
| Platform payee VPA | `9559161414-5@ybl` — hardcoded as `UPI_ID` in `TournamentUpgrade.tsx` **and** held as the `PLATFORM_PAYEE_VPA` secret. Verified in agreement |

### Migrations (all applied, repaired, and version-matched to repo filenames)

| Version | What |
|---|---|
| `20260817120000` | F2-A — `payment_invariant_verdicts` |
| `20260817130000` | F2-B — `source` admits `auto_upi` |
| `20260817140000` | F2-D — outbox `action` admits `auto_approved` |
| `20260817150000` | F2-E — `payment_auto_approve` flag, created disabled |
| `20260817160000` | F2-G — the auto-approval gate |

(F2-C and F2-F were edge-function deploys. The 20 Aug flag flip was an **operational UPDATE**, not a migration.)

### Real frontend routes

| Purpose | Path |
|---|---|
| Tournament landing | `/t/:id/setup?tab=details` |
| Payment page | `/t/:id/payment` |
| Account / profile | `/account` |
| Admin payments | `/admin/payments` |
| Admin users | `/admin/users` |

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
10. NEVER modify `review_tournament_payment`'s core entitlement-insert logic. **F2 mirrors it; it does not call it.**
11. Screenshot upload is OPTIONAL. The UTR-text-only path must keep working. **A claim with no screenshot can never auto-approve** — proven by harness case 6.
12. NEVER expose the **auto-approve kill switch** in frontend code or logs. The payee VPA is necessarily public and is *not* covered by this guardrail.

**Master / admin / auth:** M1–M5. **Phase 2A-2:** N1–N5. **Phase 2A-3:** P1–P6. **F0d:** Q1–Q7. **UI:** U1–U5. **F1:** R1–R7. **Client write-grant audit:** S1–S8. **PF1:** T1–T6.

**F2 — V1–V8 (all now behaviourally or structurally asserted by `f2_gate_checks.sql`):**

V1. **`skipped` is not `pass`.** The gate requires all eight verdicts to read `pass`. Never rewrite it to test for "no `fail`". *Asserted: harness case 3.*

V2. **Every verdict initialises to `"skipped"`** and is overwritten only by a check that actually ran. Never change the initialiser to `"pass"`.

V3. **`PAYMENT_CHECKER_VERSION` must be bumped whenever the invariant set or any invariant's semantics change**, and the constant must match the literal in the RPC gate. *Asserted: harness case 8 (behavioural) and S4 (SQL side). **The TypeScript side is still asserted by nothing** — see backlog B6.*

V4. **The gate contains no `RAISE`.** Census is **15 raises across 11 codes**. *Asserted: harness S1 and S3.*

V5. **`tp.id <> v_payment_id` in the `file_hash` predicate is load-bearing.** Remove it and the gate silently never fires. *Asserted: harness case 7, 7B and S5.*

V6. **Master-submitted claims never auto-approve.** *Asserted: harness case 5.*

V7. **`issue_referral_rewards` must stay mirrored in the F2 path.** *Asserted: harness case 1g and S7.*

V8. **The auto-approval predicate is `status='approved' AND reviewed_by IS NULL`**, plus `source='auto_upi'` on the entitlement. `reviewed_by` must never be set to `auth.uid()`. *Asserted: harness case 1c and S6. Predicate verified clean against history — all 7 pre-F2 payments carry a reviewer, so zero false positives.*

**Phase 2B:**
13. Bank statements are `privacy_class='sensitive'`. NEVER process through Gemini. pdfplumber only.

---

## 4–10. Phases 1, 2A, Workstream C, 2A-2, F0a–F0e, F1, client write-grant audit — COMPLETE

See prior PROJECT_STATE for full detail. Nothing in these changed during F2 closeout. Audit summary: **E1** `issue_referral_rewards` unbounded coupons, **E2** player-count price self-attestation (high-water mark), **E3** `publish_tournament` ownership — all closed 14 Aug. **D38: a SECURITY DEFINER function's EXECUTE grant is a write path RLS cannot see.**

---

## 11. F2 — SHIPPED AND LIVE ✅ (17–20 August 2026)

**Conditional auto-approval went live at `2026-08-20 17:26:33 UTC`.** Merged to `main` as `a5bebf8` (14 files, 1862 insertions).

Seven build pieces (F2-A…F2-G, 17–19 Aug) plus closeout (20 Aug): the harness, the ops scripts, the test-baseline repair, and the flip.

| | Piece | Commit |
|---|---|---|
| F2-A | `payment_invariant_verdicts` | `49bfa5b` |
| F2-B | `source` admits `auto_upi` | `9e6bddf` |
| F2-C | drain handles `auto_approved` | `c73165e` |
| F2-D | outbox `action` admits `auto_approved` | `ea8ec5a` |
| F2-E | kill switch, created off | `8f3f4d1` |
| F2-F | `extract` records verdicts | `965d6e5` |
| F2-G | the gate | `67a411a` |
| F2-H | 24-check gate harness | `c9da84c` |
| F2-I | ops on/off/report scripts | `c230274` |
| F2-J | `{flags}` destructure, baseline restored | `1ae0e21` |

### The harness — `supabase/tests/f2_gate_checks.sql`

One self-aborting statement, 24 checks, everything rolled back. Run: `supabase db query --linked -f supabase/tests/f2_gate_checks.sql`. Pass condition is `24 passed, 0 failed` inside an `ERROR:`.

```
1a-1h  all eight pass, flag ON, organizer, screenshot   → APPROVED + eight sub-assertions:
       price fixture 500/500 · status approved · reviewed_by NULL + reviewed_at set +
       note "Auto-approved." · one entitlement source=auto_upi owner=organizer 365d ·
       exactly 2 outbox rows {approved, auto_approved} · oversight note carries verdicts ·
       issue_referral_rewards ran (level-1 row) · reward linked to a coupon
2      one verdict 'fail' (amount_mismatch)             → pending
3      one verdict 'skipped' (utr_duplicate)            → pending   ← D39
4      flag OFF, all else perfect                       → pending
5      master submits                                   → pending   ← V6
6      no screenshot pinned                             → pending   ← guardrail 11
7      file_hash on a NON-REJECTED payment              → pending   ← V5
7B     same fixture, other payment REJECTED             → APPROVED  ← D15 scoping
8      all eight pass at checker_version = 2            → pending   ← V3
S1-S7  structural: raise census 15 · gate located · gate contains no RAISE ·
       checker_version = 1 pinned · tp.id <> v_payment_id present ·
       reviewed_by = NULL and not auth.uid() · issue_referral_rewards present
S8     kill switch is exactly where it started (leak check)
```

**Cases 7 and 7B are a matched pair** and must be kept together. They differ by one column value and land on opposite sides. Case 7 alone would pass if the fixture were broken in any way; 7B is what makes the pair meaningful.

**Three live rows the harness touches that it did not create, all rolled back:** `profiles.phone` on both fixture users (seeded, never assumed — the f0d "passed by luck" lesson); `platform_feature_flags.payment_auto_approve` (set *inside each case's sub-transaction*, so no case depends on ordering, and S8 proves no leak); and `referrals`, whose trigger is DISABLED for one INSERT and re-enabled immediately — see finding 1 below. `auth.users.email_confirmed_at` is **not** seeded; it is asserted as a precondition with its own abort message.

### Operational scripts — `supabase/ops/`

| File | Purpose |
|---|---|
| `f2_auto_approve_on.sql` | Turns it on. Prints the row. |
| `f2_auto_approve_off.sql` | **The emergency brake.** Safe to run any time, including when already off. Does **not** revoke Pro from anyone already auto-approved. |
| `f2_auto_approval_report.sql` | Read-only. Every auto-approval with organizer, amount, UTR, file_hash, whether Pro is still active, oversight email status, and **the exact eight verdicts the gate acted on**. Self-aborting so output is forced through the CLI. Dry-run verified 20 Aug returning `0 total`. |

**These are not migrations.** Never `migration repair` them.

### Five findings from F2 closeout

**1. `public.referrals` cannot be inserted into. Referral capture has been silently dead since ~19 April 2026.**
`trg_referrals_set_snapshot` reads `new.referred_email` and `new.referred_label`; `pg_attribute` shows exactly 2 dropped columns on that table. Every insert raises `42703 record "new" has no field "referred_email"`. Verified with a rolled-back insert, not by reading code. 3 referrals rows exist, all predating the drop; **`referral_rewards` has zero rows ever.** **Not backfillable** — the referral link is never recorded, so lost signups cannot be recovered. Fix is the next workstream.

**2. Both live verdict rows decline, correctly, and re-confirm D39 on real data.**
```
9a773dfc  utr_format=skipped  utr_duplicate=skipped        6 pass / 2 skipped → DECLINE
f9dd011e  payee_vpa_missing=fail  payee_vpa_mismatch=skipped  6/1/1          → DECLINE
```
The first is the CRED receipt: **zero flags fired**, so a flags-only rule would have auto-approved a ₹500 claim from a receipt that never printed a UTR. The second shows the intended asymmetry — VPA *missing* **fails** while *mismatch* **skips**, because you cannot compare a value that is not there.

**3. The V8 predicate is clean against history.** All 7 pre-F2 payments (2 approved, 5 rejected) carry a non-null `reviewed_by`. `status='approved' AND reviewed_by IS NULL` therefore has zero false positives from history, and every row the report returns was approved by the gate.

**4. `max(uuid)` does not exist in Postgres** — the first harness run failed on it, and because that one line sat inside case 1's capture block it took all eight of case 1's assertions down with it, reporting a single opaque FAIL. **Generalisation: isolate capture queries from the case body.** The harness now wraps the referral capture in its own handler and reports a capture failure distinctly from a real V7 failure, and case 1's error branch dumps what it managed to capture.

**5. F2 touches zero files under `src/`.** The whole feature is database and edge function. Lovable publishes were no-ops for it. This is the concrete reason F2-4 (the admin auto-approved view) is still open.

### Practical note on auto-approval rate

`payee_vpa` is present in only **7 of 17** payment extractions. Absent VPA **fails** (does not skip), so it is a hard decline. Bank-account transfers — PhonePe's "Transfer to 3561XXXXXXX3993, Union Bank Of India" — carry no VPA and can never auto-approve. That is correct security behaviour and must not be loosened (guardrail 3), but it caps the achievable rate. **The PRD's >70% target must be re-derived from real post-launch data.** The historical sample is dominated by deliberate test and attack screenshots and is not representative.

### D39 — the governing decision

**D39 — Absence of a flag is not evidence a check passed (Accepted 17 Aug 2026; extends D22, D27, D28).**
Five of the eight invariants have skip paths. A gate reading "no allow-listed reason is present" auto-approves every one. `extract` therefore records a verdict per named invariant and F2 requires all eight to read `pass`.
**The asymmetry is deliberate:** the duplicate and price RPCs fail **open** for the *flag* (advisory) and **closed** for the *verdict* (authoritative, money-bearing).
**Accepted cost:** false declines rise. Three of the eight invariants have never fired in production; anything landing in `skipped` sends an honest payer to manual review. A false decline costs a click; a false approval costs revenue and is invisible.

---

## 12. Immediate next step

**Fix the `referrals` trigger. Fresh chat. Small, self-contained, one migration.**

`trg_referrals_set_snapshot` references two dropped columns and raises `42703` on every insert. Drop the dead references. Then verify by inserting a referral inside a rolled-back block and watching it succeed — the same probe that found it, run in reverse.

Two things to check while in there, neither assumed:
- Whether any application code path inserts into `referrals` (signup, `use-apply-pending-referral`), and whether that path swallows the error or surfaces it.
- Whether `referral_codes` and the reward chain are otherwise healthy. `issue_referral_rewards` was proven end-to-end by harness case 1g/1h — it mints a coupon correctly once a referral row exists — so the *only* broken link is the insert.

**After that: F3, the auto-approval oversight loop** (§13, B5).

**Opening line for the next chat:**

> *Continue the Prize Manager project. Read PROJECT_STATE.md §11 and §12. F2 is SHIPPED AND LIVE — conditional auto-approval turned on 20 Aug 17:26 UTC, merged to `main` at `a5bebf8`, gate harness 24/24, baselines re-verified at 474/3 and tsc 12. Guardrails V1–V8 are now each asserted by a named harness check. Next workstream: repair `trg_referrals_set_snapshot`, which references two dropped columns and has been raising 42703 on every insert into `public.referrals` since ~19 April — referral capture is silently dead and `referral_rewards` has zero rows ever. Audit before code: confirm the dropped columns, find every code path that inserts into `referrals`, and check whether the error is swallowed. Show me the plan before writing the migration.*

---

## 13. Backlog — carried forward, NOT forgotten

### B5 — F3, the auto-approval oversight loop · **agreed 20 Aug, scheduled after the referrals fix**

The evidence trail already exists in full — payment row, entitlement, screenshot, file hash, and the eight verdicts frozen at the code version that produced them. `f2_auto_approval_report.sql` is the lens. What is missing is the ability to *act* on what it shows.

- **F3-A — `payment_auto_approval_audit`.** One row per audited auto-approval: `payment_id` PK, `outcome` CHECK (`ok` | `loophole` | `uncertain`), `reason`, `action_taken`, `audited_by`, `audited_at`. Same lockdown shape as `payment_invariant_verdicts`: RLS on, zero policies, no client grants, written only by a master-only SECURITY DEFINER RPC `record_auto_approval_audit(...)`.
- **F3-B — `revoke_auto_entitlement(payment_id, reason)`.** Sets the entitlement's `ends_at = now()` rather than deleting it, so the evidence survives. Flips the payment to `rejected`, which fires the existing `AFTER UPDATE OF status` trigger and emails the organizer with no new wiring. **Open question: does Tushar want the organizer emailed on revocation, or a quieter path?** Must not touch `review_tournament_payment` (guardrail 10).
- **F3-C — `/admin/payments` auto-approved section.** Closes F2-4. Predicate `status='approved' AND reviewed_by IS NULL`, verified clean against history. Backend is done; this is frontend-only.

**The feedback loop is already closed by construction and does not need building.** When an auto-approval turns out to be a loophole, the fix is always to strengthen an invariant or add a ninth — which means bumping `PAYMENT_CHECKER_VERSION` to 2, which automatically invalidates every verdict written by the old code. Harness case 8 proves that. F3 only adds the flagging and the revocation on top.

### B6 — two tests deliberately deferred at the F2 phase boundary · LOW
Withdrawn on 20 Aug rather than smuggled into a baseline-restoring commit, because adding them would have moved the 474 number at exactly the moment PROJECT_STATE was being written around it. Do them inside F3:
1. **Assert the verdicts, not just the flags,** in `payment-utr-normalization.spec.ts` and `extraction-grounding.spec.ts`. Both now destructure `{ flags }` and ignore `verdicts` entirely; verdict logic has only F2-F's stubbed coverage.
2. **Assert `PAYMENT_CHECKER_VERSION === 1`** in TypeScript. V3 requires the constant to match the RPC literal; the SQL half is asserted by harness S4, the TS half by nothing.

### B1 — `coupons` admin hardening · MEDIUM, defence-in-depth
Not currently exploitable — `coupons`, `coupon_redemptions` and `tournament_entitlements` hold client write grants but are fully closed by master-only RLS, control-tested `42501`. F2 raised the stakes slightly: `tournament_entitlements` now has a second writer, and F3-B would add a third. Ordering is the decision (D36 pattern), never revoke before the write path exists: additive `admin_update_coupon(...)` → frontend off direct table writes → **production HAR proving zero PATCH/POST to `/rest/v1/coupons`** → revoke and drop the write policies together.

### B2 — `master_allowlist` dead grants · LOW, blocked on M1
Full client write grants, zero write policies, so closed today. Requires an explicit M1 exception. One-line migration when cleared.

### B3 — Watermark UI for the master reset · LOW
`master_reset_player_watermark(uuid)` works (520 → 294 in test) but is SQL-only. Add a control on `/admin/tournaments` when that page is next touched.

### B4 — "eight" hardcoded in the oversight email · LOW
`send-payment-notifications/index.ts` states "All eight payment invariants returned pass". The count is also enforced by the verdict CHECK, in another file. Largely self-correcting: the RPC writes the itemised verdicts into the outbox row's `review_note`, which the email renders, so the static line is redundant rather than wrong. Drop the count when that file is next touched.

---

## 14–17. Phase 2B / 2C-D / 3 / 4 — unchanged

Phase 2B (bank statement reconciliation) blocked on 2A-3, which is **now complete**. Phase 2C-D (REST API + MCP) blocked on 2B. See PHASE2_PRD.md.

**Ordering note:** with F2 shipped, Phase 2A-3 is closed. The path is: referrals fix → F3 → Phase 2B.

---

## 18. Tracked debt

| Item | Priority | Detail |
|---|---|---|
| ~~F0a–F0e / F1 / 33-table audit / PF1 / verdict recording / named-reason gate / `file_hash` / outbox action / `source` CHECK~~ | ✅ RESOLVED | Phases 2A-3 and F2 |
| ~~Seven-case gate harness not written~~ | ✅ RESOLVED | 24 checks, 24/24, `f2_gate_checks.sql` |
| ~~vitest / tsc not re-run since F2-F~~ | ✅ RESOLVED | Both call sites destructured; 474/3 and 12 re-verified on `main` |
| **`public.referrals` insert raises 42703** | **HIGH — next workstream** | Referral capture dead since ~19 April; zero rewards ever; not backfillable |
| **No `/admin/payments` UI for auto-approvals** | **MEDIUM — F3-C** | F2 shipped with zero `src/` changes. Backend done, frontend not started |
| **No way to flag or revoke a bad auto-approval** | MEDIUM — F3-A/B | Evidence exists; the ability to act on it does not |
| **Three named invariants have never fired in production** | MEDIUM | `utr_format`, `date_stale`, `required_fields_missing`. Only fixtures exercise those branches |
| **`payee_vpa` present in only 7 of 17 extractions** | MEDIUM | Caps the achievable auto-approval rate. PRD's >70% target needs re-deriving from real data |
| **`field_flags` readable by its uploader** | MEDIUM | Partial fraud oracle, pre-existing. Bounded — verdicts are unreachable. Revoking column SELECT would break the brochure review screen |
| **`/extract` has no caller-ownership check** | MEDIUM | `document_id` and `tournament_id` both caller-supplied. Mitigated by the decision living at claim time, not eliminated |
| **`FieldFlag.reason` union in `trustCheck.ts` is stale** | MEDIUM | Missing three reasons that are pushed anyway. Compiles only because `tsconfig.app.json` excludes `supabase/functions/`. F2's verdict keys are deliberately not derived from it |
| **PRD / ARCHITECTURE carry stale content** | MEDIUM | Both still say the grant audit follows F2 (it preceded it). ARCHITECTURE §2.4 shows an early `return` that is not shipped code. F2-5's "Edge Function secret" must be amended to the feature flag. Add D39, the F2 sections, and the go-live date |
| **Gate / helper drift risk** | MEDIUM | `my_payment_gate_status()` vs the RPC gate (R4). Nothing tests the helper side |
| `CLAUDE.md` schema drift | MEDIUM | Says v3 active; actual is v5. Missing R1–R7, S1–S8, T1–T6, V1–V8 |
| `MAX_ATTEMPTS=5` with no backoff | MEDIUM | A brief Resend outage permanently loses a notification. **Now more consequential: the oversight email is the primary auto-approval alert.** `f2_auto_approval_report.sql` is the backstop — run it periodically rather than trusting email alone |
| `/admin/team-snapshots` broken | MEDIUM | `detect_missing_team_snapshots` 404; page calls `is_master(uuid)`, DB function is `is_master()` |
| `brew unlink node` fragile | MEDIUM | Any `brew upgrade` re-shadows v22 → 9 test failures. Confirmed healthy at v22.19.0 on 20 Aug |
| `tsconfig.app.json` scope gap | MEDIUM | Covers `src/` only |
| Deferred verdict + checker-version tests | LOW — B6 | |
| `net._http_response` retains ~6 hours | LOW | Live-health tool, not an audit log |
| No watermark UI | LOW — B3 | |
| `as never` RPC casts in `TournamentUpgrade.tsx` | LOW | |
| Direction marker regexes lack `\b` anchors | LOW | Bounded by D27 |
| Stale v2 tests reference `direction_label` | LOW | Pass but mislead |
| `app`/`status_text` grounding nondeterministic | LOW | Cosmetic; excluded from the gate per D28 |
| 122 `extraction_documents` with `uploaded_by` NULL | LOW | Legacy (≤20 Jul). Land `amount_mismatch = skipped`, so they cannot auto-approve |
| Repo is public | LOW | No secrets committed. The payee VPA is public by necessity |
| Two parallel session paths | LOW | 16 call sites read token via `supabase.auth.getSession()` directly |
| **Advisory duplicate check fails open** | Accepted residual | Bounded by the hard block + unique index (Q6). The **verdict** does not fail open |
| **Consistent-but-wrong UTR** | Accepted residual | Only Phase 2B closes this |
| **UTR-only valve** | Accepted residual | No screenshot = no mismatch check by construction, and no auto-approval (harness case 6) |

---

## 19. How to start each new chat

**One chat per workstream.** At every phase boundary: Claude gives an updated `PROJECT_STATE.md` → delete the old one in the Project knowledge panel → upload the new one → open a fresh chat → paste the opening line.

**Working rules that do not change:**
- Always `/clear` in Claude Code before a new prompt — **and verify it took.**
- **First command in any new Terminal window is `cd ~/Desktop/prize-manager`.**
- Edge-function changes need `supabase functions deploy <name>` — Lovable publish ships frontend only (P5). **Confirm the bundle hash changed.**
- **A new database function also needs `notify pgrst, 'reload schema'`** if anything reaches it over PostgREST (T6).
- **Publishing is separate from merging.** A database-only migration is live the moment `supabase db query` runs — and so is an operational UPDATE like the F2 flag flip.
- Use `git --no-pager diff`, never plain `git diff`.
- **Always merge with `git merge --no-ff -m "message" <branch>`.**
- **Before merging, run `git --no-pager diff --name-only main...<branch>`** and check for files that also changed on `main`. Finding a conflict during the merge command is the worst time to find it.
- Paste terminal output as **text**, never screenshots.
- Claude (chat) verifies every Claude Code / Lovable claim against Supabase SQL before advancing.
- `npx tsc -p tsconfig.app.json --noEmit`; verify the 12-error baseline by stashing, not assuming.
- Before starting a branch: `git status` must be clean.
- Migration workflow: `supabase db query --linked -f <file>` then `supabase migration repair --status applied <version>`. `supabase db execute` does not exist.
- **`RAISE NOTICE` is swallowed** by both `supabase db query --linked` and Supabase MCP `execute_sql`. Put failures in `RAISE EXCEPTION`. **`supabase db query` does print SELECT result tables** — confirmed 20 Aug.
- **Every migration must self-verify and fail loudly**, in one transaction, so a failed proof rolls the whole thing back.
- **Write guard assertions from measurement, not memory.** Query the current state first, then assert it.
- **Prove the fix with a test that can only pass if the fix works.** Prefer *matched pairs* that differ by one value and must land on opposite sides — harness cases 7/7B are the model.
- **Isolate capture queries from the case body in a harness**, so one bad line cannot collapse eight assertions into one opaque failure.
- **Diff a rewritten function body against the live one before applying.**
- **Hash-guard any scripted edit to a tracked file**, and **run it twice to watch the guard fire**. For a one-token `sed`, the equivalent is: grep the pattern and confirm the exact expected count *before*, then confirm `0` remaining and a 1-insertion/1-deletion diff *after*.
- **Prefer `git apply` over a pasted heredoc** for multi-file source edits.
- **Prefer deleting a duplicated rule to synchronising it.**
- When touching allocation-adjacent files, take a SHA-256 baseline of `supabase/functions/` first and diff it afterwards.
- **Never redirect a generator onto a tracked file (R7).** Temp file → verify → `cp`.
- Additive migration → verify → frontend → verify → restrictive migration. Never the reverse.
- **Do not add new tests at a phase boundary while restoring a baseline.** Restore the number first, add coverage in the next workstream (B6).
