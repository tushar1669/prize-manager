# Architecture — Phase 2: Universal Extraction Engine

**Status:** Accepted — Phase 2A, 2A-2 complete; Phase 2A-3 prerequisites F0a–F0e complete and production-verified; UI token migration complete; F0d closeout (tests + normalize_utr parity) next
**Date:** July–August 2026 (last revised 8 Aug 2026)
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
  F0d UTR match + duplicate hard-block      [DONE 4 Aug 2026]
  F0e payment-page failure states           [DONE 6 Aug 2026]
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
1. `direction_not_outgoing` — flag when `direction` is "incoming" or absent on a payment claim. A "Received from" receipt is never valid payment proof regardless of amount.
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

**D30 — UTR comparison is normalized and case-insensitive; "wrong identifier" is a distinct outcome (Accepted 4 Aug 2026).**

F0d compares UTRs in two places: duplicate detection at submit, and submitted-vs-extracted matching. Both use one canonical form: `upper(regexp_replace(utr, '[^A-Za-z0-9]', '', 'g'))`, implemented once as `public.normalize_utr(text)` (IMMUTABLE) and mirrored in `paymentTrustCheck.ts`. Storage remains verbatim-trimmed — the value the organizer typed is the audit trail.

*Case-insensitive:* a UPI RRN is 12 numeric digits (NPCI: YDDD + 8-digit STAN), so case cannot distinguish two references. Letters appear only on NEFT (~16 char) and RTGS (~22 char) references, where they are fixed uppercase bank codes. Two distinct references differing only in case is therefore not a reachable state, while a case-sensitive check would let a reused UTR through on a typing variation. Asymmetric risk.

*Separator-stripping:* bank e-statements render UPI references as `UPI/DR/123456789012/Name`, and OCR introduces spacing — the reason `groundDigits` already exists. Stripping non-alphanumerics loses nothing the format invariant permits. Note the limit: normalization handles separators *within* the reference (`1234 5678 9012`), not a full pasted statement line — that still fails the mismatch check, correctly.

*Wrong-identifier branch:* PhonePe and GPay each print two identifiers per receipt (UTR/UPI Ref No, plus an app-native transaction ID). Production data already contains both shapes in `payload.txn_id` (`T2607…`, `CICAgLii79OjJA`). A submitted value matching `txn_id` rather than `utr` is a predictable user error, not tampering, and resolves self-serve with a correction prompt. Only an unmatched value gets the contact-details escape hatch.

*Not a unique index:* two `approved` rows already share UTR `028862663052`. Enforcement lives in the RPC, where the "non-rejected only" semantics that make D15 resubmission work can be expressed. A partial unique index remains available as later hardening once historical test rows are resolved. *(Resolved 4 Aug — see D31: the index is now in F0d scope.)*

*Out of scope:* the `utr_format` invariant stays at 8–22 alphanumeric. Tightening to 12 numeric would be correct for UPI-only but forecloses NEFT/RTGS in Phase 3.

**D31 — F0d enforcement architecture: the RPC becomes the only client writer; the unique index is the concurrency backstop (Accepted 4 Aug 2026).**

Pre-work audit (4 Aug) found the submit-time checks would be decorative without closing three doors first: `tournament_payments` carried full-column INSERT/UPDATE (plus DELETE/TRUNCATE/TRIGGER) grants for `anon`/`authenticated` with permissive `users_insert_own_payments` and `users_update_own_pending_payments` policies, and the dead 3-arg/4-arg claim overloads were still live and `anon`-executable. Grep confirmed every client touch of the table in the repo is `.select(...)` — both policies are unused.

**Migration A — close the write surface (one migration, one rollback unit):**
- Drop `users_insert_own_payments` and `users_update_own_pending_payments`.
- Revoke INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES on `tournament_payments` from `anon` and `authenticated`; revoke SELECT from `anon`. `authenticated` keeps SELECT (Dashboard banner, payment page status, admin tables, martech hooks all read via existing policies).
- Drop the 3-arg and 4-arg `submit_tournament_payment_claim` overloads (zero callers, verified). Same migration as the surface closure: no window where unchecked doors coexist with new checks, and any breakage surfaces during Migration A verification before behaviour changes in Migration B.
- `review_tournament_payment`: revoke EXECUTE from `public` and `anon`, re-grant to `authenticated` (masters invoke it from the browser) and `service_role`. Grant-only — the body is untouched per guardrail 10. Verified 4 Aug that the body's first statement is a master check (`FORBIDDEN`), so the open `anon` grant was defense-in-depth debt, not a live hole.
- Side effect, accepted and deliberate: `master_full_payments` becomes read-only in practice, because the grant layer now blocks direct writes even where RLS would allow them. All master writes flow through `review_tournament_payment` (SECURITY DEFINER). Do not "fix" this later by re-granting.

**Migration B — checks inside the 5-arg RPC + backstop index:**
- `public.normalize_utr(text)` — IMMUTABLE, pure SQL, single definition per D30; mirrored in `paymentTrustCheck.ts`.
- **Duplicate hard-block:** `normalize_utr(p_utr)` found among non-rejected rows → raise `UTR_ALREADY_USED`. Rejected rows excluded so D15 resubmission with the same real UTR keeps working.
- **Mismatch, three-way branch** (only when `p_screenshot_extraction_id` is not null):
  1. normalized match against `payload.utr` → proceed;
  2. no match against `utr` but normalized match against `payload.txn_id` → raise `UTR_IS_TXN_ID` (frontend shows the correct UTR with a one-tap fill — self-serve, no contact needed);
  3. no match against either → raise `UTR_MISMATCH` (contact escape hatch).
- **Fail-closed on unreadable extracted UTR:** screenshot attached but `payload.utr` is null → raise `UTR_EXTRACTION_UNREADABLE` with guidance to retake the screenshot or submit without one. This closes the cropped-UTR replay shape before F2 (a screenshot with the UTR cropped out would otherwise pair with a freshly invented UTR each attempt, blinding duplicate detection). The honest-blurry cost is one extra step, and the UTR-only path remains available. Production has already seen this case once (26 Jul, extracted null).
- **Extraction ownership gate:** the linked extraction must be `doc_type='payment_screenshot'` and uploaded by the caller — OR the caller is master (the RPC already permits master-on-behalf submission; without the carve-out those would falsely fail).
- **Backstop index:** `CREATE UNIQUE INDEX ... ON tournament_payments (public.normalize_utr(utr)) WHERE status <> 'rejected'` — closes the TOCTOU race where two parallel submissions both pass the EXISTS check. The RPC catches `unique_violation` on it and re-raises `UTR_ALREADY_USED` so the client sees one error shape. Unblocked 4 Aug by rejecting test row `270dfc95` (28 Jul duplicate; the 29 Jul row remains the approved record; notification trigger fired correctly, one self-addressed cleanup email).
- `notify pgrst, 'reload schema'` in both migrations (overload drop and RPC replace both need cache reload).

**Frontend (step C):**
- Error handling for all four new codes. **Both** the duplicate and the mismatch dialogs carry the contact escape hatch (email + phone) — a normalization false positive, however unlikely, must have a human path, and my earlier plan gave the hatch to mismatch only.
- Early advisory duplicate warning: `/extract` already returns `field_flags` in its response, so a `utr_duplicate` flag surfaces a warning banner seconds after upload, before Submit. Advisory only — it never disables the button (the extracted UTR could be a misread); the server check is the truth.
- Every server-side block fires `logAuditEvent` so the false-positive rate is measured in week one. Softening, if needed, happens before F2 — not after.

**Known residuals, accepted:**
- *Consistent-but-wrong UTR:* OCR misreads a digit, organizer accepts the pre-fill → submitted and extracted agree, both wrong vs the bank. Only Phase 2B reconciliation closes this. F0d is a tamper-and-carelessness check, not a payment-truth check.
- *UTR-only valve:* submissions without a screenshot skip the mismatch check by construction (D1 keeps screenshots optional). Deliberate relief valve; safe under F2 because no-extraction claims can never auto-approve.
- *Screenshot replay via `file_hash`:* the same image resubmitted produces a new `extraction_documents` row with the same `file_hash`, and no invariant checks it. Narrow residual — readable-UTR replays are caught by the UTR duplicate checks, cropped-UTR replays by `UTR_EXTRACTION_UNREADABLE` — but a `file_hash` duplicate check belongs in the F2 gate. Tracked as new debt.
- *F0a dependency:* the mismatch check is only as strong as `payload.utr` immutability. If the F0a column grants or doc_type whitelist ever re-broaden (guardrail P1), this check compares against attacker-writable data.

**Maintenance rules created by this decision:**
- `normalize_utr` is **frozen** once the index exists: index entries are built with the function as-of creation, and Postgres never re-evaluates them. Any change requires drop-index → replace-function → recreate-index.
- Deliberate N1 exception: `normalize_utr` keeps EXECUTE for `authenticated`. Expression-index evaluation during DML runs as the invoking role; a blanket N1 revoke would make any future authenticated-role direct write (e.g. master via `master_full_payments` if grants were ever restored) fail with a confusing permission error on a pure string function that exposes nothing.
- One legitimate flow is knowingly blocked: one UPI transaction paying for two tournaments (single UTR, second submission → `UTR_ALREADY_USED`). No combined-payment product exists; the dialog copy must say "one payment per tournament" so the organizer understands it's policy, not a bug.

**D32 — A failed query must render an explicit state, never blank space (Accepted 6 Aug 2026).**

Found in production during F0d testing. `get_tournament_pro_price` raises `UNAUTHORIZED` for a non-owner; the payment page read only `data` and `isLoading` from that query and never `isError`. The result was a half-rendered page: the "Upgrade to Pro" card (which does not depend on pricing) drew normally, while the coupon and UPI sections vanished because they gated on `!pricingLoading`. Worse, `baseAmount` and `amountDue` both fall back to `0`, so the page offered "Pay ₹0" against a live QR code with an enabled Submit button. React Query then retried a permanently-failing error, producing visible flicker — 24 attempts captured in one HAR.

Three rules follow, and they generalise beyond this page:
1. **Gate on success, not on "not loading."** Sections that depend on a query must render only when that query's data is present. `!isLoading` is true in the error state too.
2. **Never retry a permanent error.** `UNAUTHORIZED` and `TOURNAMENT_NOT_FOUND` will not succeed on retry; retrying them costs backend calls and looks like a broken page.
3. **A money-bearing control must be disabled when its amount is unknown.** `amountDue <= 0` now disables Submit.

This is the same failure shape as D21: a surface that renders nothing is not obviously broken. Fixed in F0e.

**D33 — The app is permanently dark; styling uses semantic tokens (Accepted 6–8 Aug 2026).**

`tailwind.config.ts` sets `darkMode: ["class"]`, but nothing ever adds a `dark` class to `<html>` and no `.dark` block exists in `index.css` — the dark palette lives directly in `:root`. Two consequences, both verified by grep across the tree: all 185 `dark:` utilities were dead code that had never rendered, and 529 raw light-palette utilities (`bg-amber-100`, `text-amber-800`, …) rendered literally, painting near-white blocks on a near-black page. The `/admin/payments` evidence panel was the visible symptom; the defect was app-wide.

Rejected fix: adding `class="dark"` to `<html>`. It would have activated 185 never-rendered variants at once — trading an obvious bug for a subtle one — and left every literal utility without a `dark:` sibling still broken.

Accepted fix: migrate to the semantic tokens already defined in `index.css` (`--success`, `--warning`, `--info`, `--destructive`, `--accent`, `--status-*`), delete dead `dark:` variants, and codify the rules in `docs/design/UI_CONVENTIONS.md`. Four batches, ~45 files.

One bounded exception, documented in UI_CONVENTIONS §6: category chips in `CategoryCriteriaChips.tsx` encode a *kind of criterion*, not a status. Forcing them onto status tokens would assert meaning that does not exist; forcing them all to neutral would destroy information used for scanning. They keep raw hues at `bg-<hue>-500/15 text-<hue>-300 border-<hue>-500/30` — the `-300` shade being the actual fix, since `-700` was the dark-on-dark bug.

Allocation-engine safety: the engine is not in the frontend — it lives in `supabase/functions/allocatePrizes`, `allocateInstitutionPrizes` and `backfillTeamAllocations`, invoked by string name. A SHA-256 baseline of all 408 source files was taken before the sweep and re-diffed after every batch; the 9 engine files stayed byte-identical and nothing under `supabase/` changed. Each allocation-adjacent batch also proved, mechanically, that only `className` lines had changed and that non-className line counts were unmoved.

---

## 7. Security & Privacy

- `payment_screenshot` extractions: `privacy_class='public'`. Gemini free tier permitted.
- `bank_statement` extractions: `privacy_class='sensitive'`. Local processing only. Gemini prohibited.
- Payee VPA: Supabase secret, never in code, never in logs, never in frontend.
- `screenshot_extraction_id` on `tournament_payments`: FK with `ON DELETE SET NULL`.
- `return_to` on `tournament_payments`: CHECK constraint enforces same-site relative path. Validated independently in the 5-arg RPC (degrades to NULL on malformed input) and in `send-payment-notifications/index.ts` (`safeReturnTo`).
- Screenshot viewer: signed URL generated on click, 3600s expiry, `filePath` passed verbatim — never parsed or reconstructed. Raw storage URL never shown in address bar.
- API keys (Phase 2C): actual key shown once, then discarded. Only SHA-256 hash stored.
- Escape-hatch contact details (email + phone, D31) ship in the frontend bundle and the public repo. Accepted: the phone number is already user-facing via the payment-page UPI ID. Business contact only; nothing secret.

---

## 8. Known Debt from Audit

| Debt | Status |
|---|---|
| `tournament_payments` no repo DDL | ✅ Fixed `20260725120000` |
| `platform_feature_flags` no repo DDL | ✅ Fixed `20260725130000` |
| `doc_type` enum missing `payment_screenshot` | ✅ Fixed `20260725140000` |
| `extraction_schemas.notes` vs `description` column name | ✅ Fixed (uses `description`) |
| `submit_tournament_payment_claim` had no `screenshot_extraction_id` param | ✅ 4-arg overload added `20260729130000` |
| Client wrote `screenshot_extraction_id` directly via loose UPDATE policy | ✅ 5-arg overload closes this; frontend switched |
| Master could not read extraction rows under RLS | ✅ Fixed `20260730120000` |
| Both 3-arg and 4-arg claim overloads live with 5-arg | ✅ Dropped in F0d Migration A |
| Notification `MAX_ATTEMPTS=5` with no backoff | ⏳ Raise cap or add age-based backoff |
| L6 `return_to` — OPEN at 30 Jul, resolved as Option A | ✅ Done `20260730100000` |
| `supabase db execute` does not exist; correct is `supabase db query --linked -f` | ✅ Corrected; record in CLAUDE.md |
| CLAUDE.md says schema v3 active; actual is v5 | ⏳ Update CLAUDE.md after Phase 2A-3 |
| Supabase CLI migration drift (51 Lovable-managed migrations without local files) | ⏳ Fix with `supabase migration repair --status applied` per version |
| Root `npx tsc --noEmit` checks nothing (project-reference stub) | ✅ Identified; correct command is `npx tsc -p tsconfig.app.json --noEmit` (12 pre-existing errors baseline) |
| `extractions` UPDATE policy too broad — blocks auto-approval | ✅ Fixed `20260802124253` (F0a); see D29 |
| Three fail-open trust invariants | ✅ Fixed (F0c); see D27 |
| `payment_screenshot` schema v2 fields | ✅ v2 `20260802165554`, v3 `20260803181034` (F0b) |
| UTR-match enforcement (submitted UTR must match extracted UTR) | ✅ Done F0d Migration B `20260804160000` |
| Hard-block duplicate UTR at submission | ✅ Done F0d Migration B `20260804160000` |
| Direction marker regexes lack `\b` word boundaries | ⏳ LOW — `sent to` also matches inside `present to`; bounded by D27's non-unique-block property |
| Auto-approve gate must use named reasons, not flag count | ⏳ **HIGH — implement in F2**; see D28 |
| `tsconfig.app.json` does not cover `supabase/functions/` or `tests/` | ⏳ MEDIUM — the tsc check is blind to all edge-function work |
| `tournament_payments` client write grants + unused write policies | ✅ Done F0d Migration A `20260804120000` |
| `review_tournament_payment` EXECUTE-able by `anon` | ✅ Done F0d Migration A (grant-only) |
| No duplicate-screenshot (`file_hash`) invariant | ⏳ MEDIUM — F2 scope. Readable-UTR replays are caught by UTR duplicate checks; cropped-UTR replays by `UTR_EXTRACTION_UNREADABLE` (D31); the `file_hash` check closes the remainder |
| `normalize_utr` frozen once backstop index exists | ⏳ Standing rule (D31) — changing it requires drop-index → replace → recreate |
| `normalize_utr` not mirrored in `paymentTrustCheck.ts` | ⏳ HIGH — next. Advisory duplicate banner compares exactly; server compares normalised |
| F0d test suite not written | ⏳ HIGH — next. `EXTRACTION_NOT_OWNED` has no production coverage |
| No UI guard test enforcing UI_CONVENTIONS.md | ⏳ MEDIUM — next |
| F2 decline messages are a fraud oracle | ⏳ HIGH — F2 design. Naming the failed invariant lets an attacker iterate; recommend generic message to organizer, itemised reasons in /admin/payments only |

---

## 9. Phase 2 Test Strategy

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

### F0d additions (D30/D31)

```
- duplicate: normalized UTR exists on a non-rejected row → UTR_ALREADY_USED
- duplicate: same UTR exists only on rejected rows → proceeds (D15 resubmission)
- duplicate: case/separator variant of an existing UTR ("sbin 1234...") → UTR_ALREADY_USED
- mismatch: submitted ≠ extracted utr, = extracted txn_id → UTR_IS_TXN_ID
- mismatch: submitted matches neither → UTR_MISMATCH
- unreadable: screenshot linked, payload.utr null → UTR_EXTRACTION_UNREADABLE
- ownership: extraction uploaded by another user, caller not master → blocked
- ownership: master submits with organizer's extraction → proceeds
- race: two concurrent submissions, same normalized UTR → exactly one succeeds (backstop index)
- normalize_utr parity: SQL and paymentTrustCheck.ts produce identical output on shared fixtures
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
