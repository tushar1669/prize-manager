# PROJECT_STATE — Prize Manager · Universal Extraction Engine
**Last updated:** 27 August 2026 · **Owner:** Tushar · **This file is the single source of truth for continuing work in any new chat.**

Replace the previous PROJECT_STATE.md in the repo with this file. Paste it at the start of every new chat to re-establish context.

---

## 1. What this project is

**Prize Manager** (prize-manager.com) is a chess tournament management platform. Phase 1 built a brochure extraction engine: organizer uploads a PDF brochure → two-pass Gemini OCR + structured extraction + deterministic trust/grounding layer → review screen → on Approve, a tournament is created with categories and prizes.

**Phase 2** extends the same engine into a Universal Extraction Engine serving three platforms and eventually external developers. The engine is doc-type-driven; adding a document type requires a new schema row and new trust invariants, not a new pipeline.

**Three-platform context:**
- **prize-manager.com** — Tournament prize management (live). Phase 2A/2A-2/2A-3 added payment screenshot verification, the full payment lifecycle, UTR trust hardening, the profile prerequisite, and **conditional auto-approval, live since 20 August 2026.**
- **certificate-hub.com** — Certificate creation, paywalled. Will consume the engine via REST API (Phase 2C).
- **sportup.online** — Discovery + tournament management. Will consume via REST API (Phase 2C).

---

## 2. Key identifiers

| Item | Value |
|---|---|
| Supabase project | `nvjjifnzwrueutbirpde` (ap-south-1, Postgres 17) |
| Edge functions | `extract` (**v47**, bundle `704f5074`), `send-payment-notifications` (**v8**, bundle `ccf8c3be`, `verify_jwt=false`), `commit-extraction` (v13), `sendWelcomeOnboardingEmail` (v20), `allocatePrizes`, `allocateInstitutionPrizes`, `backfillTeamAllocations`, `finalize`, `publicTeamPrizes`, `generatePdf`, `parseWorkbook`, `pmPing` |
| Active extraction schema | v5 (chess_brochure), v3 (payment_screenshot, id `4e8beb4d-4a07-4ef8-a774-18b22f722522`) |
| Repo | github.com/tushar1669/prize-manager (**public**) · `main` at **`1ee42db`** (referrals repair merge, 22 Aug) · previous `main` `57e2b09` · F2 merge `a5bebf8` |
| Gemini model | `GEMINI_MODEL` = `gemini-3.1-flash-lite` |
| Local paths | repo `~/Desktop/prize-manager`, test PDFs `~/Desktop/prize-manager/test-brochures/` |
| Payment trust invariants | 8 in `extract/paymentTrustCheck.ts` · returns `{flags, verdicts}` |
| Checker version | `PAYMENT_CHECKER_VERSION = 1` in `paymentTrustCheck.ts`; the RPC gate pins the literal `1` |
| **F2 kill switch** | `platform_feature_flags.payment_auto_approve` — **`true` since 2026-08-20 17:26:33 UTC**. RLS on, zero policies, `authenticated` cannot read it (control-tested). **Off switch: `supabase/ops/f2_auto_approve_off.sql`** |
| **`public.referrals` triggers** | **ZERO, by design, since `20260822120000`.** Do not re-add one — see W1 |
| Test baseline | **474 passing / 3 known failures** (conflict-utils ×2, martech-metrics ×1) of 477 on Tushar's machine. **Those 3 are environment-specific** — a clean Node v22.22.2 container runs 477/477. Treat 474/3 as the local baseline and 477 as the total |
| TypeScript check | `npx tsc -p tsconfig.app.json --noEmit` — **12 pre-existing errors, re-verified 22 Aug by stashing.** Root `npx tsc --noEmit` checks nothing |
| pg_cron jobs | jobid 1 `expire-stuck-extraction-documents` (*/10); jobid 2 `drain-payment-notifications` (*/2) |
| Claim RPC | **5-arg only**, `RETURNS uuid`, 1 overload, **15 `RAISE EXCEPTION` across 11 codes** |
| Client grants: `tournament_payments` / `profiles` / `referrals` | `authenticated` SELECT only; `anon` SELECT only on `referrals`, nothing on the other two |
| Client grants: `payment_invariant_verdicts` / `platform_feature_flags` / `tournament_player_watermark` | **NOTHING for either role.** RLS on, zero policies. All three owned by `postgres` with `relforcerowsecurity = false`, which is *why* the SECURITY DEFINER RPC can read them |
| Backstop index | `uq_tournament_payments_utr_active` — UNIQUE on `normalize_utr(utr)` WHERE `status <> 'rejected'` |
| Pending index | `uq_tournament_payments_pending` — UNIQUE `(tournament_id, user_id)` WHERE pending |
| Outbox uniqueness | `uq_payment_notification_outbox_payment_action` — UNIQUE **INDEX** on `(payment_id, action)` |
| Verification harnesses | `supabase/tests/f2_gate_checks.sql` — **24 checks**, ends `ERROR: F2 GATE HARNESS RESULTS` (pass condition). **24/24 re-confirmed live on 22 Aug after the trigger removal; end-to-end production validation 25-26 Aug**<br>`supabase/tests/f0d_rpc_checks.sql` — 17 branches, `ERROR: HARNESS RESULTS`. 17/17 on 19 Aug<br>`supabase/tests/pf1b_expected_amount.sql` — 9 cases. 9/9 on 19 Aug |
| Operational scripts | `supabase/ops/f2_auto_approve_on.sql` · `f2_auto_approve_off.sql` · `f2_auto_approval_report.sql`. **Not migrations — never `migration repair` them** |
| Design doc | `docs/design/UI_CONVENTIONS.md` — dark-only, enforced by `tests/ui-conventions.spec.ts` |
| Live counts (26 Aug) | **105 live tournaments** (128 rows) · 15,553 players · 11 payments (**1 auto-approved**) · 12 entitlements (**1 `auto_upi`**, 8 `coupon`) · 42 coupons · 193 extraction_documents · 191 extractions · 8 verdict rows · 11 outbox rows · 38 users / 38 profiles (8 with a phone) · **6 referrals** · **5 referral_rewards** · 13 referral_codes |
| Platform payee VPA | `9559161414-5@ybl` — hardcoded as `UPI_ID` in `TournamentUpgrade.tsx` **and** held as the `PLATFORM_PAYEE_VPA` secret. Verified in agreement |

### Migrations (all applied, repaired, and version-matched to repo filenames)

| Version | What |
|---|---|
| `20260817120000` | F2-A — `payment_invariant_verdicts` |
| `20260817130000` | F2-B — `source` admits `auto_upi` |
| `20260817140000` | F2-D — outbox `action` admits `auto_approved` |
| `20260817150000` | F2-E — `payment_auto_approve` flag, created disabled |
| `20260817160000` | F2-G — the auto-approval gate |
| **`20260822120000`** | **Drop the dead `trg_referrals_set_snapshot` trigger and its function** |

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

**Master / admin / auth:** M1–M5. **Phase 2A-2:** N1–N5. **Phase 2A-3:** P1–P6. **F0d:** Q1–Q7. **UI:** U1–U5. **F1:** R1–R7. **Client write-grant audit:** S1–S8. **PF1:** T1–T6. **F2:** V1–V8 (each asserted by a named check in `f2_gate_checks.sql`).

**Referrals — W1–W4 (new, 22 August 2026):**

W1. **`public.referrals` carries no trigger, and must not acquire one casually.** The table's only writer is `apply_referral_code`, which supplies every column. Any future BEFORE INSERT trigger must be added *with* a rolled-back insert proving inserts still succeed — the exact failure this workstream repaired went undetected for three months. `f2_gate_checks.sql` cases 1g/1h seed a referral directly and are the first thing that breaks if this is violated.

W2. **Dropping a column must drop or amend every trigger that writes it.** `ALTER TABLE ... DROP COLUMN` does not check trigger bodies; PL/pgSQL resolves `new.<field>` at execution time, so the breakage is invisible until the next insert. See D40.

W3. **`apply_referral_code` is deliberately unmodified.** Its live body contains an `email_confirmed_at` check, a 300-second attribution window, and `ON CONFLICT (referred_id) DO NOTHING` that appear in **no migration**. Investigated 22 Aug and left alone: the window passes for the canonical flow, because clicking the confirmation link *is* the sign-in, so the delta is ≈0. Changing it would weaken an anti-abuse check on an unproven hypothesis (guardrail 3). Tracked as drift in §18, not as a bug.

W4. **A swallowed RPC error must never also destroy its input.** `useApplyPendingReferral` cleared localStorage and `user_metadata` unconditionally after the RPC, so a failure erased the only copy of the code. Retention on non-terminal outcomes is now the contract; the terminal set is `applied`, `already_applied`, `self_referral_not_allowed`, `invalid_code`.

**Phase 2B:**
13. Bank statements are `privacy_class='sensitive'`. NEVER process through Gemini. pdfplumber only.

---

## 4–10. Phases 1, 2A, Workstream C, 2A-2, F0a–F0e, F1, client write-grant audit — COMPLETE

See prior PROJECT_STATE for full detail. Audit summary: **E1** `issue_referral_rewards` unbounded coupons, **E2** player-count price self-attestation (high-water mark), **E3** `publish_tournament` ownership — all closed 14 Aug. **D38: a SECURITY DEFINER function's EXECUTE grant is a write path RLS cannot see.**

---

## 11. F2 — SHIPPED AND LIVE ✅ (17–20 August 2026)

**Conditional auto-approval went live at `2026-08-20 17:26:33 UTC`.** Merged to `main` as `a5bebf8` (14 files, 1862 insertions).

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
1a-1h  all eight pass, flag ON, organizer, screenshot   → APPROVED + eight sub-assertions
2      one verdict 'fail' (amount_mismatch)             → pending
3      one verdict 'skipped' (utr_duplicate)            → pending   ← D39
4      flag OFF, all else perfect                       → pending
5      master submits                                   → pending   ← V6
6      no screenshot pinned                             → pending   ← guardrail 11
7      file_hash on a NON-REJECTED payment              → pending   ← V5
7B     same fixture, other payment REJECTED             → APPROVED  ← D15 scoping
8      all eight pass at checker_version = 2            → pending   ← V3
S1-S7  structural assertions
S8     kill switch is exactly where it started (leak check)
```

**Cases 7 and 7B are a matched pair** and must be kept together.

**Amended 22 Aug:** the referral seed for cases 1g/1h no longer disables a trigger around its INSERT, because `trg_referrals_set_snapshot` no longer exists. Two `EXECUTE 'ALTER TABLE ... DISABLE/ENABLE TRIGGER'` lines were removed and the header comment updated. Re-run confirmed **24/24**.

### Operational scripts — `supabase/ops/`

| File | Purpose |
|---|---|
| `f2_auto_approve_on.sql` | Turns it on. Prints the row. |
| `f2_auto_approve_off.sql` | **The emergency brake.** Safe any time. Does **not** revoke Pro from anyone already auto-approved. |
| `f2_auto_approval_report.sql` | Read-only. Every auto-approval with the exact eight verdicts the gate acted on. Dry-run verified 20 Aug returning `0 total`. |

**These are not migrations.** Never `migration repair` them.

### D39 — the governing decision

**D39 — Absence of a flag is not evidence a check passed (Accepted 17 Aug 2026; extends D22, D27, D28).**
Five of the eight invariants have skip paths. A gate reading "no allow-listed reason is present" auto-approves every one. `extract` therefore records a verdict per named invariant and F2 requires all eight to read `pass`. **The asymmetry is deliberate:** the duplicate and price RPCs fail **open** for the *flag* (advisory) and **closed** for the *verdict* (authoritative). **Accepted cost:** false declines rise. A false decline costs a click; a false approval costs revenue and is invisible.

### Practical note on auto-approval rate

`payee_vpa` is present in only **7 of 17** payment extractions. Absent VPA **fails**, so it is a hard decline. Bank-account transfers carry no VPA and can never auto-approve. Correct behaviour, but it caps the achievable rate. **The PRD's >70% target must be re-derived from real post-launch data.**

---

## 12. Referrals repair — COMPLETE ✅ (22 August 2026)

Referral capture was dead. This workstream restored it. Scope was deliberately held to what was **proven** broken.

### What was actually wrong

`public.tg_referrals_set_snapshot()` populated `new.referred_email` and `new.referred_label`. Migration `20260512184720` (**12 May 2026 18:47 UTC**, statements 7–8, a security-hardening batch titled "Drop unused sensitive snapshot columns from referrals") dropped both columns and left the trigger attached. Every INSERT into `public.referrals` raised `42703 record "new" has no field "referred_email"` from that instant.

Reproduced live before any code was written, in a rolled-back block. Reverse-probed the same way: with the trigger out of the way the insert succeeded, 3 → 4 rows, rolled back, trigger verified still enabled afterwards.

### The fix — `20260822120000_fix_referrals_dead_trigger.sql`

**Dropped, not repaired.** The function body did nothing except populate two columns that no longer exist; there was no behaviour left to preserve. Dropping the function as well as the trigger stops it being re-attached later.

The migration is one transaction with five sections: a **pre-flight** asserting exactly 2 dropped columns and exactly 1 trigger and 1 function (so a stale audit aborts rather than applies), the two `DROP`s, a **structural post-check**, a **behavioural proof** that inserts a real referral inside a nested sub-transaction and unwinds it with a sentinel exception, and a **leak check** asserting `referrals` still holds 3 rows. Any failure rolls the whole thing back.

Blast radius verified rather than assumed: that trigger was the only object in `public` or `auth` mentioning either column name, the only non-internal trigger on the table, and nothing in `src/` or `supabase/functions/` references either name.

### The second bug — the hook destroyed its own input

`src/hooks/useApplyPendingReferral.ts` is the only caller. It destructured `rpcError` and **never checked it**; the value surfaced only in a `console.log` behind `isDebugReferrals()`, which is **false on prize-manager.com** (true only on localhost, 127.0.0.1, preview, or `?debug_referrals=1`). Meanwhile the cleanup ran **unconditionally after the RPC**: remove `pm_referral_code`, remove `pm_referral_signup_intent`, null `user_metadata.pending_referral_code`.

So every failure erased all three copies of the code. **That is the real mechanism behind "not backfillable"** — not passive loss but active destruction of the only copy, on a path nobody could see.

Now: a hard `rpcError` retains every copy and warns; a successful-but-declining call retains unless the reason is in the terminal set (`applied`, `already_applied`, `self_referral_not_allowed`, `invalid_code`). The existing test `tests/use-apply-pending-referral.spec.ts` mocks `applied` and `already_applied`, both terminal, so it is unaffected — confirmed by running the suite with the change in place.

### What was investigated and deliberately NOT changed

**The 300-second attribution window in `apply_referral_code`.** The live body carries an `email_confirmed_at` check, a window requiring `abs(last_sign_in_at − email_confirmed_at) ≤ 300`, and `ON CONFLICT (referred_id) DO NOTHING`. **None of it appears in any migration** — migration `20260219173643` defines the function without all three. It was edited directly against the live database.

The dates initially looked suspicious: last referral row **19 April**, columns dropped **12 May** — a 23-day gap. But measurement did not support the hypothesis. Across all 36 users the median `|last_sign_in_at − email_confirmed_at|` is **45 seconds**, and 20 of 36 pass the window right now. For the canonical flow the window is not tight at all: clicking the confirmation link *is* the sign-in, so the delta is ≈0. The 23-day gap is adequately explained by volume — only 14 signups since 19 April, referral links shared informally.

**Left alone under guardrail 3.** Widening it would weaken an anti-abuse check on an unproven theory. Recorded as drift in §18, not as a bug. See W3.

**`tg_coupons_set_snapshot`, the sibling trigger.** Same author, same era, same snapshot pattern, and also absent from every migration — so it was checked, not assumed. `public.coupons` has **zero** dropped columns and the trigger touches only live ones (`origin`, `issued_to_user_id`, `issued_to_email`). Healthy. No action.

### D40 — the governing decision

**D40 — A trigger that writes a column is a dependency of that column, and Postgres will not tell you (Accepted 22 Aug 2026).**

`ALTER TABLE ... DROP COLUMN` succeeds without inspecting trigger bodies. PL/pgSQL resolves `new.<field>` at execution time, so a trigger left holding a dropped column stays perfectly valid until the next insert — then fails every time. Nothing in the migration output, the schema, or any linter reports it.

The failure shape is the one this project keeps meeting, and it is the same shape as **D21** (master could not read extraction rows) and **D32** (a failed query rendering blank): *a surface that produces nothing is not obviously broken.* Here it was worse than silent, because the sole caller swallowed the error and destroyed the evidence.

**Three practices this makes standing rules:**
1. **When dropping a column, grep every trigger body on that table first** — `pg_get_functiondef` over `pg_trigger`, not the repo, because the object may not be in the repo at all.
2. **A write path with no successful writes for a month is a bug until proven otherwise.** `referral_rewards` had zero rows ever and that was carried in the docs as a fact rather than an alarm.
3. **Never let an error handler discard the input that caused the error.** Retry is impossible afterwards, and so is diagnosis.

### The provenance finding

Neither the trigger nor its function ever appeared in a repo migration — and they are not alone. **9 of 53 functions in `public` exist only in the live database:**

`admin_create_coupon`, `admin_list_coupons`, `detect_missing_team_snapshots`, `enforce_team_snapshots_on_publication_activate`, `guard_publication_requires_team_snapshots`, `issue_welcome_onboarding_reward`, `resolve_team_tie`, `tg_coupons_set_snapshot`, `tg_referrals_set_snapshot` (now dropped).

This is why the bug survived: **every audit that reads migrations is blind to these.** Note `detect_missing_team_snapshots` on that list — §18 already carries "`/admin/team-snapshots` broken, `detect_missing_team_snapshots` 404" as separate debt, and its untracked origin is very likely the same story. Tracked as a new workstream in §13 (B7).

---

## 12.5 End-to-end production validation — COMPLETE ✅ (25–26 August 2026)

The repair was verified in the product, on live money, not just in SQL. **This is the first time the referral system has ever been observed working.**

### The chain

Four accounts using Gmail plus-addressing (`tusharsaraswat68+r1/r2/r3@gmail.com`), each signed up through the previous one's referral link:

```
tusharsaraswat68  →  +r1  →  +r2  →  +r3
```

All four `referrals` rows carry `referral_code_id` whose owner matches `referrer_id` — attribution integrity is exact, verified by join.

### What fired

**+r3 paid ₹500 by UPI and was auto-approved with no human involvement.** Payment `30ba866e`, UTR `660369142867`, `reviewed_by` NULL, `review_note = "Auto-approved."`, entitlement `auto_upi` 2026-08-25 → 2027-08-25, both outbox rows (`approved` + `auto_approved`) sent first attempt. All eight verdicts `pass` at `checker_version = 1`. **F2's first real auto-approval on live money.**

That payment issued the **first three `referral_rewards` rows in the project's history**: 100% to +r2, 50% to +r1, 25% to the root.

**+r2 then redeemed their 100% coupon** (`REF1-4DC17AB9`), taking ₹500 → ₹0 with `source='coupon'`. That redemption **cascaded a second wave** — 100% to +r1, 50% to the root — proving `redeem_coupon_for_tournament` fires `issue_referral_rewards` exactly as paying does.

Final: **5 reward rows, 2 distinct triggers, 0 rewards missing a coupon, 5 `REF%` coupons, 1 redeemed.**

### Adversarial testing — 8 cases, all correct

| Test | Result |
|---|---|
| Coupon reuse | blocked — limit reached |
| Another user's coupon | blocked — "not assigned to your account" |
| Duplicate UTR | blocked — F0d hard block |
| UTR-only, no screenshot | pending, never auto-approved (guardrail 11) |
| Wrong amount (₹1 vs ₹500) | pending — `amount_mismatch` |
| Wrong payee VPA | pending — `payee_vpa_mismatch` |
| Fraud-oracle check | organizer saw generic text only; itemised reasons master-side only (F2-2) |
| Free tier | verified at boundaries: 150→₹0, 151→₹500, 500→₹500, 501→₹1000 |

**The load-bearing assertion:** across all 11 payments, exactly **one** is `approved` with `reviewed_by IS NULL`, and it is the legitimate auto-approval. **Zero false auto-approvals.** That is the F2 success metric, met on real adversarial input.

### Self-referral is refused, but not by the guard you would expect

Probed directly (rolled back) as `+r1` applying `+r1`'s own code: returns `not_new_signup_event`, **not** `self_referral_not_allowed`. The 300-second window is evaluated first, so the self-referral branch is unreachable for anyone who has signed in more than once. Outcome is still a refusal, so there is no security gap. Recorded as B12; `apply_referral_code` stays unmodified (W3).

### Client write surface, from a production HAR

A browser HAR captured across the whole test run contains only OPTIONS and GET — no POST bodies — so it is **not** sufficient evidence for B1. But the CORS preflight `Access-Control-Request-Method` headers reveal intent:

| Table | Preflighted methods |
|---|---|
| `coupons` | **GET only** |
| `referrals` / `referral_rewards` | **GET only** |
| `extraction_documents` | GET + POST |
| `extractions` | GET + PATCH |
| `tournaments` | GET + PATCH |

Coupon redemption went through `rpc/redeem_coupon_for_tournament`, not a table write — **one of B1's preconditions met**, though a single session is not proof of the whole app. Also visible: `rpc/issue_welcome_onboarding_reward`, one of the nine untracked B7 functions, live on the signup path.

---

## 13. Immediate next step

**F3 — the auto-approval oversight loop.** Fresh chat. See B5 below.

**Opening line for the next chat:**

> *Continue the Prize Manager project. Read PROJECT_STATE.md §11, §12, §12.5 and §13. F2 is shipped and live (20 Aug); `main` is `1ee42db`. The referrals repair shipped 22 Aug (`20260822120000`) and was **validated end to end in production on 25–26 Aug**: a 4-deep referral chain, F2's first real auto-approval on live money, the first 5 `referral_rewards` rows ever, a coupon-redemption cascade, and 8 adversarial tests with zero false auto-approvals. `apply_referral_code` remains deliberately unmodified (W3). Next workstream: F3, the auto-approval oversight loop (B5) — `payment_auto_approval_audit`, `revoke_auto_entitlement`, and the `/admin/payments` auto-approved section that closes F2-4. **F3-C now has five concrete UI defects waiting for it — see B13.** Audit before code: run `supabase/ops/f2_auto_approval_report.sql` and confirm it now returns exactly 1 auto-approval. Show me the plan before writing the migration.*

---

## 14. Backlog — carried forward, NOT forgotten

### B5 — F3, the auto-approval oversight loop · **next workstream**

The evidence trail already exists in full — payment row, entitlement, screenshot, file hash, and the eight verdicts frozen at the code version that produced them. `f2_auto_approval_report.sql` is the lens. What is missing is the ability to *act* on what it shows.

- **F3-A — `payment_auto_approval_audit`.** One row per audited auto-approval: `payment_id` PK, `outcome` CHECK (`ok` | `loophole` | `uncertain`), `reason`, `action_taken`, `audited_by`, `audited_at`. Same lockdown shape as `payment_invariant_verdicts`: RLS on, zero policies, no client grants, written only by a master-only SECURITY DEFINER RPC `record_auto_approval_audit(...)`.
- **F3-B — `revoke_auto_entitlement(payment_id, reason)`.** Sets the entitlement's `ends_at = now()` rather than deleting it, so the evidence survives. Flips the payment to `rejected`, which fires the existing `AFTER UPDATE OF status` trigger. **Open question: does Tushar want the organizer emailed on revocation, or a quieter path?** Must not touch `review_tournament_payment` (guardrail 10).
- **F3-C — `/admin/payments` auto-approved section.** Closes F2-4. Predicate `status='approved' AND reviewed_by IS NULL`, verified clean against history. Backend done; frontend not started.

**The feedback loop is already closed by construction.** When an auto-approval turns out to be a loophole, the fix is to strengthen an invariant or add a ninth — which bumps `PAYMENT_CHECKER_VERSION` to 2, which invalidates every verdict written by the old code. Harness case 8 proves that.

### B6 — two tests deliberately deferred · LOW, do inside F3
1. **Assert the verdicts, not just the flags,** in `payment-utr-normalization.spec.ts` and `extraction-grounding.spec.ts`.
2. **Assert `PAYMENT_CHECKER_VERSION === 1`** in TypeScript. The SQL half is asserted by harness S4, the TS half by nothing.

Add a third while in there: **a failure-path test for `useApplyPendingReferral`** asserting the code is retained on `rpcError` and on a non-terminal reason. Not added on 22 Aug because no test covered those paths before and adding one at a fix boundary moves the baseline.

### B7 — nine untracked functions in `public` · **MEDIUM, new 22 Aug**
9 of 53 `public` functions appear in no migration and exist only in the live database, so migration-reading audits cannot see them. One of them (`tg_referrals_set_snapshot`) had been broken for three months. Two more (`admin_create_coupon`, `admin_list_coupons`) are on the coupons write path that B1 concerns, and `detect_missing_team_snapshots` is already known-broken in §18. Work: dump each with `pg_get_functiondef`, sanity-check it against the tables it touches, and land them as one no-behaviour-change "capture drift" migration so the repo matches reality. **Read-only audit first; do not rewrite a working function to make a document tidy.**

### B13 — five UI defects found in production validation · **MEDIUM, all belong to F3-C**

Found by using the product, not by reading it. All five confirmed at source.

1. **"Awaiting admin approval" is shown on an auto-approved payment.** `TournamentUpgrade.tsx:472` hardcodes the toast; the claim RPC returns only a uuid so the frontend cannot tell. The access query then refreshes and line 660 adds "already has Pro access". Two contradictory messages, the first one false. **This is the user-visible face of F2 shipping with zero `src/` changes.** Fix by re-reading payment status after submit and branching the message — do **not** change the RPC's return type (it is 5-arg `RETURNS uuid`, guardrail).
2. **`/account` is a dead end from the payment gate.** `TournamentUpgrade.tsx:734` is a bare `<Link to="/account">`; `Account.tsx` has no `return_to`, no `searchParams`, no `navigate(-1)`. The `returnToForClaim` mechanism (D20/L6) already exists and was simply never applied here.
3. **Spent coupons still look available.** `Account.tsx:284` selects coupons by `issued_to_user_id` and never joins `coupon_redemptions`; `is_active` stays `true` after redemption. Proven: `REF1-4DC17AB9` has `times_used = 1` and still reads active, so the owner sees a 100% coupon that will be refused.
4. **Rejection notes are optional but are the only channel that explains a rejection.** All three rejections on 26 Aug emailed an **empty** reason because the note was skipped. The design is right — generic at submit (F2-2), specific at rejection (L3) — but the dialog lets you skip the only field that carries it. Make it required, or add canned reasons ("Wrong UPI ID", "Amount does not match", "Screenshot unreadable").
5. **Screenshot "optional" copy understates the trade-off.** It is optional to submit and mandatory for auto-approval. Say so: "Optional. Without a screenshot your payment waits for manual approval."

### B8 — brochure category structuring + `sum_mismatch` false positive · **MEDIUM, new 26 Aug**

Two separate defects, both fully diagnosed against live extractions.

**8a — WITHDRAWN 27 Aug. `sum_mismatch` is correct and already rank-aware.** The 26 Aug entry claimed a false positive on rank ranges. That was wrong, and it was inferred from arithmetic without checking whether the flag had actually fired. Verified since:

- `trustCheck.ts` already computes `span = rank_to − rank_from + 1` and adds `amount × span`. The fix I was about to write is in the code and deployed.
- **Shahdol raised no `sum_mismatch` at all** — its 15 flags are all `ungrounded`. Rank-aware sum ₹51,000 = declared ₹51,000, so the check correctly stayed silent.
- Vijaywada's flag records `expected: 530000` against `stated: 800000`. Recomputing the payload rank-aware gives **exactly ₹530,000**, matching the deployed function. That flag is a **true positive** — the extraction genuinely missed ₹270,000 of prizes.

No code change. The lesson is recorded rather than the fix: an invariant is only proven to misfire when the flag is observed firing on data known to be correct.

**8b — column-header category names are lost.** The model names categories that have row labels or section headings, and fails on categories printed as **column headers** in a wide grid. Shahdol: 20 categories found, 6 named, **14 unnamed** — exactly the 14 age-group columns (BEST UNDER 07/09/11/13/15/17/19 × BOYS and GIRLS). Vijaywada fails identically.

**The dangerous part:** an earlier run of the same file produced 6 categories and **1 flag**, which looked clean but had **silently dropped all 14 age-group categories and their 42 trophies**. The 15-flag run is the *better* extraction — it found all 20 categories and all 59 prize rows (cross-checked against the brochure's advertised "56 Attractive trophies", which the August extraction matches exactly). **Fewer flags meant more data loss.**

Work: build a brochure fixture suite with expected outputs and measure run-to-run variance **first**; then address Pass-2 category naming. Add a structural invariant so a null category name fails once, clearly, instead of emitting N generic `ungrounded` flags that bury the real problem.

Evidence: `80f12c60-8682-43d8-890f-bc051bccaf0e` (20 cats / 15 flags) vs `33cd41e2-7185-4bdc-b01d-03c070442a6f` (6 cats / 1 flag), same file, same model.

### B10 — deleting a user silently orphans their referral history · LOW
`referrals` has no FK on `referrer_id`/`referred_id`, so 2 of 6 rows now point at users that no longer exist. **Predates this session** — the pre-delete audit showed 0 referrals for both accounts removed on 26 Aug. Decide whether to add FKs with `ON DELETE SET NULL`, or accept it and make reports orphan-aware.

### B12 — `self_referral_not_allowed` is unreachable in practice · LOW
Shadowed by the 300-second window, which is evaluated first; a self-referral attempt returns `not_new_signup_event`. Refusal still occurs, so there is no security gap. **Do not touch `apply_referral_code`** (W3).

### B1 — `coupons` admin hardening · MEDIUM, defence-in-depth
Not currently exploitable — `coupons`, `coupon_redemptions` and `tournament_entitlements` hold client write grants but are fully closed by master-only RLS, control-tested `42501`. Ordering is the decision (D36 pattern), never revoke before the write path exists: additive `admin_update_coupon(...)` → frontend off direct table writes → **production HAR proving zero PATCH/POST to `/rest/v1/coupons`** → revoke and drop the write policies together. Note B7 overlaps: `admin_create_coupon`/`admin_list_coupons` are untracked.

### B2 — `master_allowlist` dead grants · LOW, blocked on M1
Full client write grants, zero write policies, so closed today. Requires an explicit M1 exception.

### B3 — Watermark UI for the master reset · LOW
`master_reset_player_watermark(uuid)` works (520 → 294 in test) but is SQL-only.

### B4 — "eight" hardcoded in the oversight email · LOW
`send-payment-notifications/index.ts` states "All eight payment invariants returned pass". Redundant rather than wrong — the RPC writes itemised verdicts into the outbox row's `review_note`. Drop the count when that file is next touched.

---

## 15–18. Phase 2B / 2C-D / 3 / 4 — unchanged

Phase 2B (bank statement reconciliation) blocked on 2A-3, which is **complete**. Phase 2C-D (REST API + MCP) blocked on 2B. See PHASE2_PRD.md.

**Ordering note:** F2 shipped and the referrals repair is done. The path is: **F3 → B7 → Phase 2B.**

---

## 19. Tracked debt

| Item | Priority | Detail |
|---|---|---|
| ~~F0a–F0e / F1 / 33-table audit / PF1 / verdict recording / named-reason gate / `file_hash` / outbox action / `source` CHECK~~ | ✅ RESOLVED | Phases 2A-3 and F2 |
| ~~Seven-case gate harness not written~~ | ✅ RESOLVED | 24 checks, 24/24 |
| ~~`public.referrals` insert raises 42703~~ | ✅ **RESOLVED 22 Aug** | `20260822120000`. Trigger and function dropped, behavioural proof in the migration |
| ~~Referral error swallowed and code destroyed~~ | ✅ **RESOLVED 22 Aug** | `useApplyPendingReferral` retains on non-terminal outcomes and warns |
| **3 referrals lost between 12 May and 22 Aug are unrecoverable** | Accepted residual | The code was destroyed client-side on each failure, so nothing records who referred whom. **Not backfillable.** 14 signups fell in the window; an unknown subset carried a code |
| ~~Referral system never observed working end to end~~ | ✅ **RESOLVED 26 Aug** | 4-deep chain, first auto-approval on live money, first 5 `referral_rewards` rows, coupon-redemption cascade, 8 adversarial tests. See §12.5 |
| ~~F2 false auto-approval rate unmeasured~~ | ✅ **RESOLVED 26 Aug** | 8 adversarial cases; exactly 1 `approved` + `reviewed_by IS NULL` across all 11 payments, and it is the legitimate one. **0% false auto-approval** |
| ~~`sum_mismatch` fires on correct data (rank ranges)~~ | ✅ **WITHDRAWN 27 Aug — not a defect** | The check is already rank-aware in `trustCheck.ts` and deployed. Shahdol raised no `sum_mismatch`; vijaywada's is a true positive (`expected: 530000` matches a rank-aware recompute of the payload). The 26 Aug entry inferred a false positive from arithmetic without checking whether the flag fired |
| **Brochure column-header category names are lost** | MEDIUM — B8b | 14 of 20 Shahdol categories unnamed. An earlier run of the same file silently dropped those 14 entirely while showing only 1 flag — **fewer flags, more data loss** |
| **Five UI defects from production validation** | MEDIUM — B13 | Auto-approval shows "awaiting admin approval"; `/account` dead end; spent coupons look available; rejection notes optional; screenshot "optional" copy. All belong to F3-C |
| **Deleting a user orphans their referral rows** | LOW — B10 | No FK on `referrer_id`/`referred_id`; 2 of 6 rows now dangle. Predates this session |
| **`self_referral_not_allowed` unreachable** | LOW — B12 | Shadowed by the 300s window. Still refused, no security gap |
| **`apply_referral_code` body is untracked drift** | MEDIUM | Live body has an `email_confirmed_at` check, a 300s attribution window and `ON CONFLICT` that appear in no migration. **Measured and left alone** (median delta 45s; 20/36 pass now; canonical flow ≈0). Capture it in B7's drift migration with **zero behaviour change** |
| **9 untracked functions in `public`** | MEDIUM — B7 | Migration-reading audits are blind to them. This is how the trigger bug survived three months |
| **No `/admin/payments` UI for auto-approvals** | MEDIUM — F3-C | F2 shipped with zero `src/` changes |
| **No way to flag or revoke a bad auto-approval** | MEDIUM — F3-A/B | Evidence exists; the ability to act on it does not |
| **Three named invariants have never fired in production** | MEDIUM | `utr_format`, `date_stale`, `required_fields_missing` |
| **`payee_vpa` present in only 7 of 17 extractions** | MEDIUM | Caps the achievable auto-approval rate. PRD's >70% target needs re-deriving |
| **`field_flags` readable by its uploader** | MEDIUM | Partial fraud oracle, pre-existing. Bounded — verdicts are unreachable |
| **`/extract` has no caller-ownership check** | MEDIUM | Mitigated by the decision living at claim time, not eliminated |
| **`FieldFlag.reason` union in `trustCheck.ts` is stale** | MEDIUM | Compiles only because `tsconfig.app.json` excludes `supabase/functions/` |
| **Gate / helper drift risk** | MEDIUM | `my_payment_gate_status()` vs the RPC gate (R4). Nothing tests the helper side |
| `CLAUDE.md` schema drift | MEDIUM | Says v3 active; actual is v5. Missing R1–R7, S1–S8, T1–T6, V1–V8, W1–W4 |
| `MAX_ATTEMPTS=5` with no backoff | MEDIUM | The oversight email is the primary auto-approval alert. `f2_auto_approval_report.sql` is the backstop |
| `/admin/team-snapshots` broken | MEDIUM | `detect_missing_team_snapshots` 404; page calls `is_master(uuid)`, DB function is `is_master()`. **Note: that function is on the B7 untracked list** |
| `brew unlink node` fragile | MEDIUM | Any `brew upgrade` re-shadows v22 → 9 test failures |
| `tsconfig.app.json` scope gap | MEDIUM | Covers `src/` only |
| **3 local test failures are environment-specific** | LOW — new 22 Aug | conflict-utils ×2 and martech-metrics ×1 fail on Tushar's machine but pass 477/477 in a clean Node v22.22.2 container. Worth 20 minutes some day; not a code defect |
| Deferred verdict + checker-version + referral-failure tests | LOW — B6 | |
| `net._http_response` retains ~6 hours | LOW | |
| No watermark UI | LOW — B3 | |
| `as never` RPC casts in `TournamentUpgrade.tsx` | LOW | Also present on the `apply_referral_code` call |
| Direction marker regexes lack `\b` anchors | LOW | Bounded by D27 |
| Stale v2 tests reference `direction_label` | LOW | Pass but mislead |
| `app`/`status_text` grounding nondeterministic | LOW | Cosmetic; excluded from the gate per D28 |
| 122 `extraction_documents` with `uploaded_by` NULL | LOW | Legacy. Land `amount_mismatch = skipped`, so they cannot auto-approve |
| Repo is public | LOW | No secrets committed |
| Two parallel session paths | LOW | 16 call sites read token via `supabase.auth.getSession()` directly |
| **Advisory duplicate check fails open** | Accepted residual | Bounded by the hard block + unique index (Q6) |
| **Consistent-but-wrong UTR** | Accepted residual | Only Phase 2B closes this |
| **UTR-only valve** | Accepted residual | No screenshot = no auto-approval (harness case 6) |

---

## 20. How to start each new chat

**One chat per workstream.** At every phase boundary: Claude gives an updated `PROJECT_STATE.md` → delete the old one in the Project knowledge panel → upload the new one → open a fresh chat → paste the opening line.

**Working rules that do not change:**
- Always `/clear` in Claude Code before a new prompt — **and verify it took.**
- **First command in any new Terminal window is `cd ~/Desktop/prize-manager`.**
- Edge-function changes need `supabase functions deploy <name>` — Lovable publish ships frontend only (P5). **Confirm the bundle hash changed.**
- **A new database function also needs `notify pgrst, 'reload schema'`** if anything reaches it over PostgREST (T6).
- **Publishing is separate from merging.** A database-only migration is live the moment `supabase db query` runs.
- Use `git --no-pager diff`, never plain `git diff`.
- **Always merge with `git merge --no-ff -m "message" <branch>`.**
- **Before merging, run `git --no-pager diff --name-only main...<branch>`** and check for files that also changed on `main`.
- Paste terminal output as **text**, never screenshots.
- Claude (chat) verifies every Claude Code / Lovable claim against Supabase SQL before advancing.
- `npx tsc -p tsconfig.app.json --noEmit`; verify the 12-error baseline by stashing, not assuming.
- Before starting a branch: `git status` must be clean.
- Migration workflow: `supabase db query --linked -f <file>` then `supabase migration repair --status applied <version>`. `supabase db execute` does not exist.
- **`RAISE NOTICE` is swallowed** by both `supabase db query --linked` and Supabase MCP `execute_sql`. Put failures in `RAISE EXCEPTION`. **`supabase db query` does print SELECT result tables.**
- **Every migration must self-verify and fail loudly**, in one transaction, so a failed proof rolls the whole thing back.
- **Open a migration with a pre-flight that asserts the audited state.** If the database has moved since the audit, it must abort rather than apply — `20260822120000` is the model.
- **Write guard assertions from measurement, not memory.** Query the current state first, then assert it.
- **Prove the fix with a test that can only pass if the fix works.** Prefer *matched pairs* — harness cases 7/7B are the model. For a repair, **the probe that found the bug, run in reverse**, is the strongest available proof.
- **When dropping a column, grep every trigger body on that table first** (D40) — using `pg_get_functiondef`, not the repo, because the object may not be in the repo.
- **A write path with no successful writes for a month is a bug until proven otherwise** (D40).
- **Never let an error handler discard the input that caused the error** (W4).
- **Isolate capture queries from the case body in a harness.**
- **Diff a rewritten function body against the live one before applying.**
- **Hash-guard any scripted edit to a tracked file**, and **run it twice to watch the guard fire.**
- **Prefer `git apply` over a pasted heredoc** for multi-file source edits.
- **Prefer deleting a duplicated rule to synchronising it.**
- When touching allocation-adjacent files, take a SHA-256 baseline of `supabase/functions/` first and diff it afterwards.
- **Never redirect a generator onto a tracked file (R7).** Temp file → verify → `cp`.
- Additive migration → verify → frontend → verify → restrictive migration. Never the reverse.
- **Do not add new tests at a phase boundary while restoring a baseline.**
- **Do not fix what measurement says is not broken.** Record it as drift and move on — see W3.
