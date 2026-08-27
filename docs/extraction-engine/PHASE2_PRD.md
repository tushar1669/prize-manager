# PRD — Phase 2: Universal Extraction Engine

**Product:** Universal Extraction Engine (prize-manager.com first, then certificate-hub.com and sportup.online via API)
**Status:** **Phase 2A-3 is COMPLETE.** F0a–F0e, F1, the client write-grant audit, PF1 and **F2 (conditional auto-approval, live 20 Aug 2026)** are all shipped. Referral capture repaired 22 Aug 2026 and **validated end to end in production 25–26 Aug 2026**. **Next: F3 (auto-approval oversight loop), then Phase 2B.**
**Owner:** Tushar (Product/Eng), Claude (architecture & QA support)
**Version:** 1.6 — 27 August 2026
**Repo location:** `docs/extraction-engine/PHASE2_PRD.md`
**Predecessor:** `docs/extraction-engine/PRD.md` (Phase 1 — brochure extraction, shipped)

---

## Platform Ecosystem

| Platform | What it does | Payment verification use case | Phase |
|---|---|---|---|
| prize-manager.com | Tournament prize management | Organizer pays per-tournament Pro fee via UPI | 2A ✅ direct |
| certificate-hub.com | Certificate creation (paywalled) | User pays to unlock service | 2C via REST API |
| sportup.online | Discovery + tournament management | Player pays entry fee | 2C via REST API |

---

## Problem Statement

**Immediate (Phase 2A — SOLVED):** Organizers submitted payment proof as a UTR string only, verified by hand against a bank account. Phase 2A added optional screenshot upload, pre-verification invariants, and a review UI.

**Payment lifecycle (Phase 2A-2 — SOLVED):** Added the outbox, trigger, email with deep-link resumption, Dashboard banner, `/admin/payments`, full history, and screenshot viewer.

**Trust hardening (F0a–F0e — SOLVED):** Eight invariants, `extractions` writes column-scoped, UTR duplicate and mismatch hard-blocked with a unique-index backstop, explicit payment-page failure states.

**Payer identity (F1 — SOLVED):** Gated on confirmed email + validated Indian phone. Also closed a confirmed vulnerability: `profiles` was client-writable at column level, making an unbounded free-Pro coupon loop reachable.

**Manual review (F2 — SOLVED, live 20 Aug 2026):** Every payment required a manual Approve, which blocked live events whenever Tushar was unavailable. Clean, verified submissions now unlock Pro automatically.

**Referral capture (SOLVED 22 Aug 2026):** Referral attribution had been dead since 12 May. A dropped-column trigger raised `42703` on every insert into `public.referrals`, and the sole caller swallowed the error while destroying the referral code. Zero rewards were ever issued. Both defects closed; the lost window is not backfillable.

**Auto-approval oversight (F3 — NEXT):** Auto-approvals are recorded with full evidence but there is no way to *act* on a bad one — no flagging, no revocation, and no admin view.

**Medium-term (Phase 2B):** No automated bank reconciliation.

**Revenue (Phase 2C–D):** Extraction engine has no API surface.

---

## Goals

1. **Automate payment verification** ✅
2. **Remove Tushar as a bottleneck** ✅ — F2 live 20 Aug 2026
3. **Enable bank reconciliation** — Phase 2B
4. **Expose extraction engine as API** — Phase 2C–D
5. **Prove the engine earns revenue** — Phase 2C–D

---

## Non-Goals (Phase 2)

- No payment gateway integration. UPI verification layer only.
- No automatic approval without all safeguards in place.
- No modification to the allocation engine.
- **No SMS OTP.** Deferred with reasons recorded — see D37.
- **No phone uniqueness constraint** until OTP exists.
- No non-UPI payment screenshots in Phase 2A. NEFT/RTGS is Phase 3.
- No scanned bank statements in Phase 2B. Text PDFs only.
- No Certificate Hub or Sportup direct integration in Phase 2A–B.
- **No change to `apply_referral_code`'s attribution window.** Investigated 22 Aug and left alone on measurement — see Resolved Decisions.

---

## User Stories

### Phase 2A / 2A-2 — Delivered ✅

- As a **tournament organizer**, I can upload a payment screenshot alongside my UTR so my claim is pre-verified and approved faster.
- As a **tournament organizer**, I can still submit a UTR-only claim and the existing flow is not broken.
- As a **tournament organizer**, I see a persistent Dashboard banner when my claim is pending or rejected, and it clears on approval.
- As a **tournament organizer**, rejection emails carry the reason and a direct resubmit link; approval emails return me to where I hit the paywall.
- As **Tushar (admin)**, I see extracted evidence at `/admin/payments` with flag reasons, claimed-vs-extracted amounts, the screenshot in-app, and every payment ever with its attempt ordinal.

### F0a–F0e — Delivered ✅

- Extracted evidence cannot be rewritten by the organizer who uploaded it.
- An incoming "Received from" receipt is flagged rather than passing on amount alone.
- A UTR already used on a non-rejected payment is hard-blocked at submission.
- Pasting the app's transaction ID instead of the UTR is named exactly, with the right value shown.
- A payment page that cannot load pricing shows an explicit error rather than offering to "Pay ₹0".

### F1 — Delivered ✅

- Organizers are asked for a phone number *before* paying, told so on the payment page.
- An invalid Indian mobile is rejected inline at save time, with no support reference code.
- An incomplete profile disables Submit and names exactly what is missing.
- Master can still submit on an organizer's behalf without meeting the gate.
- An organizer cannot reset their own profile-reward flag to mint free Pro coupons.

### F2 — Delivered ✅ (live 20 Aug 2026)

- As an **organizer with a verified profile**, paying the exact amount to the correct UPI ID with a fresh valid screenshot unlocks Pro immediately.
- As an **organizer whose screenshot is wrong**, I get an immediate *generic* message asking me to check and reapply — deliberately not naming which check failed.
- As **Tushar**, every auto-approval carries the extracted evidence and the exact eight verdicts the gate acted on, and I get an oversight email.
- As **Tushar**, I can disable auto-approval instantly by flipping a database feature flag, reverting to full manual approval with no code change.

### Referrals — Delivered ✅ (22 Aug 2026)

- As a **new user arriving on a referral link**, my referral is actually recorded. It was not, for three months.
- As a **referrer**, the reward chain can now fire. `issue_referral_rewards` was proven end-to-end by harness case 1g/1h and was never the broken link.
- As a **new user whose referral attempt fails**, my code is retained for a later attempt instead of being silently destroyed.

### F3 — Next

- As **Tushar**, I can see all auto-approved payments in `/admin/payments` in their own section.
- As **Tushar**, I can mark an auto-approval as `ok`, `loophole`, or `uncertain`, with a reason.
- As **Tushar**, I can revoke a bad auto-approval's entitlement without deleting the evidence.

### Phase 2B / 2C–D — Planned

- Bank statement upload → UTR matching → confirmed/missing/unmatched report with CSV export.
- External developers call an API endpoint with a screenshot and get a structured result, with API key auth and usage-based pricing.

---

## Requirements

### Phase 2A — COMPLETE ✅

**F1** optional screenshot upload · **F2** `payment_screenshot` schema, now **v3** · **F3** eight trust invariants in `extract/paymentTrustCheck.ts`, returning `{flags, verdicts}` · **F4** all `payment_screenshot` extractions exit `needs_review`; `auto_ok` unreachable for this doc_type · **F5** admin evidence panel · **F6** `review_tournament_payment` unchanged · **F7** migration hygiene.

### Phase 2A-2 — COMPLETE ✅

**L1** `/admin/payments` route · **L2** tournament-scoped screenshot storage · **L3** email on approve and reject, exactly-once · **L4** persistent status banner · **L5** editable extracted UTR · **L6** flow resumption via `return_to` · **L7** rejection non-terminal.

### Phase 2A-3 — COMPLETE ✅

**F0a** close `extractions` UPDATE policy · **F0b** schema v2 → v3 · **F0c** three new trust invariants · **F0d** UTR-match and duplicate enforcement + backstop index · **F0e** payment-page failure states · **F1** profile verification prerequisite.

**E1–E3 client write-grant audit** ✅ 14 Aug — `issue_referral_rewards` EXECUTE revoked from clients, `publish_tournament` ownership check, high-water-mark billing. **This audit preceded F2; earlier revisions of this document scheduled it afterwards.**

**PF1 pricing basis consolidation** ✅ 16 Aug — `tournament_billing_basis`, `tournament_pro_tier` and `expected_payment_amount_inr` are the single canonical implementations.

### F2 — COMPLETE ✅ (live 20 Aug 2026 17:26:33 UTC)

**F2-1 — Conditional auto-approval, server-side only.** ✅ Auto-approves only when **all eight named invariant verdicts read `pass`**, the payer meets the F1 gate, and the kill switch is on. **NOT "zero flags of any kind"** — cosmetic `ungrounded` flags are nondeterministic across identical uploads and would make auto-approval a coin flip (D28). **And not "no allow-listed reason present"** — five invariants have skip paths, and `skipped` is not `pass` (D39). Pro unlocks via `source='auto_upi'`. The `AFTER UPDATE OF status` trigger enqueues the notification with no extra wiring.

**F2-2 — Decline messages must not be a fraud oracle.** ✅ Generic message to the organizer; itemised reasons only in `/admin/payments`.

**F2-3 — `file_hash` duplicate-screenshot invariant.** ✅ Global scope, restricted to non-rejected payments. The `tp.id <> v_payment_id` predicate is load-bearing — remove it and the gate silently never fires (harness cases 7 and 7B).

**F2-4 — Admin oversight record + email for auto-approvals.** ⚠️ **Partially delivered.** The email ships and the oversight record carries the exact eight verdicts. **The `/admin/payments` auto-approved section was not built** — F2 touched zero files under `src/`. Carried into F3-C.

**F2-5 — Kill-switch-governed gate.** ✅ **Amended from the original requirement.** The original specified a Supabase Edge Function secret. That is unimplementable: the decision lives in a database RPC, and an Edge Function secret is unreadable from one. Delivered as `platform_feature_flags.payment_auto_approve` — RLS on, zero policies, no client grants, control-tested unreadable by `authenticated`. Never in frontend code or logs. Off switch: `supabase/ops/f2_auto_approve_off.sql`, safe to run at any time.

**F2-6 — Manual path preserved.** ✅ Anything that does not auto-approve flows to `PendingPaymentsPanel`. `review_tournament_payment` untouched — F2 mirrors its entitlement logic rather than calling it.

**F2-7 — `source` CHECK widened.** ✅ `tournament_entitlements.source` admits `auto_upi`.

### Referrals repair — COMPLETE ✅ (22 August 2026)

**R-1 — Restore inserts into `public.referrals`.** ✅ `20260822120000`. `trg_referrals_set_snapshot` and its function dropped — the body did nothing but populate two columns dropped on 12 May, so there was no behaviour to preserve. Migration carries a pre-flight, a structural post-check, a behavioural proof that inserts a real referral and unwinds it, and a leak check.

**R-2 — Stop the caller destroying its own input.** ✅ `useApplyPendingReferral` now inspects `rpcError`, warns in production rather than only in debug builds, and retains the code on every non-terminal outcome. Terminal set: `applied`, `already_applied`, `self_referral_not_allowed`, `invalid_code`.

**R-3 — Keep the F2 harness green.** ✅ The referral seed for cases 1g/1h no longer disables a trigger around its INSERT. Re-run confirmed 24/24.

**Not in scope, deliberately:** `apply_referral_code`'s attribution window. See Resolved Decisions.

### F3 — Must-Have (P0), NEXT

**F3-A — `payment_auto_approval_audit`.** One row per audited auto-approval: `payment_id` PK, `outcome` CHECK (`ok` | `loophole` | `uncertain`), `reason`, `action_taken`, `audited_by`, `audited_at`. Same lockdown as `payment_invariant_verdicts`: RLS on, zero policies, no client grants, written only by a master-only SECURITY DEFINER RPC.

**F3-B — `revoke_auto_entitlement(payment_id, reason)`.** Sets `ends_at = now()` rather than deleting, so evidence survives. Flips the payment to `rejected`, firing the existing trigger. Must not touch `review_tournament_payment`. **Open question: is the organizer emailed on revocation, or is there a quieter path?**

**F3-C — `/admin/payments` auto-approved section, plus five UI defects.** Closes F2-4. Predicate `status='approved' AND reviewed_by IS NULL`, re-verified 26 Aug: exactly 1 match, and every pre-F2 payment carries a reviewer, so zero false positives.

Production validation surfaced five concrete defects that belong here (PROJECT_STATE B13): the post-submit toast says "awaiting admin approval" even when the payment auto-approved; `/account` is a dead end from the payment gate; spent coupons still display as available; rejection notes are optional yet are the only channel explaining a rejection; and the screenshot "optional" label understates that omitting it forfeits auto-approval.

### Phase 2B / 2C–D — Must-Have (P0)

**2B:** bank statement upload (PDF, `sensitive`) · local pdfplumber extraction, never Gemini · UTR-to-payment matching · reconciliation report · no cloud model for statement content.

**2C–D:** `api_keys` table · `POST /functions/v1/extract-api` with key auth · `api_usage_logs` metering · MCP tools · multi-tenant isolation.

---

## Resolved Decisions

**RESOLVED — Auto-approve gate shape.** Named invariant **verdicts**, all eight reading `pass`. Not flag count (D28), and not "no allow-listed reason present" (D39). Proven on live data: a CRED receipt produced zero flags with two invariants `skipped`, and a flags-only rule would have auto-approved a ₹500 claim from a receipt that never printed a UTR.

**RESOLVED — Kill switch mechanism.** Database feature flag, not an Edge Function secret. Amends F2-5 as originally written.

**RESOLVED — Auto-approval decision location.** In the claim-time RPC `submit_tournament_payment_claim`, not inside `/extract` and not in a separate async path. `/extract` records verdicts; the RPC decides.

**RESOLVED — `file_hash` scope.** Global, restricted to non-rejected payments, and never matching the payment row being evaluated.

**RESOLVED — Phone verification provider and cost.** No provider. OTP deferred. TRAI DLT registration is the real cost, and against 36 users and 7 payments it fails guardrail 5. **F2's identity strength comes from the verdict allow-list and confirmed email, not the phone field.**

**RESOLVED — Gate scope.** Email + phone only, not the full five-field profile.

**RESOLVED — Phone uniqueness.** None until OTP exists. Uniqueness over unverified data is a squatting attack.

**RESOLVED — Decline message content.** Generic to the organizer, itemised in `/admin/payments`.

**RESOLVED — `apply_referral_code` attribution window stays as-is (22 Aug 2026).** The live function body contains an `email_confirmed_at` check, a 300-second window requiring `abs(last_sign_in_at − email_confirmed_at) ≤ 300`, and an `ON CONFLICT` clause — **none of which appear in any migration.** The last referral row (19 Apr) predates the column drop (12 May) by 23 days, which looked like a second independent bug.

Measurement did not support that. Median `|last_sign_in_at − email_confirmed_at|` across all 36 users is **45 seconds**; 20 of 36 pass the window today; and in the canonical flow the confirmation click *is* the sign-in, so the delta is ≈0. The 23-day gap is adequately explained by volume — 14 signups since 19 April, referral links shared informally.

**Widening it would weaken an anti-abuse check on an unproven hypothesis, which guardrail 3 forbids.** Recorded as untracked drift to be captured with zero behaviour change, not as a defect.

---

## Open Questions

### F3
- **Revocation notification.** Email the organizer on revocation, or a quieter path?
- **Audit cadence.** How often is `f2_auto_approval_report.sql` run, and does an unaudited auto-approval age into an alert?

### Referrals follow-up
- **Nine untracked `public` functions.** Capture them into a drift migration with zero behaviour change. Read-only audit first — do not rewrite a working function to make a document tidy.

### Brochure extraction (new 26 Aug, revised 27 Aug)
- **`sum_mismatch` needs no fix.** The rank-range false positive reported on 26 Aug was not real — the check is already rank-aware and deployed. Withdrawn; see D41.
- **Category naming from column headers is the real defect (B8b).** Build a brochure fixture suite with expected outputs and measure run-to-run variance before touching any prompt. Judge against expected output, never against flag count.

### Phase 2B
- **Where does pdfplumber run?** Python microservice on Railway, Deno subprocess, or WASM in Deno.

### Phase 2C–D
- **Pricing model.** Per-call (₹2–5/verification) or monthly tiers (₹500–2000/month)?

---

## Success Metrics

**Phase 2A (measured):** zero `auto_ok` for `payment_screenshot` ✅. The PhonePe incoming-receipt attack went from 1 flag to 3 after F0c ✅.

**F1 (measure over 2 weeks):** organizers who hit the gate and complete their profile rather than abandoning — target >80%.

**F2 — MEASURED 25–26 Aug 2026 ✅**
- **False auto-approval rate: 0%, target met.** Eight adversarial cases (wrong amount, wrong payee, duplicate UTR, no screenshot, coupon reuse, another user's coupon, self-referral, free tier). Across all 11 payments in the system exactly **one** is `approved` with `reviewed_by IS NULL`, and it is the legitimate one.
- **First real auto-approval on live money:** ₹500, all eight verdicts `pass` at `checker_version = 1`, entitlement `auto_upi`, both outbox rows sent first attempt.
- **Free tier verified at the boundaries:** 150→₹0, 151→₹500, 500→₹500, 501→₹1000.
- Auto-approval rate for clean submissions — **the original >70% target must still be re-derived from real data.** `payee_vpa` is present in only 7 of 17 payment extractions, and absent VPA is a hard decline (it fails, it does not skip). Bank-account transfers carry no VPA and can never auto-approve. That is correct security behaviour and must not be loosened, but it caps the achievable rate. The historical sample is dominated by deliberate test and attack screenshots and is not representative.

**Referrals — MEASURED 25–26 Aug 2026 ✅ (target was 4 weeks; met in 4 days)**
- **6 `referrals` rows** (was 3, last one 19 April) — a 4-deep chain captured through the live signup flow, every row's `referral_code_id` owner matching its `referrer_id`.
- **5 `referral_rewards` rows — the first this project has ever produced.** Zero rewards was the symptom that should have raised the alarm three months earlier.
- **Both trigger paths proven:** a UPI payment issued 3 rewards (100/50/25%), and a coupon redemption cascaded a further 2, confirming `redeem_coupon_for_tournament` fires the chain exactly as paying does.
- 5 `REF%` coupons minted, 1 redeemed to a `source='coupon'` entitlement.

**Phase 2B:** reconciliation report <2 minutes for a 3-month statement; match rate >95%.

**Phase 2C–D:** first external API call from Certificate Hub; first revenue within 4 weeks of launch.

---

## Timeline

- **Phase 2A:** ✅ shipped Jul 2026
- **Phase 2A-2:** ✅ shipped Aug 2026
- **F0a–F0e + closeout:** ✅ 2–9 Aug 2026
- **F1:** ✅ 12–13 Aug 2026
- **Client write-grant audit (E1–E3):** ✅ 14 Aug 2026 — **preceded F2**
- **PF1:** ✅ 16 Aug 2026
- **F2:** ✅ 17–20 Aug 2026, live 20 Aug 17:26 UTC
- **Referrals repair:** ✅ 22 Aug 2026
- **End-to-end production validation:** ✅ 25–26 Aug 2026 — referral chain, first auto-approval, first rewards, 8 adversarial tests
- **F3 (auto-approval oversight loop):** next. New chat.
- **Untracked-function drift capture:** after F3, before Phase 2B.
- **Phase 2B:** 2–3 sessions after that. New chat.
- **Phase 2C–D:** 4–5 sessions after 2B. New chat.
- **Phase 3 (Document Intelligence) / Phase 4 (Gallery + Scanner):** separate PRDs.
