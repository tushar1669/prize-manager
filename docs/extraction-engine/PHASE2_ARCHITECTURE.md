# Architecture — Phase 2: Universal Extraction Engine

**Status:** Accepted — Phase 2A, 2A-2 complete; F0a–F0e complete; F1 complete; **F2 (conditional auto-approval) SHIPPED AND LIVE 20 Aug 2026 17:26:33 UTC**; **referrals repair complete 22 Aug 2026, validated end to end in production 25–26 Aug 2026**. Phase 2A-3 is closed.
**Date:** July–August 2026 (last revised 27 Aug 2026)
**Deciders:** Tushar (owner), Claude (architecture)
**Predecessor:** `docs/extraction-engine/ARCHITECTURE.md` (Phase 1 — read this first)
**Repo location:** `docs/extraction-engine/PHASE2_ARCHITECTURE.md`

---

## 1. System Overview

Phase 2 extends the Phase 1 extraction engine by adding new doc_types. The orchestration pipeline (upload → OCR → structured extraction → trust layer → review) is unchanged. New doc_types add only: a new `extraction_schemas` row, new grounding branches, and new trust invariants.

```
Phase 1 (unchanged):
  chess_brochure → tournament + categories + prizes   [commit-extraction]

Phase 2A (complete):
  payment_screenshot → evidence on tournament_payments [review_tournament_payment]

Phase 2A-2 (complete):
  payment lifecycle → notification outbox + email + dashboard banner + admin surface

Phase 2A-3 (COMPLETE):
  F0a close extractions UPDATE policy        [DONE  2 Aug 2026]
  F0b payment_screenshot schema v2 -> v3     [DONE  3 Aug 2026]
  F0c three new trust invariants             [DONE  3 Aug 2026]
  F0d UTR match + duplicate hard-block       [DONE  4 Aug 2026]
  F0e payment-page failure states            [DONE  6 Aug 2026]
  F0d closeout: parity + tests + UI guard    [DONE  9 Aug 2026]
  F1  profile verification prerequisite      [DONE 13 Aug 2026]
  E1-E3 client write-grant audit             [DONE 14 Aug 2026]
  PF1 pricing basis consolidation            [DONE 16 Aug 2026]
  F2  conditional auto-approval gate         [LIVE 20 Aug 2026]

Referrals repair (COMPLETE 22 Aug 2026):
  drop dead trg_referrals_set_snapshot + stop the caller destroying its input

Phase 2B (unblocked):
  bank_statement → reconciliation report               [new read-only view]

Phase 2C-D (blocked on 2B):
  REST API + MCP → external access to all doc_types    [new api_keys table + wrapper]
```

**Critical constraint:** `payment_screenshot` and `bank_statement` extractions must NEVER flow into `commit-extraction` or `commit_extraction_transaction`. Those RPCs write to `tournaments/categories/prizes`. Payment data has its own commit path.

---

## 2. Phase 2A — Payment Screenshot Verifier (COMPLETE)

### 2.1 Flow as built

```
Organizer (TournamentUpgrade.tsx)
    │ 0. [F1-B2] my_payment_gate_status() pre-flight — Submit disabled unless ok
    │ 1. [OPTIONAL] Upload screenshot → extraction-uploads/{uid}/payments/{tournament_id}/{uuid}{ext}
    │ 2. Enter UTR text (pre-filled from extraction if available; user-editable)
    ▼
[If screenshot provided]:
    Upload to bucket → insert extraction_documents → POST /extract → extraction_id
    /extract records {flags, verdicts}; verdicts land in payment_invariant_verdicts
    ▼
RPC: submit_tournament_payment_claim(tournament_id, amount_inr, utr, screenshot_extraction_id, return_to)
    │ validates owner, [F1-B3] profile gate, canonical price, UTR length ≥6,
    │ one-pending-per-tournament, F0d UTR duplicate/mismatch block,
    │ then [F2-G] the auto-approval gate
    ▼
tournament_payments (status='pending' | 'approved')

AFTER UPDATE OF status trigger → enqueue_payment_notification() → payment_notification_outbox
pg_cron (*/2) → send-payment-notifications edge fn → Resend email

Master → /admin/payments → PendingPaymentsPanel + All Payments
    │ Master clicks Approve
    ▼
RPC: review_tournament_payment(payment_id, 'approve', note)  ← UNCHANGED
```

### 2.2 Extraction schema — payment_screenshot v3 (current)

```json
{
  "type": "object",
  "required": ["amount_inr", "utr"],
  "properties": {
    "amount_inr":   { "type": "number" },
    "utr":          { "type": "string" },
    "txn_date":     { "type": "string", "format": "date" },
    "payee_vpa":    { "type": "string" },
    "payee_name":   { "type": "string" },
    "payer_name":   { "type": "string" },
    "txn_id":       { "type": "string" },
    "status_text":  { "type": "string" },
    "app":          { "type": "string" }
  }
}
```

### 2.3 The 8 trust invariants (current)

All live in `extract/paymentTrustCheck.ts`, which returns `{flags, verdicts}`.

| Invariant | What it checks |
|---|---|
| `utr_format` | 8–22 alphanumeric, whitespace-stripped. **Frozen** (Q5). |
| `utr_duplicate` | Server-side lookup via `utr_active_duplicate_exists`. Independent of `utr_format` (Q4). Flag fails open; **verdict does not** (D39). |
| `amount_mismatch` | Extracted amount = expected ± ₹1, coupon-aware |
| `payee_vpa_mismatch` | Extracted VPA = `PLATFORM_PAYEE_VPA` secret |
| `payee_vpa_missing` | VPA null — closes the D22 fail-open |
| `date_stale` | `txn_date` not older than 30 days |
| `direction_not_outgoing` | Outgoing must be PROVEN — see D27 |
| `required_fields_missing` | amount + UTR + date all null |

### 2.4 Extraction status for payment screenshots

Every `payment_screenshot` extraction exits `needs_review`. `auto_ok` is unreachable for this doc_type and always has been.

**This is not the auto-approval decision point.** Auto-approval is decided later and elsewhere, inside `submit_tournament_payment_claim` at claim time, by reading `payment_invariant_verdicts` (D39). Earlier revisions of this document showed an early `return` in `/extract` as the mechanism; **that was never shipped code** and is removed here to stop it being cited as the design.

---

## 3. Phase 2A-2 — Payment Lifecycle (COMPLETE)

### 3.1 Notification architecture

1. **`payment_notification_outbox`** — one row per (payment_id, action), unique index enforces exactly-once. `pending → sending → sent | failed | skipped`. RLS: master read-only. Actions include `approved`, `rejected`, and `auto_approved` (F2-D).
2. **`enqueue_payment_notification()`** — SECURITY DEFINER, `AFTER UPDATE OF status` on `tournament_payments`. Snapshots `profiles.email`, `review_note`, `return_to`. `ON CONFLICT DO NOTHING`.
3. **`send-payment-notifications`** — `verify_jwt=false`, constant-time shared-secret auth, batch drain of 20, `MAX_ATTEMPTS=5`. Drained every 2 minutes.
4. **`reap_stuck_payment_notifications()`** — resets `sending` rows >10 min back to `failed`.

**Why a trigger rather than enqueue inside `review_tournament_payment`:** Guardrail 10 forbids touching that RPC. The trigger catches every future writer — **including F2's auto-approval path, which needed no additional wiring at all.** That prediction held exactly.

### 3.2 Admin payments surface

`PendingPaymentsPanel` (queue) and the All Payments table on `/admin/payments`. Shared component `src/components/payments/PaymentEvidence.tsx`. Screenshot signed on click, 3600s expiry.

**Still open:** no auto-approved section. F2 shipped with zero `src/` changes, so F2-4 remains unbuilt. Tracked as F3-C.

### 3.3 RLS policies added in this phase

| Policy | Table |
|---|---|
| `Masters read all extraction files` | `storage.objects` |
| `Masters read all extraction documents` | `extraction_documents` |
| `Masters read all extractions` | `extractions` |
| `payment_notification_outbox` master read | `payment_notification_outbox` |

**RLS defect found and fixed (D21):** these three must always be added together.

---

## 4. Phase 2B — Bank Statement Reconciliation (planned, now unblocked)

Bank statements are `privacy_class='sensitive'`. Free-tier cloud models are prohibited. pdfplumber (Python, free) for Pass 1. Scanned PDFs receive a graceful error. Where pdfplumber runs is still open — see D4.

---

## 5. Phase 2C–D — REST API + MCP Server (planned)

New tables: `api_keys`, `api_usage_logs`. New edge function `extract-api`. Three MCP tools. Multi-tenant isolation via `uploaded_by = api_key.owner_id`. See D7.

---

## 6. Decision Log

**D1 — Screenshot upload is optional in Phase 2A (Accepted).**

**D2 — Commit path: FK linkage, not a new edge function (Accepted).**

**D3 — Force `needs_review` always (SUPERSEDED by D8).**

**D4 — Bank statements: pdfplumber only, no Gemini (Accepted).**

**D5 — `payee_vpa` stored as Supabase secret (Accepted).**

**D6 — `tournament_id` passed to `/extract` for payment screenshots (Accepted).**

**D7 — Phase 2A scope: Prize Manager only (Accepted).**

**D8 — Conditional auto-approval (Accepted 26 Jul 2026; supersedes D3; SHIPPED 20 Aug 2026).**
Auto-approves ONLY when all eight named invariant verdicts read `pass`, the payer meets the F1 gate, and the kill switch is on. Every auto-approval writes an oversight record and emails chess.tushar@gmail.com. **Amended:** governance is a database feature flag, not an Edge Function secret — see D39 and PRD F2-5.

**D9 — Auth resolution must fail safe (Accepted 26 Jul 2026).**

**D10 — Role gates must check `authzStatus` before `is_master` (Accepted 26 Jul 2026).** Completed as D16.

**D11 — Payment screenshots: tournament-scoped path in existing bucket (Accepted 28 Jul 2026).**

**D12 — Payment status notification: email via Resend outbox + in-app banner (Accepted 28 Jul 2026).**

**D13 — `/admin/payments` is its own route (Accepted 28 Jul 2026).**

**D14 — Extracted UTR pre-fills but never overrides the user (Accepted 28 Jul 2026).**

**D15 — Rejection is non-terminal; attempts are retained (Accepted 28 Jul 2026).**

**D16 — `useAuth` promoted to `AuthProvider` context (Accepted 29 Jul 2026).** Shipped `a245902`.

**D17 — Notification layer: dedicated outbox table + DB trigger + cron-drained sender (Accepted 29 Jul 2026).**

**D18 — Function grant hygiene: both revoke paths, always (Accepted 29 Jul 2026).**
Two independent grant paths: `PUBLIC` and the direct default-privilege grant to `anon`/`authenticated`. Both must be closed in every migration that creates or replaces a function.

**D19 — Secret rotation for edge functions is a three-place, ordered operation (Accepted 30 Jul 2026).**

**D20 — L6 flow resumption needs `return_to` store (Accepted 30 Jul 2026).**

**D21 — Master RLS read defect: extraction rows were invisible to master (Fixed 2 Aug 2026).**
**Lesson:** an admin panel that displays nothing is not obviously broken.

**D22 — `payee_vpa` null is fail-open, not verified (Fixed in F0c).**

**D23 — Payment screenshot schema needs v2 (Decided 2 Aug 2026).** Partially superseded by D27.

**D24 — Three fail-open trust layer paths require new invariants (Implemented as F0c).**

**D25 — `extractions` UPDATE policy must be investigated (Resolved by D29).**

**D26 — Pass-1 OCR is a structured semantic digest, NOT a verbatim transcription (2–3 Aug 2026).**
**Corollary:** when designing a new field, check what Pass 1 actually emits before assuming the model can transcribe it.

**D27 — Direction is derived by regex over `ocr_text` (Accepted 3 Aug 2026).**
> Outgoing is PROVEN if EITHER `payee_vpa` equals `PLATFORM_PAYEE_VPA`, OR an outgoing marker appears in `ocr_text` and no incoming marker does.

"Neither marker present" is deliberately NOT an automatic flag — GPay prints no direction phrase and must clear on the VPA match.

**D28 — Auto-approval must gate on NAMED flag reasons, not flag count (Accepted 3 Aug 2026).**
The same GPay screenshot uploaded twice, with byte-identical `ocr_text`, produced `app = "G Pay"` on one run and `app = null` on the next. Under a zero-flags rule the same customer auto-approves or not on a coin flip. Cosmetic `ungrounded` flags remain visible but must not block.

**D29 — Client writes to `extractions` are closed by column grants + a doc_type-whitelisted policy (Accepted 2 Aug 2026).**
**Both tables must close together or neither closes.**

**D30 — UTR comparison is normalized and case-insensitive (Accepted 4 Aug 2026).**
`public.normalize_utr(text)`, IMMUTABLE. Storage remains verbatim-trimmed.

**D31 — F0d enforcement: the RPC is the only client writer; the unique index is the concurrency backstop (Accepted 4 Aug 2026).**

**D32 — A failed query must render an explicit state, never blank space (Accepted 6 Aug 2026).**
Gate on success not on "not loading"; never retry a permanent error; a money-bearing control must be disabled when its amount is unknown. Same failure shape as D21.

**D33 — The app is permanently dark; styling uses semantic tokens (Accepted 6–8 Aug 2026).**

**D34 — The advisory duplicate check compares server-side (Accepted 9 Aug 2026).**
PostgREST **cannot apply a function to a column**, so a TS-only mirror would have looked resolved while leaving half the case open.

**D35 — `UI_CONVENTIONS.md` is enforced mechanically (Accepted 9 Aug 2026).**
The guard was verified to **fail** on three injected violations before being trusted. A guard test that has never been observed failing is an assumption, not a check.

**D36 — `profiles` writes are server-owned; RLS was never the defence it appeared to be (Accepted 12 Aug 2026).**
`profiles` had RLS enabled, an owner-scoped policy, and **no column-level grants** — so `authenticated` held UPDATE on all 11 columns. An ordinary organizer could reset `profile_reward_claimed` and mint unlimited 100%-off Pro coupons. Negative-tested live, then closed in three ordered parts: additive RPC → frontend switch → restrictive revoke.
**Generalisation: RLS restricts rows, never columns.**

**D37 — F1 gates on confirmed email + a validated phone; OTP deliberately deferred (Accepted 12–13 Aug 2026).**
SMS OTP in India requires TRAI DLT registration before a single transactional message; against 36 users and 7 payments that fails guardrail 5. Recorded honestly: **phone-without-OTP is weak anti-sybil.** F2's identity strength comes from the verdict allow-list and confirmed email, not the phone field.
**Also generalised:** any `supabase.rpc` error a named-code branch will inspect must be rethrown as a real `Error`, not a bare `PostgrestError`.

**D38 — A SECURITY DEFINER function's EXECUTE grant is a write path RLS cannot see (Accepted 14 Aug 2026).**
The E1–E3 audit found `issue_referral_rewards` executable by clients. A table-grant-only audit is structurally incomplete: the dangerous surface is the set of definer functions a role may call, not the set of tables it may write.

**D39 — Absence of a flag is not evidence a check passed (Accepted 17 Aug 2026; extends D22, D27, D28).**
Five of the eight invariants have skip paths. A gate reading "no allow-listed reason is present" auto-approves every one of them. `extract` therefore records a **verdict** per named invariant into `payment_invariant_verdicts`, and F2 requires all eight to read `pass`. `skipped` is not `pass`.

Proven on live data before launch. A CRED receipt produced **zero flags** with `utr_format = skipped` and `utr_duplicate = skipped` — a flags-only rule would have auto-approved a ₹500 claim from a receipt that never printed a UTR.

**The asymmetry is deliberate:** the duplicate and price RPCs fail **open** for the *flag* (advisory) and **closed** for the *verdict* (authoritative, money-bearing).

**Governance is a database feature flag, not an Edge Function secret.** `platform_feature_flags.payment_auto_approve` — RLS on, zero policies, no client grants. An Edge Function secret is unreadable from a database RPC, and the decision lives in the RPC.

**Accepted cost:** false declines rise. A false decline costs a click; a false approval costs revenue and is invisible.

**D40 — A trigger that writes a column is a dependency of that column, and Postgres will not tell you (Accepted 22 Aug 2026).**

`public.tg_referrals_set_snapshot()` populated `new.referred_email` and `new.referred_label`. Migration `20260512184720` dropped both columns and left the trigger attached. Every INSERT into `public.referrals` raised `42703` from 12 May 2026 18:47 UTC until 22 August. Referral capture was dead for three months; `referral_rewards` has zero rows ever.

`ALTER TABLE ... DROP COLUMN` does not inspect trigger bodies. PL/pgSQL resolves `new.<field>` at execution time, so the trigger stayed perfectly valid until the next insert. Nothing in the migration output, the schema, or any linter reported it.

**It was silent for a second reason, and that one is worse.** The sole caller — `useApplyPendingReferral` — destructured `rpcError`, never inspected it, logged it only behind a debug flag that is false in production, and then **cleared localStorage and `user_metadata` unconditionally**. Every failure destroyed all three copies of the referral code. That is why the lost referrals are not backfillable: the link was never recorded anywhere.

Same failure shape as D21 and D32: *a surface that produces nothing is not obviously broken.*

**Three standing rules:**
1. **When dropping a column, grep every trigger body on that table first** — via `pg_get_functiondef` over `pg_trigger`, not the repo, because the object may not be in the repo at all.
2. **A write path with no successful writes for a month is a bug until proven otherwise.** "Zero referral rewards ever" sat in the documentation as a fact rather than an alarm.
3. **Never let an error handler discard the input that caused the error.** Afterwards, neither retry nor diagnosis is possible.

**Scope discipline recorded, because the temptation was real.** The live `apply_referral_code` body also contains an `email_confirmed_at` check, a 300-second attribution window and an `ON CONFLICT` clause that appear in **no migration**, and the last referral row (19 Apr) predates the column drop (12 May) by 23 days — which looked like a second bug. Measurement said otherwise: median `|last_sign_in_at − email_confirmed_at|` across all 36 users is 45 seconds, 20 of 36 pass the window today, and in the canonical flow the confirmation click *is* the sign-in, so the delta is ≈0. The gap is explained by volume, not by a defect. **The function was left unmodified** — widening an anti-abuse window on an unproven hypothesis is exactly what guardrail 3 forbids. The drift is recorded as debt instead.

**The provenance finding this exposed:** neither the trigger nor `apply_referral_code`'s live body ever appeared in a migration, and they are not alone — **9 of 53 functions in `public` exist only in the live database.** Every audit that reads migrations is blind to them, which is how a three-month outage survived. Tracked as its own workstream.

**D41 — Fewer flags is not a better extraction; it can be silent data loss (Accepted 26 Aug 2026; same family as D21, D32, D40).**

The Shahdol brochure was extracted twice from the same file with the same model, months apart:

| Run | Categories | Named | Prize rows | Flags |
|---|---|---|---|---|
| 20 Jul | 6 | 6 | 17 | **1** |
| 26 Aug | **20** | 6 | **59** | **15** |

The 1-flag run looked clean. It had **silently dropped all 14 age-group categories and their 42 trophies.** The 15-flag run found the complete structure — cross-checked against the brochure's own advertised "56 Attractive trophies", which the August extraction matches exactly — and merely failed to *name* 14 categories.

**A reviewer optimising for a low flag count would have approved the lossy extraction and rejected the complete one.** Flag count is a measure of what the trust layer noticed, not of what the extraction got right. Any future tuning must be judged against expected output on a fixture set, never against flag count.

**A correction, recorded because the error is instructive.** The first version of this decision claimed `sum_mismatch` was a false positive that ignored rank ranges. It was not. `trustCheck.ts` already computes `amount × (rank_to − rank_from + 1)`, and that code is deployed.

The mistake was inferring a false positive from arithmetic alone. Shahdol's rank-aware sum (₹51,000) equals its declared fund, so the check correctly **stayed silent** — its 15 flags are all `ungrounded`. Nobody checked whether `sum_mismatch` had actually fired before concluding it had misfired. Vijaywada's flag, meanwhile, records `expected: 530000` against `stated: 800000`, and a rank-aware recompute of its payload gives exactly ₹530,000 — a **true positive** on an extraction that genuinely lost ₹270,000 of prizes.

**Generalisation: an invariant is only proven to misfire when you observe the flag firing on data you have independently established is correct.** Reproducing the check's arithmetic and disagreeing with it proves nothing about which arithmetic the deployed code actually ran. Verify the artifact, not your model of it — the same discipline that D40 demanded for triggers that are not in the repo.

**Third structural point:** the failing categories are precisely those printed as **column headers** in a wide grid. Every category the model named had a row label or section heading. A category emitted with a null name is malformed input and should fail once, clearly, rather than producing N generic `ungrounded` flags that bury the real cause.

---

## 7. Security & Privacy

- `payment_screenshot`: `privacy_class='public'`. Gemini free tier permitted.
- `bank_statement`: `privacy_class='sensitive'`. Local processing only.
- Payee VPA: Supabase secret, never in logs. Necessarily public in the frontend bundle; **not** covered by the kill-switch guardrail.
- **Auto-approve kill switch:** `platform_feature_flags.payment_auto_approve`. Never in frontend code or logs.
- `payment_invariant_verdicts`: RLS on, zero policies, no client grants. Unreachable from any client path.
- **`profiles`:** `authenticated` holds SELECT only; all writes via `update_my_profile` (D36).
- **`profiles.phone`:** canonical `+91XXXXXXXXXX` under a CHECK. Not verified (D37). Not unique (D37).
- **`referrals`:** `anon` and `authenticated` hold SELECT only; two SELECT-only policies; **no triggers**. Sole writer is `apply_referral_code` (SECURITY DEFINER).
- API keys (Phase 2C): shown once, only SHA-256 hash stored.

---

## 8. Known Debt from Audit

See `PROJECT_STATE.md` §19 for the live list. Resolved in this document's period:

| Debt | Status |
|---|---|
| `extractions` UPDATE policy too broad | ✅ F0a; see D29 |
| Three fail-open trust invariants | ✅ F0c; see D27 |
| UTR-match + duplicate hard-block | ✅ F0d |
| `profiles` client-writable at column level | ✅ F1-A2; see D36 |
| Client write-grant audit (E1–E3) | ✅ 14 Aug; see D38 |
| Auto-approve gate must use named reasons | ✅ F2-G; see D28, D39 |
| `file_hash` duplicate invariant | ✅ F2-G |
| `source` CHECK widened for `auto_upi` | ✅ F2-B |
| **`public.referrals` insert raised 42703** | ✅ **`20260822120000`; see D40** |
| **Referral error swallowed and input destroyed** | ✅ **22 Aug; see D40, W4** |
| F2 decline messages are a fraud oracle | ✅ Generic to organizer, itemised in `/admin/payments` |
| No `/admin/payments` auto-approved view | ⏳ MEDIUM — F2-4, now F3-C |
| **9 untracked functions in `public`** | ⏳ **MEDIUM — new workstream; see D40** |
| `apply_referral_code` body is untracked drift | ⏳ MEDIUM — capture with zero behaviour change |
| Gate / helper drift risk | ⏳ MEDIUM — nothing tests `my_payment_gate_status()` |
| Notification `MAX_ATTEMPTS=5` with no backoff | ⏳ MEDIUM — more consequential now the oversight email is the primary alert |
| `tsconfig.app.json` does not cover `supabase/functions/` or `tests/` | ⏳ MEDIUM |
| **Brochure column-header category names lost** | ⏳ **MEDIUM — B8b; see D41** |
| **Five UI defects from production validation** | ⏳ **MEDIUM — B13, all F3-C** |
| Direction marker regexes lack `\b` word boundaries | ⏳ LOW — bounded by D27 |

---

## 9. Phase 2 Test Strategy

### F2 gate harness — `supabase/tests/f2_gate_checks.sql`

24 checks, self-aborting, everything rolled back. Pass condition is `24 passed, 0 failed` inside an `ERROR:`. **24/24 as of 22 Aug 2026.**

```
1a-1h  all eight verdicts pass, flag ON, organizer, screenshot → APPROVED (+8 sub-assertions)
2      one verdict 'fail'                                      → pending
3      one verdict 'skipped'                                   → pending   ← D39
4      flag OFF                                                → pending
5      master submits                                          → pending
6      no screenshot pinned                                    → pending
7      file_hash on a NON-REJECTED payment                     → pending
7B     same fixture, other payment REJECTED                    → APPROVED  ← D15
8      all eight pass at checker_version = 2                   → pending
S1-S8  structural assertions + kill-switch leak check
```

**Cases 7 and 7B are a matched pair.** They differ by one column value and land on opposite sides. Case 7 alone would pass even if the fixture were broken.

**Amended 22 Aug:** the referral seed for 1g/1h previously wrapped its INSERT in `ALTER TABLE ... DISABLE/ENABLE TRIGGER trg_referrals_set_snapshot`, because that trigger raised 42703 on every insert. The trigger is gone, so both lines were removed and the header comment updated. If `public.referrals` ever acquires a trigger again, this seed is the first thing that breaks — which is the intended alarm.

### F0d + F1 harness — `supabase/tests/f0d_rpc_checks.sql`

17 branches. **Case Q is the ordering guard:** if it returns `UTR_ALREADY_USED` instead of `PROFILE_INCOMPLETE`, the F1 gate has been moved below the F0d block and is bypassable by ordering.

The harness **seeds `profiles.phone` on both fixture users**. Before 13 Aug it did not, and passed only because both accounts happened to have phones that day — testing the live profile rather than the RPC.

### Standing verification queries

```sql
-- All payment extractions must be needs_review, never auto_ok
select status, count(*) from extractions
join extraction_documents d on d.id = document_id
where d.doc_type = 'payment_screenshot'
group by status;

-- referrals must accept an insert (D40 regression guard, run rolled back)
-- and must carry zero triggers
select count(*) from pg_trigger
where tgrelid = 'public.referrals'::regclass and not tgisinternal;  -- expect 0
```
