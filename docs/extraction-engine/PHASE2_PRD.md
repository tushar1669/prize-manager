# PRD — Phase 2: Universal Extraction Engine

**Product:** Universal Extraction Engine (prize-manager.com first, then certificate-hub.com and sportup.online via API)
**Status:** Phase 2A and 2A-2 complete; Phase 2A-3 prerequisites F0a/F0b/F0c complete and production-verified, F0d next
**Owner:** Tushar (Product/Eng), Claude (architecture & QA support)
**Version:** 1.2 — 3 August 2026
**Repo location:** `docs/extraction-engine/PHASE2_PRD.md`
**Predecessor:** `docs/extraction-engine/PRD.md` (Phase 1 — brochure extraction, shipped)

---

## Platform Ecosystem

Three platforms share the extraction engine. Phase 2A/2A-2 serves Prize Manager directly. Phase 2C–D exposes the engine as an API that Certificate Hub and Sportup consume.

| Platform | What it does | Payment verification use case | Phase when it gets it |
|---|---|---|---|
| prize-manager.com | Tournament prize management | Organizer pays per-tournament Pro fee via UPI; screenshot proves payment | 2A ✅ (direct integration) |
| certificate-hub.com | Certificate creation (paywalled) | User pays to unlock service; screenshot proves payment | 2C (via REST API) |
| sportup.online | Discovery + tournament management | Player pays entry fee; screenshot proves registration payment | 2C (via REST API) |

---

## Problem Statement

**Immediate (Phase 2A — SOLVED):** Tournament organizers submit payment proof as a UTR text string only. Tushar manually verifies every claim by checking his bank account. Phase 2A adds optional UPI screenshot upload with five business-rule pre-verification invariants and a complete review UI before claims reach manual review.

**Payment lifecycle (Phase 2A-2 — SOLVED):** Even with extraction evidence, there was no notification path (organizer didn't know if their payment was approved or rejected), no persistent in-app status, no dedicated admin payment surface, and no audit trail for repeated attempts. Phase 2A-2 added the full lifecycle: outbox, trigger, email (with deep-link flow resumption), Dashboard banner, `/admin/payments` page, full payment history table, and screenshot viewer.

**Trust hardening + auto-approval (Phase 2A-3 — NEXT):** The trust layer has three fail-open paths (see below). Manual review is still required for every payment. At 50+ organizers this blocks live events when Tushar is unavailable. Auto-approval is the fix, but requires closing the trust gaps first.

**Medium-term (Phase 2B):** No automated bank reconciliation. Manual month-end matching is error-prone.

**Revenue (Phase 2C–D):** Extraction engine has no API surface. Certificate Hub and Sportup cannot consume it programmatically.

---

## Goals

1. **Automate payment verification** ✅ — Screenshot + UTR submitted; five invariants pre-verify; admin sees extracted evidence with flag reasons.
2. **Remove Tushar as a bottleneck** — Target: clean, verified submissions unlock Pro automatically (Phase 2A-3).
3. **Enable bank reconciliation** — Phase 2B.
4. **Expose extraction engine as API** — Phase 2C–D.
5. **Prove the engine earns revenue** — Phase 2C–D.

---

## Non-Goals (Phase 2)

- No payment gateway integration. UPI verification layer only.
- No automatic approval of payments without all safeguards in place (Phase 2A-3 adds conditional auto-approval with full audit trail).
- No modification to the allocation engine.
- No support for non-UPI payment screenshots in Phase 2A. NEFT/RTGS is Phase 3.
- No support for scanned bank statements in Phase 2B. Text PDFs only.
- No Certificate Hub or Sportup direct integration in Phase 2A–B.

---

## User Stories

### Phase 2A / 2A-2 — Delivered ✅

- As a **tournament organizer**, I can upload a payment screenshot alongside my UTR so the system pre-verifies my payment and my claim is approved faster.
- As a **tournament organizer**, I still submit a UTR text claim without a screenshot and the existing flow is not broken.
- As a **tournament organizer**, I see a persistent banner on my Dashboard when my payment claim is pending or rejected, linking me directly to the payment page. The banner clears when my payment is approved.
- As a **tournament organizer**, when my payment is rejected, I receive an email with the reason and a direct link back to the payment page to resubmit. When approved, I receive an email with a one-click link back to where I was when I hit the paywall.
- As a **tournament organizer**, when I upload a screenshot, the UTR field is pre-filled from the screenshot (I can edit it before submitting).
- As **Tushar (admin)**, I see extracted payment details (amount, date, UTR, payee, payer) alongside each claim at `/admin/payments`.
- As **Tushar (admin)**, flagged claims show the specific flag reason with clear labelling; a missing payee VPA is shown as "NOT VERIFIED" (not as a neutral dash).
- As **Tushar (admin)**, I can see the actual payment screenshot in an in-app dialog, with an "Open in new tab" option for zooming.
- As **Tushar (admin)**, I see the claimed amount and the extracted amount side by side, with a MISMATCH label when they differ.
- As **Tushar (admin)**, I see all payments ever submitted (all statuses, all amounts), the attempt ordinal for each, and the dates submitted and reviewed.

### Phase 2A-3 — Planned

- As an **organizer with a verified profile**, when I pay the exact amount to the correct UPI ID with a fresh valid screenshot with a readable direction and payee, Pro unlocks immediately.
- As an **organizer whose screenshot is wrong** (old date, wrong amount, wrong payee, unreadable UTR, incoming receipt), I get an immediate pop-up telling me exactly what's wrong and asking me to reapply.
- As an **organizer with an incomplete profile**, I'm prompted to complete and verify my email and phone before I can submit a payment.
- As **Tushar (admin)**, every auto-approved payment appears in an admin view with the extracted evidence, and I get an email notification for post-hoc verification.
- As **Tushar (admin)**, I can disable auto-approval instantly by flipping a server-side secret, reverting to full manual approval with no code change.

### Phase 2B — Planned

- As **Tushar**, I upload my monthly bank statement PDF so the system matches all UTRs against `tournament_payments` and shows me confirmed, missing, and unmatched transactions.
- As **Tushar**, I get a reconciliation export (CSV or summary) for month-end audit.

### Phase 2C–D — Planned

- As a **certificate-hub.com developer** (Tushar), I call an API endpoint with a payment screenshot to get back a structured extraction result.
- As a **sportup.online developer** (Tushar), I POST a player's payment screenshot and get back verified payment data.
- As an **external developer**, I have API key authentication and usage-based pricing.

---

## Requirements

### Phase 2A — COMPLETE ✅

**F1 — Optional screenshot upload.** `TournamentUpgrade.tsx` has an optional file input (jpeg/png/webp/heic, ≤10MB). Upload path: `extraction-uploads/{uid}/payments/{tournament_id}/{uuid}{ext}`. `/extract` invoked with `doc_type='payment_screenshot'`. UTR-text-only path unchanged.

**F2 — Payment schema extraction.** `extraction_schemas` v1, `payment_screenshot`, `is_active=true`. Fields: `amount_inr` (required), `utr` (required), `txn_date`, `payee_vpa`, `payer_name`, `status_text`, `app`. Two-pass OCR flow unchanged.

**F3 — Payment trust invariants.** Five invariants in `extract/paymentTrustCheck.ts`: `utr_format`, `utr_duplicate`, `amount_mismatch` (coupon-aware, ±₹1 tolerance), `payee_vpa_mismatch` (vs secret), `date_stale` (>30 days).

**F4 — Force `needs_review`.** All `payment_screenshot` extractions exit with `status='needs_review'` regardless of flags or confidence. `auto_ok` is never reachable for this doc_type (until Phase 2A-3 conditional auto-approval).

**F5 — Admin evidence panel.** `PendingPaymentsPanel.tsx` shows extracted fields with trust indicators. Grounded fields show ✓ in green; flagged fields show reason in amber/red. Null `payee_vpa` shows active "NOT VERIFIED" caution. Unextracted claims show "UTR only — manual check required".

**F6 — No change to approval path.** `review_tournament_payment` RPC unchanged. Extraction result is reference evidence, not a gate.

**F7 — Migration hygiene.** Baseline migrations for `tournament_payments` and `platform_feature_flags` applied before Phase 2A code.

### Phase 2A-2 — COMPLETE ✅

**L1 — Dedicated `/admin/payments` route.** Payment Approvals moved out of `/admin/users`. `/admin/users` keeps only user/role management (organizer-access toggle).

**L2 — Tournament-scoped screenshot storage + admin viewing.** Upload path: `{uid}/payments/{tournament_id}/{uuid}{ext}`. Master read policy on `storage.objects`, `extractions`, and `extraction_documents`. In-app screenshot dialog via signed URL.

**L3 — Email on approve and reject.** Resend outbox pattern, exactly-once delivery via `(payment_id, action)` unique index. Reject email includes reason and payment page link. Approve email includes deep-link back to the interrupted flow.

**L4 — Persistent in-app status.** Dashboard shows a banner for owned tournaments with `pending` or `rejected` payment. Suppressed when an active entitlement exists. Clears on approval (query re-runs on mount/focus).

**L5 — Editable extracted UTR.** When extraction returns a `utr`, it pre-fills the UTR input. User can edit before submitting. Pre-fill cleared on any edit (`utrValueRef` handles race with 90-second extraction).

**L6 — Flow resumption on approval.** 5-arg `submit_tournament_payment_claim` stores `return_to` (validated relative path). Trigger copies it to the outbox row. Approve email deep-links to that path.

**L7 — Rejection is non-terminal + attempts auditable.** Rejected organizer can submit a new claim. All attempts retained in `tournament_payments`. Attempt ordinal ("N of M") visible in All Payments table.

### Phase 2A-3 — Must-Have (P0)

**Note:** The following trust-hardening requirements (F0a–F0d) are prerequisites that must be completed before the auto-approval gate (F2) is built.

**F0a — Close `extractions` UPDATE policy. ✅ COMPLETE (2 Aug 2026, migration `20260802124253`).**
Investigation found `BrochureReview.tsx` DOES write `payload` (load-bearing) and `status`, never `field_flags`. Narrowed rather than revoked: column grants limit `authenticated` to `payload`/`status`/`updated_at`, and the policy is doc_type-whitelisted to `chess_brochure`. Also closed an unused `extraction_documents` UPDATE policy that would have defeated the doc_type gate by allowing `doc_type` itself to be flipped. Negative-tested on both layers. See PHASE2_ARCHITECTURE.md D29.

**F0b — `payment_screenshot` schema v2 → v3. ✅ COMPLETE (2-3 Aug 2026, migrations `20260802165554`, `20260803181034`).**
v2 added `direction_label`, `payee_name`, `txn_id`. v3 **removed `direction_label`** after three production fixtures showed it inconsistent across apps and false-positiving on legitimate payments. `payee_name` and `txn_id` retained — both grounded correctly on every fixture. Direction moved to a regex over `ocr_text`. See PHASE2_ARCHITECTURE.md D26, D27.

**F0c — Three new trust invariants. ✅ COMPLETE (3 Aug 2026, `extract` v44).**
`direction_not_outgoing` (outgoing must be PROVEN — see D27), `payee_vpa_missing` (closes the D22 fail-open), `required_fields_missing` (amount + UTR + date all null). Also fixed vacuous `txn_id` grounding: GPay's `CICAgLii79OjJA` strips to `79` under `groundDigits` and matched any receipt; below a 6-digit floor it now grounds the literal string.

**Verified in production, both directions, on the same screenshots:**
- PhonePe incoming (the attack): 1 flag before → **3 flags after** (`amount_mismatch`, `payee_vpa_missing`, `direction_not_outgoing`)
- GPay outgoing (the legitimate case): **no** `direction_not_outgoing`, **no** `payee_vpa_missing` — clears on the platform VPA match

Tests: 448 passing / 3 known pre-existing failures.

**F0d — UTR-match and duplicate enforcement.** Hard-block at submission (not just admin-panel warning) when: (a) UTR already exists in non-rejected payments; (b) submitted UTR does not match `payload.utr` from the extraction. For (b): visible pop-up with contact details as escape hatch for OCR misreads. Requires F0a first (payload.utr is mutable until then).

**F1 — Profile verification prerequisite.** Verified email + verified phone required before payment submission. On app open with incomplete profile, show completion prompt.

**F2 — Conditional auto-approval (server-side only).** Auto-approves ONLY when: no flag fires whose `reason` is in the security-relevant allow-list (`utr_format`, `utr_duplicate`, `amount_mismatch`, `payee_vpa_mismatch`, `payee_vpa_missing`, `date_stale`, `direction_not_outgoing`, `required_fields_missing`), payer profile is verified, server-side auto-approve secret is enabled. **NOT "zero flags of any kind"** — cosmetic `ungrounded` flags are nondeterministic across identical uploads and would make auto-approval a coin flip. See PHASE2_ARCHITECTURE.md D28. On auto-approval: Pro unlocks via `source='auto_upi'` (same entitlement grant as `review_tournament_payment`). `AFTER UPDATE OF status` trigger automatically enqueues the notification — no additional wiring needed.

**F3 — Reapply pop-up on any flag.** Specific, human-readable pop-up (what's wrong + reapply action). No auto-approval when any flag fires.

**F4 — Admin oversight record + email for auto-approvals.** Every auto-approval visible in `/admin/payments` with an "auto-approved" filter/section. Email to chess.tushar@gmail.com via existing Resend outbox pattern.

**F5 — Secret-governed gate.** Supabase Edge Function secret only. Never in frontend. Never logged. Flipping it off reverts to full manual approval (Phase 2A behaviour) with no code change.

**F6 — Manual path preserved.** Anything that doesn't auto-approve (flags, unverified profile, secret off) flows to existing `PendingPaymentsPanel` with reasons. `review_tournament_payment` core entitlement logic unchanged.

### Phase 2A-3 — Nice-to-Have (P1)

- Reapply attempt limit: flag to admin after N rejections for same tournament (suggest 3), unlimited otherwise.
- Dashboard banner also briefly surfaces approved payments before clearing (vs current silent clear).

### Phase 2B — Must-Have (P0)

**F1 — Bank statement upload.** Admin page. PDF only. `privacy_class='sensitive'`.

**F2 — Local text extraction.** pdfplumber (not Gemini) for Pass 1. Returns transaction rows as JSON. Graceful error for scanned PDFs.

**F3 — Transaction matching.** UTR-to-payment matching: `reconciled`, `bank_only`, `system_only`.

**F4 — Reconciliation report.** Summary in admin UI: counts + per-payment reconciliation status.

**F5 — No cloud model for bank statement content.** pdfplumber only.

### Phase 2C–D — Must-Have (P0)

**F1 — API key management.** `api_keys` table with key generation, owner, rate limit tier, usage counts.

**F2 — REST API endpoint.** `POST /functions/v1/extract-api`. API key auth. Same request body and response as internal `/extract`.

**F3 — Usage metering.** `api_usage_logs` table per call.

**F4 — MCP server tools.** `extract_document`, `get_extraction`, `query_documents`.

**F5 — Multi-tenant isolation.** Each API key sees only its own extraction rows.

---

## Open Questions

### Phase 2A-3

- **Phone verification provider and cost.** OTP SMS is not free. Which provider, what budget, or is there a free/low-cost path? Email verification likely reuses existing Supabase auth email.
- **Reapply UX.** Modal vs inline. How many reapply attempts before forcing manual review?
- **`auto_upi` source value.** Needs the `source` CHECK on `tournament_entitlements` widened (mirroring how `manual_upi` was added).
- **Auto-approval decision location.** Inside `/extract` (has fresh flags and doc context, harder to tamper) vs a separate step invoked after extraction returns. Inside `/extract` is preferred — avoids a window where a tampered extraction row could affect the decision. *Note: F0a substantially reduces the tamper risk either way — `payload` and `field_flags` are no longer client-writable for `payment_screenshot`.*
- **RESOLVED — auto-approve gate shape.** Named security-relevant flag reasons, not flag count. See D28.

### Phase 2B

- **Where does pdfplumber run?** Options: Python microservice on Railway, Deno subprocess, WASM in Deno. Evaluate at Phase 2B start.

### Phase 2C–D

- **Pricing model.** Per-call (₹2–5/verification) or monthly tiers (₹500–2000/month)?

---

## Success Metrics

**Phase 2A (2 weeks post-deploy — measuring now):**
- Time from claim submission to admin approval decision: target <30 seconds for screenshot-backed claims.
- Flag accuracy: <5% false positives on clean legitimate screenshots.
- Fraudulent claim detection: >80% of deliberately wrong-amount or old-date screenshots flagged.
- Zero `auto_ok` statuses in `extractions` for `doc_type='payment_screenshot'`. ✅ Confirmed.

**Phase 2A-3 (2 weeks post-deploy):**
- Auto-approval rate for clean submissions with verified profiles: target >70%.
- False auto-approval rate: target 0% (zero payments auto-approved that should have been flagged).
- Reapply pop-up accuracy: target >95% (flag fires only when something is genuinely wrong).

**Phase 2B:**
- Upload to reconciliation report: <2 minutes for a 3-month statement.
- Match rate on known good UTRs: >95%.

**Phase 2C–D:**
- First external API call from Certificate Hub.
- First revenue from external API consumer within 4 weeks of Phase 2C launch.

---

## Timeline

- **Phase 2A:** ✅ Complete (shipped Jul 2026)
- **Phase 2A-2:** ✅ Complete (shipped Aug 2026)
- **Phase 2A-3:** 3–4 Claude Code sessions. Start with trust-hardening prerequisites (3b-4 scope) then auto-approval. New chat.
- **Phase 2B:** 2–3 sessions after 2A-3. New chat.
- **Phase 2C–D:** 4–5 sessions after 2B. New chat.
- **Phase 3 (Document Intelligence):** Separate PRD. After 2C–D.
- **Phase 4 (Gallery + Document Scanner):** Separate PRD. After Phase 3.
