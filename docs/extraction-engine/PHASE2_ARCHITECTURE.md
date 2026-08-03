# Architecture — Phase 2: Universal Extraction Engine

**Status:** Accepted — Phase 2A and 2A-2 complete; Phase 2A-3 prerequisites F0a/F0b/F0c complete and production-verified, F0d next
**Date:** July–August 2026 (last revised 3 Aug 2026)
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
  payment_screenshot → evidence on tournament_payments [review_tournament_payment, unchanged]

Phase 2A-2 (complete):
  payment lifecycle → notification outbox + email + dashboard banner + admin surface

Phase 2A-3 (in progress):
  F0a close extractions UPDATE policy        [DONE 2 Aug 2026]
  F0b payment_screenshot schema v2 -> v3    [DONE 3 Aug 2026]
  F0c three new trust invariants            [DONE 3 Aug 2026]
  F0d UTR match + duplicate hard-block      [NEXT]
  F1  profile verification / F2 auto-approve gate

Phase 2B (blocked on 2A-3):
  bank_statement → reconciliation report              [new read-only view]

Phase 2C-D (blocked on 2B):
  REST API + MCP → external access to all doc_types   [new api_keys table + wrapper]
```

**Critical constraint:** `payment_screenshot` and `bank_statement` extractions must NEVER flow into `commit-extraction` or `commit_extraction_transaction`. Those RPCs write to `tournaments/categories/prizes`. Payment data has its own commit path: `review_tournament_payment` (existing, proven, handles entitlements correctly).

---

## 2. Phase 2A — Payment Screenshot Verifier (COMPLETE)

### 2.1 Flow as built

```
Organizer (TournamentUpgrade.tsx)
    │ 1. [OPTIONAL] Upload screenshot → extraction-uploads/{uid}/payments/{tournament_id}/{uuid}{ext}
    │ 2. Enter UTR text (pre-filled from extraction if available; user-editable)
    ▼
[If screenshot provided]:
    Upload to bucket → insert extraction_documents → POST /extract → invoke returns extraction_id
    (payload.utr pre-fills the UTR input via a follow-up extractions read)
    ▼
RPC: submit_tournament_payment_claim(tournament_id, amount_inr, utr, screenshot_extraction_id, return_to)
    │ validates owner, canonical price, UTR length ≥6, one-pending-per-tournament
    │ return_to validated server-side (relative path only, degrades to NULL if malformed)
    ▼
tournament_payments (status='pending', screenshot_extraction_id=uuid|null, return_to=text|null)

AFTER UPDATE OF status trigger → enqueue_payment_notification() → payment_notification_outbox
pg_cron (*/2) → send-payment-notifications edge fn → Resend email
    approve email: deep-links to return_to if set, else /t/{id}/setup?tab=details
    reject email:  links to /t/{id}/payment (+ ?return_to= for resubmission flow)

Master → /admin/payments → PendingPaymentsPanel (pending queue) + All Payments (full history)
    Evidence block: extracted fields, claimed vs on-screenshot amounts, payee VPA status, flags
    Screenshot: in-app Dialog via getSignedUrl("extraction-uploads", file_path, 3600)
    │ Master clicks Approve
    ▼
RPC: review_tournament_payment(payment_id, 'approve', note)  ← UNCHANGED
    │ inserts tournament_entitlements (source='manual_upi', 365 days)
    │ trigger fires again → enqueue approve notification
    ▼
has_full_access = true

Organizer Dashboard: banner cleared (payment_alerts query returns empty after entitlement active)
```

### 2.2 Extraction schema — payment_screenshot v1 (current)

```json
{
  "type": "object",
  "required": ["amount_inr", "utr"],
  "properties": {
    "amount_inr":   { "type": "number", "description": "Payment amount in INR" },
    "utr":          { "type": "string", "description": "UPI Transaction Reference" },
    "txn_date":     { "type": "string", "format": "date" },
    "payee_vpa":    { "type": "string", "description": "UPI VPA of the recipient" },
    "payer_name":   { "type": "string", "description": "Sender's display name" },
    "status_text":  { "type": "string", "description": "e.g. 'Payment Successful'" },
    "app":          { "type": "string", "description": "GPay, PhonePe, Paytm, BHIM, etc." }
  }
}
```

**Known gaps addressed by v2 (see §2A-3):** Missing `direction` (Paid to / Received from), `payee_name` (recipient display name, distinct from `payer_name`), and `txn_id` (PhonePe Transaction ID, separate from UTR).

### 2.3 The 5 trust invariants (current)

All live in `extract/paymentTrustCheck.ts`. Fail-open paths noted — all three block auto-approval and require new invariants in v2:

| Invariant | What it checks | Fail-open gap |
|---|---|---|
| `utr_format` | 8–22 alphanumeric | None |
| `utr_duplicate` | UTR not already in non-rejected payments | None |
| `amount_mismatch` | Extracted amount = expected ± ₹1 | **Gap: if `amount_inr` is null (OCR fail), check is skipped entirely — zero flags** |
| `payee_vpa_mismatch` | Extracted VPA = `PLATFORM_PAYEE_VPA` secret | **Gap: if `payee_vpa` is null (not on screenshot), check is skipped — zero flags** |
| `date_stale` | `txn_date` not older than 30 days | None |

**Third fail-open (no invariant at all):** A "Received from" receipt (incoming money) currently passes everything if the amount matches. PhonePe explicitly labels direction: "Paid to" / "Received from". This is unambiguous and parseable — the extraction just doesn't capture it yet.

### 2.4 Force needs_review

```typescript
if (doc.doc_type === 'payment_screenshot') {
  return { status: 'needs_review', confidence: computedConfidence };
}
```
This is unconditional for Phase 2A. Phase 2A-3 adds a conditional auto-approve path alongside it (see D8).

---

## 3. Phase 2A-2 — Payment Lifecycle (COMPLETE)

### 3.1 Notification architecture

Three components, all shipped and production-verified:

1. **`payment_notification_outbox` table** — one row per (payment_id, action), unique index enforces exactly-once. State machine: `pending → sending → sent | failed | skipped`. RLS: master read-only; no client writes.

2. **`enqueue_payment_notification()` trigger function** — SECURITY DEFINER, fires `AFTER UPDATE OF status` on `tournament_payments`. Snapshots `profiles.email`, `review_note`, `return_to` into the outbox row. `ON CONFLICT (payment_id, action) DO NOTHING`.

3. **`send-payment-notifications` edge function** — `verify_jwt=false`. Constant-time shared-secret auth (`x-notify-secret` header). Batch drain of 20, `MAX_ATTEMPTS=5`. `safeReturnTo` validation in-flight (defence in depth beyond the DB constraint). Drained by pg_cron every 2 minutes via `net.http_post`.

4. **`reap_stuck_payment_notifications()`** — resets `sending` rows >10 min back to `failed`. Runs same cron tick before the drain.

**Why a trigger rather than enqueue inside `review_tournament_payment`:** Guardrail 10 forbids touching that RPC. The trigger catches every future writer (including Phase 2A-3's auto-approval path) with no additional wiring.

### 3.2 Admin payments surface

Two components rendered on `/admin/payments`:
- **`PendingPaymentsPanel`** — pending queue with extraction evidence, flag chips, and screenshot dialog
- **All Payments table** (`AdminPayments.tsx`) — full history across all statuses; claimed vs extracted amounts (with MISMATCH label); attempt ordinal per (tournament_id, user_id); in-row expand chevron showing `PaymentExtractionEvidence`

**Shared component:** `src/components/payments/PaymentEvidence.tsx` — used by both surfaces. Rules live here once: opaque evidence row backgrounds, `payee_vpa` null shown as active caution, `confidence` rendered as `Math.round(confidence * 100)%`.

**Screenshot viewer:** In-app shadcn Dialog, image signed on click (not on mount), `filePath` passed through verbatim (two path shapes exist: old flat, new tournament-scoped). `onError` fallback visible inside Dialog. "Open in new tab" link retained inside Dialog for zooming.

### 3.3 RLS policies added in this phase

| Policy | Table | Effect |
|---|---|---|
| `Masters read all extraction files` | `storage.objects` | Master can read any file in `extraction-uploads` |
| `Masters read all extraction documents` | `extraction_documents` | Master can read any doc row |
| `Masters read all extractions` | `extractions` | Master can read any extraction row |
| `payment_notification_outbox` master read | `payment_notification_outbox` | Master can read all outbox rows |

**RLS defect found and fixed (D21):** The `extractions` and `extraction_documents` master policies were missing despite the storage policy existing. A master reviewing another user's payment got HTTP 200 with an empty array — the evidence panel silently rendered nothing. Fixed in `20260730120000`. These three policies must always be added together.

---

## 4. Phase 2B — Bank Statement Reconciliation (planned)

### 4.1 Architecture decision: local lane only

Bank statements are `privacy_class='sensitive'`. Per ARCHITECTURE.md D1, free-tier cloud models are prohibited. pdfplumber (Python, free) for Pass 1. Covers ~90% of Indian bank statements (text PDFs). Scanned PDFs receive a graceful error.

### 4.2 Open decision: where does pdfplumber run?

Options (evaluate at Phase 2B start): Python microservice on Railway (recommended), Deno subprocess, or WASM pdfplumber in Deno. See D4.

---

## 5. Phase 2C–D — REST API + MCP Server (planned)

New tables: `api_keys` (key_hash, tier, rate limits), `api_usage_logs`. New edge function `extract-api` with API key auth. Three MCP tools: `extract_document`, `get_extraction`, `query_documents`. Multi-tenant isolation via `uploaded_by = api_key.owner_id`. See D7.

---

## 6. Decision Log

**D1 — Screenshot upload is optional in Phase 2A (Accepted).**
Making it required immediately would break mid-session organizers. Optional first; make required after 2-week validation. Controlled by a feature flag.

**D2 — Commit path: FK linkage, not a new edge function (Accepted).**
`screenshot_extraction_id` FK on `tournament_payments`, `review_tournament_payment` unchanged. Extraction data is reference evidence, not a gate.

**D3 — Force `needs_review` always (SUPERSEDED by D8).**
Original: even a clean extraction requires a human click. Superseded by conditional auto-approval (D8) in Phase 2A-3. Base 2A shipped with D3 behaviour; D8 is the evolution.

**D4 — Bank statements: pdfplumber only, no Gemini (Accepted).**
`privacy_class='sensitive'`. Local processing only. Scanned PDFs get a graceful error.

**D5 — `payee_vpa` stored as Supabase secret (Accepted).**
Platform UPI VPA never in code or logs. Read from `Deno.env.get('PLATFORM_PAYEE_VPA')` at runtime.

**D6 — `tournament_id` passed to `/extract` for payment screenshots (Accepted).**
Amount-match invariant requires the expected price. `/extract` accepts optional `tournament_id` in request body.

**D7 — Phase 2A scope: Prize Manager only (Accepted).**
Certificate Hub and Sportup consume via REST API (Phase 2C). Phase 2A internal only.

**D8 — Conditional auto-approval (Accepted 26 Jul 2026; supersedes D3).**
A payment auto-approves ONLY when: (1) all trust invariants pass with zero flags, (2) payer profile verified (email + phone), (3) server-side auto-approve secret enabled. Every auto-approval writes an admin oversight record and emails chess.tushar@gmail.com. Any flag, unverified profile, or secret off → `needs_review` + manual queue + reapply pop-up. Governed by Supabase Edge Function secret — server-only, never in frontend, instantly reversible. See PROJECT_STATE guardrail 8.

**D9 — Auth resolution must fail safe (Accepted 26 Jul 2026).**
The role-resolution path must treat unresolved/errored/empty `user_roles` reads as "unknown — retry / show loading", never as "not master". See PROJECT_STATE guardrails M1–M2.

**D10 — Role gates must check `authzStatus` before `is_master`; `useAuth` to become a context (Accepted 26 Jul 2026).**
(a) Immediate: `authzStatus !== 'ready'` spinner before every `is_master` check in all 7 admin components.
(b) Architectural: promote `useAuth` to a single `AuthProvider` context. Completed as D16. See M3–M4.

**D11 — Payment screenshots: tournament-scoped path in existing bucket (Accepted 28 Jul 2026).**
Path: `extraction-uploads/{uid}/payments/{tournament_id}/{uuid}{ext}`. Existing upload/read RLS unchanged (folder[1] still the uid). Master read policy added on `storage.objects`.

**D12 — Payment status notification: email via Resend outbox + in-app banner (Accepted 28 Jul 2026).**
Two channels, both free with existing infrastructure. Email uses the idempotent outbox pattern (exactly-once via unique index on `(payment_id, action)`). In-app is a Dashboard banner driven by `tournament_payments` WHERE `status IN ('pending','rejected')` AND no active entitlement.

**D13 — `/admin/payments` is its own route (Accepted 28 Jul 2026).**
Separated from `/admin/users`. Payment approvals have different cadence, different eventual reviewers, and will grow significantly with auto-approval oversight in 2A-3.

**D14 — Extracted UTR pre-fills but never overrides the user (Accepted 28 Jul 2026).**
OCR is good, not perfect. Pre-fill if field is empty; clear the pre-fill indicator on any edit; submit whatever is in the field. Implemented with `utrValueRef` to handle the race between a 90-second extraction and typing.

**D15 — Rejection is non-terminal; attempts are retained (Accepted 28 Jul 2026).**
Rejected claim is a fact, not a dead end. The organizer can submit a new claim (partial unique index `WHERE status='pending'` enforces one pending at a time). Prior attempts are never deleted — they are the fraud audit trail.

**D16 — `useAuth` promoted to `AuthProvider` context (Accepted 29 Jul 2026).**
Completes D10(b). Provider: inside `QueryClientProvider`, outside `BrowserRouter`, wraps `AppInner`. M3 guard-level `authzStatus` checks retained as fail-safe. Shipped commit `a245902`.

**D17 — Notification layer: dedicated outbox table + DB trigger + cron-drained sender (Accepted 29 Jul 2026).**
Implements and refines D12. The trigger fires on any `status` transition — it catches Phase 2A-3's auto-approval path with no additional wiring. Exactly-once via `ON CONFLICT (payment_id, action) DO NOTHING`. `reap_stuck_payment_notifications()` prevents silent notification loss from dead isolates.

**D18 — Function grant hygiene: both revoke paths, always (Accepted 29 Jul 2026).**
Two independent grant paths on this project: `PUBLIC` and the direct default-privilege grant to `anon`/`authenticated`. Closing one leaves the other open. Both must be closed in every migration that creates or replaces a function. See PROJECT_STATE N1.

**D19 — Secret rotation for edge functions is a three-place, ordered operation (Accepted 30 Jul 2026).**
Edge functions bake env vars at deploy time. Dashboard secret update alone does nothing to a running deployment. Order: (1) Dashboard save, (2) `supabase functions deploy`, (3) Vault update. See PROJECT_STATE N2.

**D20 — L6 flow resumption needs `return_to` store (Accepted 30 Jul 2026, Option A).**
`return_to text` added to `tournament_payments`, set at claim time via 5-arg RPC, copied to outbox by the trigger. The approve email deep-links to it. Malformed values degrade to NULL (payment still goes through). Validated client-side by `getSafeReturnToPath` (strictest of three validators: must be `/t/{id}/` + allowlisted segment).

**D21 — Master RLS read defect: extraction rows were invisible to master (Found and fixed 30 Jul–2 Aug 2026).**
`extractions` and `extraction_documents` had only "Users can view own…" SELECT policies. A master reviewing a payment submitted by a different user got HTTP 200 with an empty array — the admin evidence panel silently rendered nothing. `storage.objects` had a master policy since migration `20260729120000`, but the two table policies were never added. Fixed in `20260730120000`. **Lesson:** the storage policy and the table policies must always be added together. An admin panel that displays nothing is not obviously broken.

**D22 — `payee_vpa` null is fail-open, not verified (Found 2 Aug 2026; pending fix in 2A-3).**
`paymentTrustCheck` guards the VPA comparison with `if (payload.payee_vpa && allowedVpa)`. When `payee_vpa` is null — as it is on any "Received from" (incoming) receipt — the check silently skips and produces zero flags on that axis. Under manual review this is manageable because the admin panel now shows a "NOT VERIFIED" caution. Under auto-approval a null VPA means the payee allow-list was never checked. Fix: add a `payee_vpa_missing` flag when the field is null. Part of the three fail-open invariants all requiring new `required_field_missing` / `direction_not_outgoing` invariants.

**D23 — Payment screenshot schema needs v2 (Decided 2 Aug 2026; pending implementation in 2A-3).**
From examining real PhonePe receipts (both "Paid to" outgoing and "Received from" incoming):
- `direction` (string: "outgoing" / "incoming") — PhonePe labels it unambiguously. Feeds `direction_not_outgoing` invariant.
- `payee_name` (string) — the recipient's display name (e.g. "NEW PRASHAANT ENTERPRISES"). Distinct from `payer_name`: on an outgoing proof the payer (phone owner) is not shown; on an incoming proof the payee is not shown. Current schema only has `payer_name`, which is present on the wrong kind of receipt.
- `txn_id` (string) — PhonePe Transaction ID (format: `T2607...`), distinct from UTR. Present on both receipt types. Doubles the duplicate-detection surface: a UTR can be edited, but faking both UTR and txn_id coherently is harder.
New `extraction_schemas` row: v2, `is_active=true`; v1 set `is_active=false`.

**D24 — Three fail-open trust layer paths require new invariants before auto-approval (Decided 2 Aug 2026).**
Under manual review, fail-open paths are tolerable because a human sees the evidence. Under auto-approval, any path that produces zero flags is an auto-approve condition — meaning it can be exploited. Three new invariants required in Phase 2A-3 preprocessing:
1. `direction_not_outgoing` — flag when `direction` is "incoming" or absent. A "Received from" receipt is never valid payment proof regardless of amount.
2. `payee_vpa_missing` — flag when `payee_vpa` is null. Absence means the VPA invariant never ran.
3. `required_fields_missing` — flag when OCR produces null on all required fields (`amount_inr`, `utr`, `txn_date` all null). Catches deliberately unreadable or cropped screenshots. Currently these produce zero flags and would auto-approve.

**D25 — `extractions` UPDATE policy must be investigated before auto-approval (Decided 2 Aug 2026).**
`Users can update own extractions` has no column restriction and no `WITH CHECK`. An organiser can `UPDATE extractions SET payload='{"amount_inr":500,"utr":"GOODUTR"}', field_flags='[]'` on their own extraction row after the trust layer has written its verdict. This rewrites the evidence auto-approval reads. Under manual review: the admin sees the now-altered fields, which is bad but visible. Under auto-approval: the entire five-invariant trust layer is bypassable with one PATCH. **This must be investigated and fixed before Phase 2A-3 ships auto-approval.**
Investigation question: does `BrochureReview.tsx` or any Phase 1 brochure review flow write back to `extractions.payload` or `extractions.field_flags`? If yes: the policy must be narrowed (column restriction or `WITH CHECK` that prevents zeroing flags). If no: revoke the UPDATE for `payment_screenshot` extractions, or revoke entirely and confirm Phase 1 still works.

**D26 — Pass-1 OCR is a structured semantic digest, NOT a verbatim transcription (Discovered 2-3 Aug 2026).**
This invalidates any design that grounds a value against literal on-screen wording. Real evidence, three receipts:

| Receipt | What the screen says | What Pass-1 OCR emitted |
|---|---|---|
| PhonePe outgoing | "Paid to" | `Payee Details / Name: ... / Debited from:` |
| GPay outgoing | "To TUSHAR SARASWAT" | `Recipient Information / Sender Information` |
| PhonePe incoming | "Received from" | `Sender Details / Recipient Details / Credited to:` |

Pass 1 reorganises the receipt into labelled sections and discards the literal wording. The phrase "Paid to" appears in NO OCR output despite being printed on the screen. Any `groundString` match against expected on-screen text will therefore fail, and `trustCheck.ts:297-306` blanks ungrounded leaves to null. **Corollary:** when designing a new field, check what Pass 1 actually emits for it before assuming the model can transcribe it.

**D27 — Direction is derived by regex over `ocr_text`, not from a model-filled field (Accepted 3 Aug 2026; supersedes D23's `direction` field).**
`direction_label` was added in schema v2 per D23 and removed in v3 after three fixtures. It returned `null` (PhonePe outgoing), `"Recipient Name:"` (GPay outgoing) and `"Credited to"` (PhonePe incoming) — inconsistent, and the null case fired a HIGH `ungrounded` flag on a *legitimate* outgoing payment, a false positive that would block auto-approval for real customers.

Replacement rule, implemented in `paymentTrustCheck.ts`:

> **Outgoing is PROVEN if EITHER (a) `payee_vpa` is present and equals `PLATFORM_PAYEE_VPA`, OR (b) an outgoing marker appears in `ocr_text` and no incoming marker does. Otherwise flag `direction_not_outgoing`.**

Outgoing markers: `debited from`, `debit amount`, `paid to`, `money sent`, `sent to`. Incoming markers: `credited to`, `received from`, `money received`, `credit amount`.

"Neither marker present" is deliberately NOT an automatic flag — GPay prints no direction phrase at all and must clear on the VPA match. Two properties make this safe:
- `ocr_text` lives on `extraction_documents`, which F0a made immutable to clients, so the signal is tamper-resistant. The model gets no vote on direction.
- `direction_not_outgoing` can never *uniquely* block a legitimate payment: it only fires when `payeeVpaIsPlatform` is false, which already raises `payee_vpa_missing` or `payee_vpa_mismatch`.

Known caveat: if `PLATFORM_PAYEE_VPA` is unset/misconfigured, all GPay receipts flag (fail-closed, but would look like a mystery outage).

**D28 — Auto-approval must gate on a NAMED set of flag reasons, not on flag count (Accepted 3 Aug 2026).**
The PRD originally defined auto-approval as "all trust invariants pass with zero flags". Production evidence shows that is unworkable. The same GPay screenshot uploaded twice, with **byte-identical `ocr_text`**, produced:
- run 1: `app` = `"G Pay"`, grounded, no flag
- run 2: `app` = `null`, **HIGH `ungrounded` flag**

Pass-2 model nondeterminism on a cosmetic field. Under a zero-flags rule the same customer paying the same amount auto-approves or not on a coin flip. **Decision:** F2's gate keys on a security-relevant allow-list — `utr_format`, `utr_duplicate`, `amount_mismatch`, `payee_vpa_mismatch`, `payee_vpa_missing`, `date_stale`, `direction_not_outgoing`, `required_fields_missing`. Cosmetic `ungrounded` flags on `app`/`status_text`/`payer_name` remain visible in `/admin/payments` but must not block.

**D29 — Client writes to `extractions` are closed by column grants + a doc_type-whitelisted policy (Accepted 2 Aug 2026; resolves D25).**
Investigation answered D25's question: `BrochureReview.tsx` DOES write back to `extractions.payload` (approveMutation, load-bearing — `commit-extraction:125` re-reads payload from the DB) and `extractions.status` (discardMutation). It never writes `field_flags`. So revoking UPDATE entirely was not an option; narrowing was.

Implemented in `20260802124253`:
- Column privileges (RLS cannot restrict columns; GRANT can): `authenticated` keeps UPDATE on `payload`, `status`, `updated_at` only. `field_flags`, `grounding`, `confidence`, `reviewed_*`, `linked_tournament_id` are unwritable by any client for every doc_type.
- Policy `Users can update own extractions` narrowed with a `doc_type = 'chess_brochure'` **whitelist** (not a `payment_screenshot` blacklist), so `bank_statement` arrives closed by default in Phase 2B.
- **New finding beyond D25:** `extraction_documents` had an unused `Users can update own documents` UPDATE policy with no column restriction. `doc_type` lives on that table, so a doc_type-only fix would have been defeated by flipping `doc_type` first. Dropped. **Both tables must close together or neither closes.**

Negative-tested as the owning organiser inside rolled-back transactions: rewriting `field_flags` → `42501 permission denied` (grant layer); rewriting only `payload` on a payment screenshot → `0 rows` (RLS layer). Tested separately because the grant layer alone would not have stopped the second case.

---

## 6. Security & Privacy

- `payment_screenshot` extractions: `privacy_class='public'`. Gemini free tier permitted.
- `bank_statement` extractions: `privacy_class='sensitive'`. Local processing only. Gemini prohibited.
- Payee VPA: Supabase secret, never in code, never in logs, never in frontend.
- `screenshot_extraction_id` on `tournament_payments`: FK with `ON DELETE SET NULL`.
- `return_to` on `tournament_payments`: CHECK constraint enforces same-site relative path. Validated independently in the 5-arg RPC (degrades to NULL on malformed input) and in `send-payment-notifications/index.ts` (`safeReturnTo`).
- Screenshot viewer: signed URL generated on click, 3600s expiry, `filePath` passed verbatim — never parsed or reconstructed. Raw storage URL never shown in address bar.
- API keys (Phase 2C): actual key shown once, then discarded. Only SHA-256 hash stored.

---

## 7. Known Debt from Audit

| Debt | Status |
|---|---|
| `tournament_payments` no repo DDL | ✅ Fixed `20260725120000` |
| `platform_feature_flags` no repo DDL | ✅ Fixed `20260725130000` |
| `doc_type` enum missing `payment_screenshot` | ✅ Fixed `20260725140000` |
| `extraction_schemas.notes` vs `description` column name | ✅ Fixed (uses `description`) |
| `submit_tournament_payment_claim` had no `screenshot_extraction_id` param | ✅ 4-arg overload added `20260729130000` |
| Client wrote `screenshot_extraction_id` directly via loose UPDATE policy | ✅ 5-arg overload closes this; frontend switched |
| Master could not read extraction rows under RLS | ✅ Fixed `20260730120000` |
| Both 3-arg and 4-arg claim overloads live with 5-arg | ⏳ Drop 3-arg after confirming zero callers |
| Notification `MAX_ATTEMPTS=5` with no backoff | ⏳ Raise cap or add age-based backoff |
| L6 `return_to` — OPEN at 30 Jul, resolved as Option A | ✅ Done `20260730100000` |
| `supabase db execute` does not exist; correct is `supabase db query --linked -f` | ✅ Corrected; record in CLAUDE.md |
| CLAUDE.md says schema v3 active; actual is v5 | ⏳ Update CLAUDE.md after Phase 2A-3 |
| Supabase CLI migration drift (51 Lovable-managed migrations without local files) | ⏳ Fix with `supabase migration repair --status applied` per version |
| Root `npx tsc --noEmit` checks nothing (project-reference stub) | ✅ Identified; correct command is `npx tsc -p tsconfig.app.json --noEmit` (12 pre-existing errors baseline) |
| `extractions` UPDATE policy too broad — blocks auto-approval | ✅ Fixed `20260802124253` (F0a); see D29 |
| Three fail-open trust invariants | ✅ Fixed (F0c); see D27 |
| `payment_screenshot` schema v2 fields | ✅ v2 `20260802165554`, v3 `20260803181034` (F0b) |
| UTR-match enforcement (submitted UTR must match extracted UTR) | ⏳ HIGH — F0d, next |
| Hard-block duplicate UTR at submission | ⏳ HIGH — F0d, next |
| Direction marker regexes lack `\b` word boundaries | ⏳ LOW — `sent to` also matches inside `present to`; bounded by D27's non-unique-block property |
| Auto-approve gate must use named reasons, not flag count | ⏳ **HIGH — implement in F2**; see D28 |
| `tsconfig.app.json` does not cover `supabase/functions/` or `tests/` | ⏳ MEDIUM — the tsc check is blind to all edge-function work |

---

## 8. Phase 2 Test Strategy

### Phase 2A-3 test additions (add to test suite)

```
- direction_not_outgoing: "Received from" screenshot → flag direction_not_outgoing
- direction_not_outgoing: "Paid to" screenshot → no direction flag
- payee_vpa_missing: null payee_vpa → flag payee_vpa_missing
- required_fields_missing: all null payload → flag required_fields_missing
- UTR match: submitted UTR ≠ extracted UTR → block with pop-up
- UTR match: submitted UTR = extracted UTR → proceed normally
- auto-approve: all invariants pass + verified profile + secret on → source='auto_upi'
- auto-approve: any flag → needs_review, no auto-approval
- auto-approve: unverified profile → needs_review, no auto-approval
- auto-approve: secret off → needs_review even if all invariants pass
```

### Phase 2A verification (existing, keep running)

```sql
-- All payment extractions must be needs_review, never auto_ok
select status, count(*) from extractions
join extraction_documents d on d.id = document_id
where d.doc_type = 'payment_screenshot'
group by status;
-- Expected: all rows have status = 'needs_review'

-- Master can read extractions from other users
select count(*) from extractions; -- run as master, must match total row count
```
