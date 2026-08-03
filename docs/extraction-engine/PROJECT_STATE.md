# PROJECT_STATE — Prize Manager · Universal Extraction Engine
**Last updated:** 3 August 2026 · **Owner:** Tushar · **This file is the single source of truth for continuing work in any new chat.**

Replace the previous PROJECT_STATE.md in the repo with this file. Paste it at the start of every new chat to re-establish context.

---

## 1. What this project is

**Prize Manager** (prize-manager.com) is a chess tournament management platform. Phase 1 built a brochure extraction engine: organizer uploads a PDF brochure → two-pass Gemini OCR + structured extraction + deterministic trust/grounding layer → review screen → on Approve, a tournament is created with categories and prizes.

**Phase 2** extends the same extraction engine into a Universal Extraction Engine serving three platforms and eventually external developers. The engine is doc-type-driven; adding a new document type (payment screenshots, bank statements) requires only a new schema row and new trust invariants — not a new pipeline.

**Three-platform context** (all share the same extraction infrastructure):
- **prize-manager.com** — Tournament prize management (live). Phase 2A/2A-2 added payment screenshot verification and the full payment lifecycle.
- **certificate-hub.com** — Certificate creation service; paywalled. Will consume the extraction engine via REST API (Phase 2C).
- **sportup.online** — Discovery + tournament management platform. Will consume via REST API (Phase 2C).

---

## 2. Key identifiers

| Item | Value |
|---|---|
| Supabase project | `nvjjifnzwrueutbirpde` (prize-manager.com, ap-south-1, Postgres 17) |
| Edge functions | `extract` (**v44**), `commit-extraction` (v13), `send-payment-notifications` (v7, `verify_jwt=false`), `sendWelcomeOnboardingEmail` (v20) |
| Active extraction schema | `extraction_schemas` v5 (chess_brochure), **v3 (payment_screenshot)** — v1 and v2 `is_active=false` |
| Storage buckets | `extraction-uploads` (images + PDF, 10MB, per-user RLS + master read on both `storage.objects` and the `extractions`/`extraction_documents` tables), `brochures`, `exports`, `imports` |
| Feature flags | `brochure_import` = ON |
| Repo | github.com/tushar1669/prize-manager (**public**) · branch: **main** · active feature branch `feat/phase-2a3-trust-hardening` |
| Gemini model | `GEMINI_MODEL` env secret = `gemini-3.1-flash-lite` (matches `DEFAULT_GEMINI_MODEL` in `_shared/geminiProvider.ts`) |
| Local paths | repo `~/Desktop/prize-manager`, test PDFs `~/Desktop/prize-manager/test-brochures/` |
| Trust layer constants | `SUM_TOLERANCE_INR=100`, `TEAM_PRIZE_NAME`, `ISO_DATE_RE` — all in `_shared/constants.ts` |
| Payment trust invariants | 8 total in `extract/paymentTrustCheck.ts`: `utr_format`, `utr_duplicate`, `amount_mismatch`, `payee_vpa_mismatch`, `payee_vpa_missing`, `date_stale`, `direction_not_outgoing`, `required_fields_missing` |
| Test baseline | **448 passing, 3 known failures** (conflict-utils ×2, martech-metrics ×1 — pre-existing, unrelated) |
| TypeScript check | **`npx tsc -p tsconfig.app.json --noEmit` is the real command** — 12 pre-existing errors, unchanged. Root `npx tsc --noEmit` checks nothing (project-reference stub). |
| pg_cron jobs | jobid 1 `expire-stuck-extraction-documents` (*/10); jobid 2 `drain-payment-notifications` (*/2) |
| doc_type enum | `public.doc_type` = `'chess_brochure','invoice','bank_statement','photo','unknown','payment_screenshot'` |
| Payment schema | `extraction_schemas` v3 (`payment_screenshot`), `is_active=true`. Fields: `amount_inr`, `utr`, `txn_date`, `payee_vpa`, `payer_name`, `payee_name`, `txn_id`, `status_text`, `app` |
| Payment FK | `tournament_payments.screenshot_extraction_id uuid null → extractions.id ON DELETE SET NULL` |
| Payment columns | `tournament_payments.return_to text null` — CHECK constraint `tournament_payments_return_to_relative_path` enforces same-site relative paths only |
| Edge function secrets | `PLATFORM_PAYEE_VPA`, `PAYMENT_NOTIFY_SECRET`, `APP_BASE_URL`, `RESEND_API_KEY`, `WELCOME_EMAIL_FROM`, `WELCOME_EMAIL_REPLY_TO`, `GEMINI_MODEL` |
| Vault secrets | `payment_notify_secret` (mirror of `PAYMENT_NOTIFY_SECRET` edge secret, read by cron) |
| Test tournament | `3908e9fb-2798-4768-b266-20d07e0be709` (318 players, ₹500 tier) |
| Extensions | `pg_cron` 1.6.4, `pg_net` 0.19.5, `pgcrypto`, `uuid-ossp`, `supabase_vault` |
| Auth architecture | `AuthProvider` React context in `src/hooks/useAuth.tsx`, wrapping `<AppInner />` in `App.tsx` (inside `QueryClientProvider`, outside `BrowserRouter`). Single session state machine app-wide. |
| Last production build | `index-BAvCnRlV.js` (2 Aug 2026). Phase 2A-3 F0a-F0c merged to main via PR #449/#450; `extract` v44 deployed 3 Aug 2026 |
| Claim RPC overloads | 3-arg (original, still live — drop after confirming zero callers), 4-arg (+ `p_screenshot_extraction_id`), 5-arg (+ `p_return_to`, current default) |

### Real frontend routes

| Purpose | Path |
|---|---|
| Tournament landing | `/t/:id/setup?tab=details` |
| Payment page | `/t/:id/payment` |
| Legacy upgrade redirect | `/t/:id/upgrade` → forwards into `/t/:id/payment` |
| Admin payments | `/admin/payments` (new in 2A-2) |
| Admin users | `/admin/users` (organizer-access toggle only — payment approvals moved out) |

---

## 3. Non-negotiable guardrails (apply to every prompt)

**Phase 1 guardrails (unchanged):**
1. NEVER touch the allocation engine — allocations, rule_config, conflicts, player-to-prize matching — unless Tushar explicitly names it. Also in CLAUDE.md "Do Not Touch".
2. `criteria_json` committed as always `'{}'`.
3. Never weaken grounding or arithmetic. Never weaken checks to force a pass.
4. Client never writes production tables; only `commit-extraction` does, on explicit Approve.
5. No paid services, no new dependencies without justification.
6. Sequential phases, one prompt at a time, max 3–4 deploy cycles then stop and report.
7. Builder/auditor split: Claude Code builds; Claude (chat) verifies via Supabase SQL before advancing.

**Phase 2A guardrails:**
8. Payment auto-approval is CONDITIONAL and server-side only (Phase 2A-3). A payment may auto-approve ONLY when all of these hold: every one of the 5 trust invariants passes with zero flags, the payer's profile is verified (email + phone), AND the server-side auto-approve secret is enabled. If ANY flag fires, or the profile is unverified, or the secret is off → `status='needs_review'`, no auto-approval. (Supersedes the original "never auto-commit" rule; see PHASE2_ARCHITECTURE.md D8.)
9. NEVER use `commit-extraction` edge function or `commit_extraction_transaction` RPC for payment data.
10. NEVER modify the `review_tournament_payment` RPC's core entitlement-insert logic. **Notification enqueue is deliberately OUTSIDE this RPC — it is an `AFTER UPDATE OF status` trigger, so the RPC stays byte-for-byte untouched.**
11. Screenshot upload in `TournamentUpgrade.tsx` is OPTIONAL initially. The existing UTR-text-only path must keep working unchanged.
12. NEVER expose the platform's payee UPI VPA or the auto-approve secret in frontend code or logs.

**Master / admin / auth guardrails:**

M1. NEVER touch the master/admin role-resolution path unless Tushar explicitly names it. This includes `useAuth`, `AuthProvider`, `useUserRole`, `ProtectedRoute`, the `user_roles` table, `has_role`, `is_master`, `app_role`, `masterAllowlist`, and the organizer-access banner / admin-button gating in `Dashboard.tsx` and the `/admin` pages.

M2. Auth resolution must FAIL SAFE. An unresolved, errored, or empty `user_roles` read must be treated as "unknown — retry / show loading", NEVER as "not master".

M3. **Every role gate must check `authzStatus` BEFORE checking `is_master` / `role`.** Mandatory shape, no exceptions:
```
if (authzStatus !== 'ready') return <spinner />;
if (!is_master) return <Navigate to="/dashboard" replace />;
```

M4. **`useAuth` is a shared `AuthProvider` context.** Any new consumer must be rendered inside `<AppInner />`. Provider sits inside `QueryClientProvider`, outside `BrowserRouter`.

M5. Access-control fixes are verified in PRODUCTION after a Lovable publish and a hard refresh (`Cmd+Shift+R`) — confirm the JS bundle hash changed.

**Phase 2A-2 guardrails:**

N1. **Every new function in schema `public` needs BOTH revokes** (PUBLIC path and role path are independent):
```sql
revoke execute on function public.<fn>(<args>) from public;
revoke execute on function public.<fn>(<args>) from anon, authenticated;
grant  execute on function public.<fn>(<args>) to postgres, service_role;
```
Verify with `has_function_privilege('anon', p.oid, 'EXECUTE') = false` — never the migration exit code.

N2. **Rotating `PAYMENT_NOTIFY_SECRET` is a THREE-place change, in this exact order:** (1) Dashboard → Secrets → save. (2) `supabase functions deploy send-payment-notifications`. (3) Update Vault entry.

N3. **Never paste secret plaintext into a chat.** If it happens, rotate immediately per N2.

N4. **`pg_cron` "succeeded" does not mean the HTTP call worked.** Always verify in `net._http_response`.

N5. **`npx tsc -p tsconfig.app.json --noEmit` is the correct type-check command.** The root `npx tsc --noEmit` is a project-reference stub and checks nothing. Baseline is 12 pre-existing errors; the diff before/after must be empty.

**Phase 2A-3 guardrails:**

P1. **`extractions` client writes are column-scoped.** `authenticated` may UPDATE only `payload`, `status`, `updated_at`, and only on `chess_brochure` rows. Never re-broaden. `extraction_documents` has NO client UPDATE policy — `doc_type` must stay immutable or the doc_type gate on `extractions` is defeated. **Both tables close together or neither closes.**

P2. **`extraction_documents.ocr_text` is the trust substrate.** It is client-immutable and is what `direction_not_outgoing` reads. Never add a client-writable path to it.

P3. **Pass-1 OCR is a structured semantic digest, not verbatim text.** Before adding any schema field, verify what Pass 1 actually emits for it. Grounding a value against expected on-screen wording will fail, and ungrounded leaves are blanked to null (`trustCheck.ts:297-306`).

P4. **Auto-approval gates on named flag reasons, never on flag count.** Cosmetic `ungrounded` flags are nondeterministic across byte-identical uploads. See PHASE2_ARCHITECTURE.md D28.

P5. **Deploying edge functions is a separate step from publishing.** Lovable publish ships the frontend only. `/extract` changes require `supabase functions deploy extract`. Verify the version incremented.

P6. **`npx tsc -p tsconfig.app.json --noEmit` does NOT cover `supabase/functions/` or `tests/`.** For edge-function work the typecheck proves nothing; vitest is the real gate.

**Phase 2B guardrails:**
13. Bank statements are `privacy_class='sensitive'`. NEVER process through Gemini. pdfplumber only.

**General Phase 2 guardrails:**
14. `tournament_payments` baselined 25 Jul. Do not regress.
15. `platform_feature_flags` same.

---

## 4. Phase 1 — COMPLETE

See previous PROJECT_STATE.md for full commit table. All shipped to main.

---

## 5. Phase 1 — Known limitations (documented, not fixable in v1)

- **delhi-class RECITATION:** Gemini refuses certain dense PDF brochures. Pass-1 returns empty OCR.
- **Multi-tournament chooser:** Option A only (re-extract one chosen event).

---

## 6. Phase 2A — Payment Screenshot Verifier (COMPLETE ✅)

All 5 trust invariants live in `extract/paymentTrustCheck.ts`:
1. `utr_format` — 8–22 alphanumeric
2. `utr_duplicate` — cross-check against non-rejected `tournament_payments.utr`
3. `amount_mismatch` — vs expected price ±₹1, coupon-aware
4. `payee_vpa_mismatch` — vs `PLATFORM_PAYEE_VPA` secret
5. `date_stale` — `txn_date` older than 30 days

All five verified E2E 28 Jul 2026.

---

## 7. Workstream C — `AuthProvider` refactor (COMPLETE ✅ — 29 Jul 2026)

`useAuth` promoted to a shared `AuthProvider` context. All 19 call sites compiled without edits. Production-verified 29 Jul.

---

## 8. Phase 2A-2 — Payment Lifecycle Completion (COMPLETE ✅ — 2 Aug 2026)

Branch `feat/phase-2a2-payment-lifecycle` fully merged into main.

### Migrations applied (in order)

| Migration | What |
|---|---|
| `20260729100000` | `payment_notification_outbox` table + RLS + master-read policy + 3 indexes |
| `20260729110000` | `enqueue_payment_notification()` SECURITY DEFINER + `AFTER UPDATE OF status` trigger |
| `20260729120000` | `storage.objects` master read policy for `extraction-uploads` |
| `20260729130000` | 4-arg `submit_tournament_payment_claim` overload (+ `p_screenshot_extraction_id`) |
| `20260729140000` | `updated_at` touch trigger on outbox |
| `20260729150000` | (no-op: PUBLIC path not closed — see N1 lesson) |
| `20260729160000` | Correct revoke of `enqueue_payment_notification` from PUBLIC |
| `20260729170000` | `reap_stuck_payment_notifications()` — resets `sending` rows >10 min back to `failed` |
| `20260729180000` | Correct revoke of reaper from `anon, authenticated` (direct default-privilege path) |
| `20260730100000` | `return_to text` on `tournament_payments` + outbox; 5-arg claim overload; `enqueue_payment_notification` updated to copy `return_to` |
| `20260730120000` | Master SELECT policy on `extractions` and `extraction_documents` (fixes silent RLS read failure in admin evidence panel) |

### New / changed source files

| File | Change |
|---|---|
| `supabase/functions/send-payment-notifications/index.ts` | New — v7. Signed-secret auth, batch drain of 20, `MAX_ATTEMPTS=5`, `return_to`-aware approve/reject email links |
| `src/pages/TournamentUpgrade.tsx` | L2 tournament-scoped upload path; L5 extracted UTR pre-fill; `return_to` capture; 5-arg claim RPC (closes direct UPDATE debt) |
| `src/pages/admin/AdminPayments.tsx` | New — `/admin/payments` route with pending queue + full payment history table (all statuses, claimed vs extracted amounts, attempt counts, screenshot viewer) |
| `src/components/payments/PaymentEvidence.tsx` | New — shared extraction evidence component used by both admin surfaces |
| `src/components/payments/evidenceStyles.ts` | New — opaque evidence row styling (fixes hover-only legibility bug) |
| `src/components/master/PendingPaymentsPanel.tsx` | Refactored to use shared `PaymentEvidence.tsx`; `file_path` now selected; `ViewScreenshotButton` moved to shared component |
| `src/pages/MasterDashboard.tsx` | Removed `PendingPaymentsPanel` (moved to `/admin/payments`) |
| `src/pages/Dashboard.tsx` | L4 payment banner — organizer sees pending/rejected claim banner; suppressed if active entitlement exists |
| `src/components/admin/adminSections.ts` | Added "Payments" nav entry |
| `src/App.tsx` | Registered `/admin/payments` route |

### Requirements completed

| Requirement | Status | Notes |
|---|---|---|
| L1 `/admin/payments` route | ✅ | Separated from `/admin/users`; full history table |
| L2 Tournament-scoped upload path + admin image viewer | ✅ | Path: `{uid}/payments/{tournament_id}/{uuid}{ext}`; in-app dialog via signed URL |
| L3 Email on approve and reject | ✅ | Outbox + cron; exactly-once; tested E2E |
| L4 Dashboard banner | ✅ | Amber (pending) / red (rejected); suppressed by active entitlement |
| L5 Editable pre-filled UTR | ✅ | `utrValueRef` prevents overwriting typed value during long extractions |
| L6 Flow resumption on approval | ✅ | `return_to` stored → trigger copies to outbox → approve email deep-links to origin page |
| L7 Attempt count auditable | ✅ | "N of M" ordinal visible in All Payments table |

### Infrastructure verified E2E

- Trigger fires on any `status` transition to `approved`/`rejected`
- Cron drains outbox every 2 min via `net.http_post`; Vault secret, no plaintext in `cron.job`
- `reap_stuck_payment_notifications` prevents silent notification loss from dead isolates
- `send-payment-notifications` v7: constant-time secret comparison, `safeReturnTo` validation in-flight
- Full approve/reject test with real emails confirmed 30 Jul and 2 Aug 2026

### Key findings from Phase 2A-2 (carry into 2A-3)

**D21 — Master RLS read defect (found and fixed):** `extractions` and `extraction_documents` had no master SELECT policy. A master reviewing a payment submitted by a different user got an empty array at HTTP 200 — the evidence panel rendered nothing silently. Fixed in `20260730120000`. The storage policy (`20260729120000`) and the table policies must always be added together.

**D22 — `payee_vpa` null is fail-open, not verified:** `paymentTrustCheck` skips the VPA invariant entirely when `payload.payee_vpa` is null. The admin panel now renders this as "NOT VERIFIED" caution, but the invariant still doesn't fire. A "Received from" receipt (incoming money) has no VPA and currently produces zero flags on that axis.

**D23 — Three fail-open paths in the trust layer:**
1. `payee_vpa` null → VPA check silently skipped
2. `amount_inr` null (OCR failure) → amount check silently skipped, zero flags
3. No direction check — a "Received from" receipt passes everything if the amount matches

All three produce zero flags, which under auto-approval would be the auto-approve condition. **Must be fixed before Phase 2A-3.**

**D24 — Payment screenshot schema needs v2:** From examining real PhonePe receipts: `direction` ("Paid to" / "Received from"), `payee_name` (recipient display name, distinct from `payer_name`), and `txn_id` (PhonePe Transaction ID, separate from UTR). `direction` feeds the new invariant; `txn_id` doubles duplicate-detection surface.

**D25 — `extractions` UPDATE policy is too broad:** `Users can update own extractions` has no column restriction and no `WITH CHECK`. An organiser can `UPDATE extractions SET payload=..., field_flags='[]'` on their own extraction row, rewriting the evidence the trust layer produced. Under manual review this is survivable. Under auto-approval the entire 5-invariant trust layer is bypassable with one PATCH request. **Must investigate before Phase 2A-3 — check whether Phase 1 brochure review writes back to `extractions.payload` before closing.**

---

## 9. Phase 2A-3 — Conditional Auto-Approval + Profile Verification (IN PROGRESS)

Full spec: PHASE2_PRD.md §"Phase 2A-3" and PHASE2_ARCHITECTURE.md D8.

**Why it must come after 2A-2:** auto-approval without a notification layer is worse than manual — the user still would not know what happened. 2A-2 is now complete.

### Prerequisite status (3 of 4 complete, all production-verified)

| | Prereq | Status | Evidence |
|---|---|---|---|
| **F0a** | Close `extractions` UPDATE policy | ✅ 2 Aug | migration `20260802124253`, commit `1ed13ab` |
| **F0b** | `payment_screenshot` schema v2 → v3 | ✅ 3 Aug | migrations `20260802165554`, `20260803181034`; commits `e6b8857`, `fe498ec`, `7025cba` |
| **F0c** | Three new trust invariants | ✅ 3 Aug | commit `42b5155`, `extract` v44 |
| **F0d** | UTR match + duplicate hard-block | ⬜ **NEXT** | — |

**F0a — what was found and done.** `BrochureReview.tsx` DOES write back to `extractions.payload` (approveMutation, load-bearing: `commit-extraction:125` re-reads payload from the DB) and `extractions.status` (discardMutation). It never writes `field_flags`. So revoke-entirely was impossible; narrowing was. Column grants now limit `authenticated` to `payload`/`status`/`updated_at`; the policy is doc_type-whitelisted to `chess_brochure`. A second, undocumented hole was found and closed: `extraction_documents` had an unused UPDATE policy allowing `doc_type` itself to be flipped, which would have defeated the gate. Negative-tested on both layers separately (grants → `42501`; RLS → `0 rows`).

**F0b — what changed and why.** v2 added `direction_label`, `payee_name`, `txn_id`. v3 removed `direction_label` after three real fixtures showed it returning `null` / `"Recipient Name:"` / `"Credited to"` across PhonePe-outgoing / GPay-outgoing / PhonePe-incoming. The `null` case fired a HIGH `ungrounded` flag on a **legitimate** payment. `payee_name` and `txn_id` retained.

**F0c — the rule that replaced it.** Outgoing is PROVEN if EITHER `payee_vpa` equals `PLATFORM_PAYEE_VPA`, OR an outgoing marker appears in `ocr_text` with no incoming marker. Otherwise `direction_not_outgoing`. Verified in production on the same two screenshots: incoming went 1 flag → 3 flags; GPay outgoing stayed clean on the VPA path.

### Prerequisites — original scoping notes (retained)

These were scoped for Phase 2A-2 but require careful ordering:

1. **Investigate `extractions` UPDATE policy** — determine whether `BrochureReview.tsx` or the Phase 1 review flow writes back to `extractions.payload`. If yes: narrow the policy to exclude `payload` and `field_flags` columns, or add a `WITH CHECK` that prevents zeroing flags. If no: revoke the UPDATE entirely for `payment_screenshot` doc_type.

2. **`payment_screenshot` schema v2** — new `extraction_schemas` row (v2, `is_active=true`, v1 set `is_active=false`). Adds: `direction` (string: "outgoing"/"incoming"), `payee_name` (string), `txn_id` (string).

3. **New trust invariants:**
   - `direction_not_outgoing` — flag when `direction` is "incoming" or absent on a payment claim
   - `payee_vpa_missing` — flag when `payee_vpa` is null (currently skipped silently)
   - `required_fields_missing` — flag when OCR produces null on all required fields (catches unreadable screenshots)

4. **Hard-block duplicate UTR at submission** — current behaviour warns admin only. Raise an error to the organizer at submit time with a clear message that the UTR is already used.

5. **UTR-match enforcement** — submitted UTR must match `payload.utr` from the extraction. If they differ: block with a "contact me directly" pop-up (escape hatch for OCR misreads, not a bypass). Requires the UPDATE policy fix first — otherwise `payload.utr` is mutable.

### Core Phase 2A-3 requirements

After prerequisites are done:

- **Profile verification gate** — email + phone verified before payment submission is allowed
- **Conditional auto-approval** — all 5 (+ new) invariants pass, profile verified, server-side secret enabled → Pro unlocks immediately via `source='auto_upi'`
- **Reapply pop-up on any flag** — specific, human-readable, no auto-approval
- **Admin oversight + email** — every auto-approval visible in `/admin/payments` + email to `chess.tushar@gmail.com` via Resend outbox
- **Secret-governed gate** — Supabase Edge Function secret, never in frontend, never logged, instantly reversible

**Phone verification open question:** OTP SMS costs money. Which provider, what budget, or is there a free/low-cost path?

---

## 10. Phase 2B — Bank Statement Reconciliation (BLOCKED ON 2A-3)

`privacy_class='sensitive'` → local lane only (no Gemini). pdfplumber (Python, free). New `bank_statement` trust invariant: UTR in statement must exist in `tournament_payments`.

---

## 11. Phase 2C-D — REST API + MCP Server (BLOCKED ON 2B)

Multi-tenant REST API with API key management. MCP tools: `extract_document`, `get_extraction`, `query_documents`. The 2A-2 notification layer is generic by design for this phase.

---

## 12–13. Phase 3–4 (FUTURE)

See PHASE2_PRD.md for details.

---

## 14. Immediate next step

**Status as of 3 Aug 2026:** Phase 2A-3 prerequisites F0a, F0b and F0c are complete and production-verified. `extract` v44 deployed. Schema v3 active. Tests 448 passing / 3 known failures. Branch `feat/phase-2a3-trust-hardening` at commit `42b5155`; F0a/F0b merged to main via PR #449 and #450, F0c not yet merged.

**Next: F0d — UTR match + duplicate hard-block.**

F0d is frontend + RPC work rather than trust-layer work. Two hard blocks at submission time:
1. **Duplicate UTR** — currently only warns the admin after the fact. Must raise a clear error to the organizer at submit time.
2. **UTR mismatch** — the submitted UTR must match `payload.utr` from the linked extraction. On mismatch, show a pop-up with contact details as an escape hatch for OCR misreads (an escape hatch, not a bypass).

F0a is what makes (2) meaningful: `payload.utr` is no longer client-writable for `payment_screenshot`, so comparing against it is trustworthy.

After F0d: F1 (profile verification) and F2 (the auto-approval gate itself, built per D28 on named flag reasons).

**Opening line for the next chat:**
> *Continue the Prize Manager project. Read PROJECT_STATE.md §9 and §14. Phase 2A-3 prerequisites F0a, F0b and F0c are complete and production-verified — extract v44, schema v3, 448 tests passing, branch feat/phase-2a3-trust-hardening at 42b5155. Starting F0d: UTR match + duplicate hard-block at submission. Begin by reading the current `submit_tournament_payment_claim` 5-arg RPC and TournamentUpgrade.tsx submit path, and report what validation exists today before proposing changes.*

---

## 15. RCA — 26 Jul 2026 master/admin access incident (FULLY RESOLVED)

Root cause: 4 compounding client-side defects (null-role demotion, INITIAL_SESSION race, role query before JWT, per-component `useAuth` instances). Fixed by per-component `authzStatus` guards (immediate) and `AuthProvider` context (architectural). See PHASE2_ARCHITECTURE.md D9, D10, D16 for full analysis.

---

## 16. Tracked debt (do not lose)

| Item | Priority | Detail |
|---|---|---|
| ~~`extractions` UPDATE policy too broad~~ | ✅ RESOLVED | Fixed `20260802124253` (F0a). Column grants + doc_type whitelist + `extraction_documents` policy dropped. Negative-tested both layers. |
| ~~Three fail-open trust invariants~~ | ✅ RESOLVED | Fixed in F0c (`extract` v44). `payee_vpa_missing`, `direction_not_outgoing`, `required_fields_missing` all live and production-verified. |
| ~~Schema v2 fields~~ | ✅ RESOLVED | v2 then v3. `direction_label` added and removed; `payee_name` + `txn_id` retained. |
| **UTR-match enforcement** | **HIGH — F0d, next** | Submitted UTR must match `payload.utr`. Now meaningful: F0a made `payload.utr` client-immutable for `payment_screenshot`. |
| **Hard-block duplicate UTR at submission** | **HIGH — F0d, next** | Currently only warns admin. Must block with a user-facing message. |
| **Auto-approve gate must use named flag reasons** | **HIGH — F2** | Byte-identical uploads produced `app` grounded once, `ungrounded` HIGH the next. Flag-count gating would make auto-approval a coin flip. See D28. |
| **`tsconfig.app.json` scope gap** | MEDIUM | Covers `src/` only. `supabase/functions/` and `tests/` are never typechecked — i.e. the tsc gate is blind to most Phase 2A-3 work. vitest is the real gate. |
| **Direction marker regexes lack `\b` anchors** | LOW | `sent to` also matches inside `present to`. Bounded: `direction_not_outgoing` can only fire when `payee_vpa` isn't the platform VPA, which already flags. |
| **Stale v2 tests reference `direction_label`** | LOW | Two grounding tests in `extraction-grounding.spec.ts` exercise a field schema v3 no longer emits. They pass, but mislead. |
| **`app` / `status_text` grounding is nondeterministic** | LOW | Cosmetic fields; must be excluded from the F2 gate (D28), not "fixed". |
| **Repo is public** | LOW — noted | `github.com/tushar1669/prize-manager` is publicly readable. Verified no secrets committed (tracked `.env` holds only publishable/anon keys, already in the shipped bundle). Keep it that way. |
| **3-arg `submit_tournament_payment_claim` still live** | MEDIUM | Nobody calls it. Drop after confirming zero callers. |
| **`MAX_ATTEMPTS=5` with no backoff** | MEDIUM | Cron every 2 min burns all 5 attempts in ~10 min. A brief Resend outage permanently loses the notification. |
| **`CLAUDE.md` schema drift** | MEDIUM | Says v3 active; actual is v5. Missing: AuthProvider architecture, `supabase db query --linked` correction (not `db execute`), `tsc -p tsconfig.app.json` correction, N1 grant hygiene. |
| **Stale generated types** | MEDIUM | `src/integrations/supabase/types.ts` predates all Jul 29/30 migrations. `payment_notification_outbox` absent. `tournament_payments` missing `return_to`. All three claim overloads collapsed to one. `as never` casts proliferating. Regenerate after Phase 2A-3. |
| **`brew unlink node` fragile** | MEDIUM | Homebrew node 26.5.0 sits unlinked. Any `brew upgrade`/`brew link` re-shadows v22 → 9 test failures. Check `node --version` if failure count jumps. |
| **`/admin/team-snapshots` broken** | MEDIUM | RPC `detect_missing_team_snapshots` returns 404; page calls `is_master(uuid)` but DB function is `is_master()` (no args). Fix during team-prizes phase. |
| **`initialResolved` ref vs StrictMode** | MEDIUM | `main.tsx` has no StrictMode, behaviour correct. If StrictMode added: reset the ref in effect cleanup first. |
| **`tournament_payments` UPDATE RLS loose** | LOW | `users_update_own_pending_payments` lets user edit `utr`/`amount_inr` on their own pending row. Partially mitigated by 5-arg RPC now doing the write. |
| **Two parallel session paths** | LOW | 16 call sites read token via `supabase.auth.getSession()` directly rather than via `useAuth`. |
| **`platform_feature_flags` RLS** | LOW | Enabled with zero policies. Only read via SECURITY DEFINER RPC today. |
| **Lovable migration drift** | LOW | Duplicate-filename collisions harmless but messy. |
| **`MasterDashboard` guard oddities** | LOW | Dead second `authzStatus` block at ~:108-114; ~:93 conflates authz resolution with data loading. Left alone (M3). |
| **Payment unit tests assert literals** | LOW | Tests 7–10 in `extraction-grounding.spec.ts` assert `Math.abs(999-1499) > 1` rather than calling `paymentTrustCheck.ts`. |
| **`payer_name` asymmetry** | LOW | Schema captures `payer_name` (who sent). On outgoing proofs the payer isn't shown — only the payee. Schema v2 adds `payee_name` to fix. |
| **Screenshot viewer: duplicate Dialog** | LOW | Each row mounts two `ViewScreenshotButton`s (column + evidence drawer). Harmless. |

---

## 17. How to start each new chat

**One chat per workstream.** When a workstream is done and verified, start a fresh chat.

**At every phase boundary, in this exact order:**
1. Claude gives you an updated `PROJECT_STATE.md`.
2. In the Claude Project, open the knowledge panel, delete the old `PROJECT_STATE.md`.
3. Upload the new one.
4. Open a brand-new chat inside the same Project.
5. Paste the opening line for that workstream.

**Opening lines:**

- **Phase 2A-3 F0d (next):** *"Continue the Prize Manager project. Read PROJECT_STATE.md §9 and §14. Phase 2A-3 prerequisites F0a, F0b and F0c are complete and production-verified — extract v44, schema v3, 448 tests passing, branch feat/phase-2a3-trust-hardening at 42b5155. Starting F0d: UTR match + duplicate hard-block at submission. Begin by reading the current `submit_tournament_payment_claim` 5-arg RPC and TournamentUpgrade.tsx submit path, and report what validation exists today before proposing changes."*
- Phase 2B: *"Continue the Prize Manager project. Read PROJECT_STATE.md §10. Starting Phase 2B — Bank Statement Reconciliation. Phase 2A-3 is shipped and verified."*
- Phase 2C-D: *"Continue the Prize Manager project. Read PROJECT_STATE.md §11. Starting Phase 2C-D — REST API + MCP Server. Phase 2B is shipped and verified."*

**Working rules that do not change:**
- Always `/clear` in Claude Code before a new prompt.
- Edge-function changes need `supabase functions deploy <name>` — Lovable publish ships the frontend only (P5).
- Use `git --no-pager diff` — plain `git diff` opens a pager and silently swallows the rest of a pasted command block.
- Paste terminal output as **text**, never screenshots.
- Claude (chat) verifies every Claude Code / Lovable claim against Supabase SQL before advancing.
- `npx tsc -p tsconfig.app.json --noEmit` is the correct type check. Root `tsc --noEmit` checks nothing.
- Builder/auditor split: Claude Code or Lovable builds; Claude (chat) verifies.
- Access-control changes verified in **production** after publish with confirmed bundle-hash change (M5).
- Before starting a branch: `git status` must be clean.
- Never paste secret plaintext into chat (N3).
- Full `git diff` text (not a summary) is required in every build report. "Printed above in tool output" is not acceptable.
