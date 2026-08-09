# PROJECT_STATE — Prize Manager · Universal Extraction Engine
**Last updated:** 9 August 2026 · **Owner:** Tushar · **This file is the single source of truth for continuing work in any new chat.**

Replace the previous PROJECT_STATE.md in the repo with this file. Paste it at the start of every new chat to re-establish context.

---

## 1. What this project is

**Prize Manager** (prize-manager.com) is a chess tournament management platform. Phase 1 built a brochure extraction engine: organizer uploads a PDF brochure → two-pass Gemini OCR + structured extraction + deterministic trust/grounding layer → review screen → on Approve, a tournament is created with categories and prizes.

**Phase 2** extends the same extraction engine into a Universal Extraction Engine serving three platforms and eventually external developers. The engine is doc-type-driven; adding a new document type requires only a new schema row and new trust invariants — not a new pipeline.

**Three-platform context:**
- **prize-manager.com** — Tournament prize management (live). Phase 2A/2A-2/2A-3 added payment screenshot verification, the full payment lifecycle, and UTR trust hardening.
- **certificate-hub.com** — Certificate creation service; paywalled. Will consume the extraction engine via REST API (Phase 2C).
- **sportup.online** — Discovery + tournament management platform. Will consume via REST API (Phase 2C).

---

## 2. Key identifiers

| Item | Value |
|---|---|
| Supabase project | `nvjjifnzwrueutbirpde` (prize-manager.com, ap-south-1, Postgres 17) |
| Edge functions | `extract` (**v45**), `commit-extraction` (v13), `send-payment-notifications` (v7, `verify_jwt=false`), `sendWelcomeOnboardingEmail` (v20), `allocatePrizes`, `allocateInstitutionPrizes`, `backfillTeamAllocations`, `finalize`, `publicTeamPrizes`, `generatePdf`, `parseWorkbook`, `pmPing` |
| Active extraction schema | `extraction_schemas` v5 (chess_brochure), **v3 (payment_screenshot)** |
| Storage buckets | `extraction-uploads`, `brochures`, `exports`, `imports` |
| Repo | github.com/tushar1669/prize-manager (**public**) · branch: **main** at `10744a8` · `feat/phase-2a3-trust-hardening` and `feat/f0d-closeout` both fully merged and pushed |
| Gemini model | `GEMINI_MODEL` env secret = `gemini-3.1-flash-lite` |
| Local paths | repo `~/Desktop/prize-manager`, test PDFs `~/Desktop/prize-manager/test-brochures/` |
| Payment trust invariants | 8 in `extract/paymentTrustCheck.ts`: `utr_format`, `utr_duplicate`, `amount_mismatch`, `payee_vpa_mismatch`, `payee_vpa_missing`, `date_stale`, `direction_not_outgoing`, `required_fields_missing` |
| Test baseline | **474 passing, 3 known failures** (conflict-utils ×2, martech-metrics ×1 — pre-existing) |
| TypeScript check | `npx tsc -p tsconfig.app.json --noEmit` — **12 pre-existing errors**. Root `npx tsc --noEmit` checks nothing. |
| pg_cron jobs | jobid 1 `expire-stuck-extraction-documents` (*/10); jobid 2 `drain-payment-notifications` (*/2) |
| Claim RPC | **5-arg only.** 3-arg and 4-arg dropped in F0d Migration A. |
| Client grants on `tournament_payments` | `authenticated`: **SELECT only**. `anon`: **nothing**. All writes flow through RPCs. |
| Backstop index | `uq_tournament_payments_utr_active` — UNIQUE on `normalize_utr(utr)` WHERE `status <> 'rejected'` |
| Advisory duplicate lookup | `public.utr_active_duplicate_exists(text)` — STABLE, SECURITY DEFINER, EXECUTE to `service_role` only. Called by `extract` for the pre-submit banner. |
| Verification harness | `supabase/tests/f0d_rpc_checks.sql` — self-aborting, covers 13 RPC branches. Ends with `ERROR: HARNESS RESULTS`; that is the pass condition. |
| Design doc | `docs/design/UI_CONVENTIONS.md` — governs all styling. Dark-only. Enforced by `tests/ui-conventions.spec.ts`. |

### Real frontend routes

| Purpose | Path |
|---|---|
| Tournament landing | `/t/:id/setup?tab=details` |
| Payment page | `/t/:id/payment` |
| Admin payments | `/admin/payments` |
| Admin users | `/admin/users` |

---

## 3. Non-negotiable guardrails

**Phase 1:**
1. NEVER touch the allocation engine — allocations, `rule_config`, conflicts, player-to-prize matching — unless Tushar explicitly names it. The engine lives in `supabase/functions/allocatePrizes`, `allocateInstitutionPrizes`, `backfillTeamAllocations`. The frontend invokes it **by string name**; never alter an invoke name or payload.
2. `criteria_json` committed as always `'{}'`.
3. Never weaken grounding or arithmetic. Never weaken checks to force a pass.
4. Client never writes production tables; only `commit-extraction` does, on explicit Approve.
5. No paid services, no new dependencies without justification.
6. Sequential phases, one prompt at a time, max 3–4 deploy cycles then stop and report.
7. Builder/auditor split: Claude Code builds; Claude (chat) verifies via Supabase SQL before advancing.

**Phase 2A:**
8. Payment auto-approval is CONDITIONAL and server-side only (F2, not yet built). Gates on **named security-relevant flag reasons**, not flag count (D28).
9. NEVER use `commit-extraction` or `commit_extraction_transaction` for payment data.
10. NEVER modify `review_tournament_payment`'s core entitlement-insert logic. Notification enqueue is an `AFTER UPDATE OF status` trigger, deliberately outside the RPC.
11. Screenshot upload is OPTIONAL. The UTR-text-only path must keep working.
12. NEVER expose the platform payee VPA or the auto-approve secret in frontend code or logs.

**Master / admin / auth:**

M1. NEVER touch the master/admin role-resolution path unless explicitly named.
M2. Auth resolution must FAIL SAFE — unresolved/errored/empty `user_roles` = "unknown, retry", never "not master".
M3. **Every role gate checks `authzStatus` BEFORE `is_master`/`role`.**
M4. `useAuth` is a shared `AuthProvider` context inside `QueryClientProvider`, outside `BrowserRouter`.
M5. Access-control fixes verified in PRODUCTION after publish + hard refresh, with confirmed bundle-hash change.

**Phase 2A-2:**

N1. Every new `public` function needs BOTH revokes (PUBLIC path and role path are independent). Verify with `has_function_privilege('anon', p.oid, 'EXECUTE') = false` — never the migration exit code.
N2. Rotating `PAYMENT_NOTIFY_SECRET` is a THREE-place ordered change: Dashboard → deploy → Vault.
N3. Never paste secret plaintext into chat.
N4. `pg_cron` "succeeded" ≠ HTTP call worked. Verify in `net._http_response`.
N5. `npx tsc -p tsconfig.app.json --noEmit` is the correct type-check.

**Phase 2A-3:**

P1. `extractions` client writes are column-scoped: `authenticated` may UPDATE only `payload`, `status`, `updated_at`, only on `chess_brochure` rows. `extraction_documents` has NO client UPDATE policy. **Both tables close together or neither closes.**
P2. `extraction_documents.ocr_text` is the trust substrate — client-immutable, read by `direction_not_outgoing`.
P3. Pass-1 OCR is a structured semantic digest, not verbatim text. Verify what Pass 1 emits before adding a schema field.
P4. Auto-approval gates on named flag reasons, never flag count.
P5. Deploying edge functions is separate from publishing. Lovable publish ships frontend only.
P6. `tsconfig.app.json` does NOT cover `supabase/functions/` or `tests/`. vitest is the real gate for edge-function work.

**F0d (new):**

Q1. **The 5-arg `submit_tournament_payment_claim` is the ONLY client write path into `tournament_payments`.** Client grants are SELECT-only. Do not re-grant INSERT/UPDATE, and do not "fix" `master_full_payments` being read-only in practice — all master writes go through `review_tournament_payment` (SECURITY DEFINER).
Q2. **`normalize_utr` is FROZEN** while `uq_tournament_payments_utr_active` exists. Index entries are built with the function as of creation and never re-evaluated. Any change requires drop-index → replace-function → recreate-index.
Q3. `normalize_utr` deliberately keeps EXECUTE for `authenticated` (N1 exception) — expression-index evaluation during DML runs as the invoking role.

**F0d closeout (new):**

Q4. **`utr_format` and `utr_duplicate` are INDEPENDENT blocks in `paymentTrustCheck.ts`.** The duplicate lookup must never be nested back inside the format check's `else` — a malformed UTR can still be a re-use of one already seen. Both flags may fire on the same field; that is intended and harmless under D28.

Q5. **`utr_format` semantics are frozen** while F2's named-flag gate depends on them: it tests the whitespace-stripped value against `^[A-Za-z0-9]{8,22}$` at severity `high`. Normalising before the format test would relax a security-relevant flag as a side effect of a cosmetic fix.

Q6. **The advisory duplicate lookup fails OPEN by design.** On RPC error or throw, `paymentTrustCheck.ts` logs and emits no flag. This is safe only because the hard block is the RPC plus `uq_tournament_payments_utr_active`; a failed advisory can never let a duplicate be inserted. Do not "fix" this into a fail-closed flag.

Q7. **Pass the RAW trimmed UTR to `utr_active_duplicate_exists`, never `normalizeUtr()` output.** The SQL function normalises both sides itself, so TS-mirror drift cannot become a false negative.

**UI (new):**

U1. **Prize Manager is permanently dark.** `darkMode: ["class"]` is set but nothing adds a `dark` class and no `.dark` block exists. Every `dark:` utility is dead; every raw light-palette utility renders literally. See `docs/design/UI_CONVENTIONS.md`.
U2. Use semantic tokens (`success`, `warning`, `destructive`, `info`, `accent`, `muted`). Never add raw palette utilities or `dark:` variants.
U3. The only permitted raw-hue exception is category chips in `CategoryCriteriaChips.tsx`, restricted to `bg-<hue>-500/15 text-<hue>-300 border-<hue>-500/30`.
U4. `.pm-print-surface` in `index.css` governs print. Do not modify it. Verified: no token-styled surface renders inside it.

U5. `tests/ui-conventions.spec.ts` enforces U1–U3 mechanically (5 rules over `src/`). White/black literals are deliberately OUT of scope — print and public poster surfaces are meant to be light (UI_CONVENTIONS §5). Widening `PALETTE_EXCEPTION_FILES` beyond the one chips file requires editing the test, which is the point.

**Phase 2B:**
13. Bank statements are `privacy_class='sensitive'`. NEVER process through Gemini. pdfplumber only.

---

## 4–7. Phases 1, 2A, Workstream C, 2A-2 — COMPLETE

See prior PROJECT_STATE for full detail. All shipped and production-verified.

---

## 8. Phase 2A-3 — Trust Hardening (F0a–F0e + F0d closeout COMPLETE ✅ — 9 August 2026)

### Prerequisite status

| | Prereq | Status |
|---|---|---|
| **F0a** | Close `extractions` UPDATE policy | ✅ migration `20260802124253` |
| **F0b** | `payment_screenshot` schema v2 → v3 | ✅ `20260802165554`, `20260803181034` |
| **F0c** | Three new trust invariants | ✅ `extract` v44 |
| **F0d** | UTR match + duplicate hard-block | ✅ `20260804120000`, `20260804160000` |
| **F0e** | Payment-page failure states | ✅ frontend only |
| **F0d closeout** | `normalize_utr` parity · RPC harness · UI guard | ✅ merged `10744a8`, 9 Aug |

### F0d — what shipped

**Migration A (`20260804120000`) — closed the write surface.** Dropped `users_insert_own_payments` and `users_update_own_pending_payments` (both unused — every client touch in the repo is `.select()`). Revoked INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES from `anon` and `authenticated`; revoked SELECT from `anon`. Dropped the dead 3-arg and 4-arg claim overloads (both were `anon`-executable). Grant-only hygiene fix on `review_tournament_payment` (body untouched per guardrail 10).

**Migration B (`20260804160000`) — the checks.** `public.normalize_utr(text)` (IMMUTABLE), the backstop unique index, and four new error branches inside the 5-arg RPC: `UTR_ALREADY_USED`, `UTR_IS_TXN_ID`, `UTR_MISMATCH`, `UTR_EXTRACTION_UNREADABLE`, plus an extraction-ownership gate with a master carve-out. `unique_violation` is caught and re-raised by constraint name so the client sees one error shape.

**Frontend (step C).** Four AlertDialogs with contact escape hatch (`chess.tushar@gmail.com`, `+91-9559161414`), a one-tap "Use this UTR" fix on the txn-id branch, an advisory duplicate banner driven by `/extract`'s `field_flags`, and `logAuditEvent` on every block.

**Production verification (6 Aug).** All four dialogs fired correctly on the live site. Audit trail matched exactly: 3× `UTR_ALREADY_USED` (no screenshot), 1× `UTR_IS_TXN_ID` (screenshot), 1× `UTR_MISMATCH` (screenshot) — five blocks, five 400s in the browser log, `had_screenshot` correct on each. A successful submission then used a UTR that existed only on a **rejected** row and was correctly allowed through, confirming D15 resubmission works on real data. Approval granted the entitlement (`manual_upi`) and enqueued the notification.

**Not verifiable in production:** `EXTRACTION_NOT_OWNED` — every extraction in the database belongs to one account. Covered by the pending test suite.

### F0e — payment page failure states

Found during F0d testing: `get_tournament_pro_price` failure produced a silent half-rendered page that offered "Pay ₹0" against a live QR with an enabled Submit button, and React Query retried the permanent `UNAUTHORIZED` error 24 times, causing visible flicker. Fixed: `retry` predicate rejects `UNAUTHORIZED`/`TOURNAMENT_NOT_FOUND`; both the coupon and UPI sections now gate on `proPrice` being present rather than on `!pricingLoading`; explicit loading and error cards; Submit disabled when `amountDue <= 0`; explicit `INVALID_PAYMENT_AMOUNT` and `UNAUTHORIZED` toasts.

### UI token migration (complete)

**Root cause:** `tailwind.config.ts` sets `darkMode: ["class"]`, but nothing ever adds a `dark` class and there is no `.dark` block — the dark palette lives in `:root`. So all 185 `dark:` utilities were dead code and 529 raw light-palette utilities rendered literally, producing cream blocks on a near-black page (most visibly the `/admin/payments` evidence panel).

Four batches, ~45 files: Batch 1 (payment surfaces + `UI_CONVENTIONS.md`), 2a (31 app files), 2b (allocation/conflict display), 2c (criteria chips, confidence scale, constant-map colours, brand-accent fix). **The allocation engine's 9 edge-function files were verified byte-identical against a SHA-256 baseline after every batch**, and nothing under `supabase/` changed.

---

### F0d closeout — what shipped (9 Aug, merge `10744a8`)

**1. `normalize_utr` parity (was: advisory banner and server disagreed on "same UTR").**
The debt entry said "mirror `normalize_utr` into `paymentTrustCheck.ts`", but a TS-only mirror could not have closed the gap: PostgREST's `.eq()` cannot apply a function to a column, so the *stored* side stayed raw however the probe was normalised. Fixed server-side instead — migration `20260808172212` adds `public.utr_active_duplicate_exists(text)` (STABLE, SECURITY DEFINER, `service_role`-only EXECUTE), and `extract` calls it. `normalize_utr` itself was NOT touched (Q2 freeze intact). The TS mirror `normalizeUtr()` still ships, exported and tested, for the parity fixture and future F2 use.

Also fixed in the same change: the duplicate lookup used to live inside the format check's `else`, so a hyphenated UTR flagged `utr_format` and was **never** duplicate-checked. Now independent (Q4).

**Production-verified 9 Aug.** `extract` v45 deployed; re-uploading the GPay screenshot with UTR `127287042392` (which sits on an approved row) produced `utr_duplicate` in `extractions.field_flags` on extraction `b63c6152`, and the advisory banner rendered on the payment page. Neither `console.warn` path fired, which is the only way to distinguish a working RPC from one silently swallowed by the `catch`.

**2. Test coverage.** Split by what each runner can actually prove:
- `tests/payment-utr-normalization.spec.ts` (21 cases) — the 11 normalisation fixtures, strip-before-upper ordering, duplicate-flag behaviour on true/false/error, the format-fails-but-duplicate-still-runs regression, and a guard asserting the migration still compares on `normalize_utr` and still excludes rejected rows.
- `supabase/tests/f0d_rpc_checks.sql` (13 branches) — everything living inside the plpgsql RPC, where a mocked client would only be testing the mock.
- `tests/extraction-grounding.spec.ts` — one-line fix: its fake admin client had no `.rpc`, so the new call threw into the `catch`. Without this the suite would have stayed green against an implementation whose duplicate check failed 100% of the time.

**Harness results, reproduced identically by Tushar and by SQL audit:** A/B/C `UTR_ALREADY_USED` (exact, separator variant, case variant) · D rejected-only UTR passes through (D15 intact) · E `UTR_IS_TXN_ID` · F `UTR_MISMATCH` · G `UTR_EXTRACTION_UNREADABLE` · H/I/J `EXTRACTION_NOT_OWNED` (foreign extraction, missing id, wrong doc_type) · K master carve-out succeeds · L `unique_violation on uq_tournament_payments_utr_active` · M all 11 parity fixtures match. Post-run state confirmed unchanged: 7 payments, 0 harness documents, outbox 6.

**Correction to the previous PROJECT_STATE:** it claimed `EXTRACTION_NOT_OWNED` was "not verifiable in production — every extraction in the database belongs to one account." That is no longer true. `extraction_documents` has four distinct uploaders (`753b536b`, `6817f058`, `48e9e020`, `edb3c95d` — all Tushar's own accounts) plus 122 legacy rows with `uploaded_by` NULL. Harness case H exercises the branch against a genuinely foreign extraction. `753b536b` is confirmed **not** master, which is what makes H, I and J meaningful.

**3. UI guard.** `tests/ui-conventions.spec.ts` — 5 rules over all 255 files in `src/`. Survey before writing: zero `dark:` variants, and all 33 raw palette utilities confined to `CategoryCriteriaChips.tsx` in the permitted shape — so the guard passes with **no allowlist of grandfathered violations**. Verified to bite via three sabotage runs (`dark:bg-red-900`, `text-violet-700` in the exception file, `dark:-mt-2`), each reverted. The `dark:` lookahead is `(?=\S)` rather than `(?=[A-Za-z[])` so `dark:-mt-2` and `dark:!bg-red-500` cannot escape; it still excludes the one legitimate `{ dark: ".dark" }` object key in `chart.tsx`.

---

## 9. Immediate next step

**Status as of 9 Aug 2026:** Phase 2A-3 prerequisites F0a–F0e **and** the F0d closeout are complete and production-verified. `extract` v45, schema v3, **474 tests passing / 3 known failures**, everything merged and pushed to `main` at `10744a8`. Working tree clean.

**Next: F1, then F2 — in a fresh chat.**

**F1 — profile verification prerequisite.** Verified email + verified phone before payment submission. Open question that must be settled first: **OTP SMS provider and budget.** Not free. Email verification likely reuses Supabase auth email. Decide the provider before any code.

**F2 — conditional auto-approval.** Per D28: gate on the named security-relevant flag reasons (`utr_format`, `utr_duplicate`, `amount_mismatch`, `payee_vpa_mismatch`, `payee_vpa_missing`, `date_stale`, `direction_not_outgoing`, `required_fields_missing`), never on flag count. Three things to resolve during design:
1. **Decline messages are a fraud oracle.** Naming which invariant failed lets an attacker iterate. Recommend a generic message to the organizer, itemised reasons in `/admin/payments` only.
2. **`file_hash` duplicate-screenshot invariant** — currently nothing checks it; belongs in the F2 gate.
3. **`auto_upi` source value** needs the `source` CHECK on `tournament_entitlements` widened, mirroring how `manual_upi` was added.

**Opening line for the next chat:**
> *Continue the Prize Manager project. Read PROJECT_STATE.md §8 and §9. Phase 2A-3 prerequisites F0a–F0e and the F0d closeout are all complete and production-verified — extract v45, schema v3, 474 tests passing / 3 known failures, merged to main at `10744a8`, working tree clean. Starting F1 (profile verification). Before any code, settle the open question: which OTP SMS provider and what budget, given no paid services without justification (guardrail 5). Begin by reporting what verification state already exists on `profiles` and in Supabase auth, and what the payment submission path currently checks, before proposing anything.*

---

## 10–13. Phase 2B / 2C-D / 3 / 4 — unchanged

Phase 2B (bank statement reconciliation) blocked on 2A-3. Phase 2C-D (REST API + MCP) blocked on 2B. See PHASE2_PRD.md.

---

## 14. Tracked debt

| Item | Priority | Detail |
|---|---|---|
| ~~`extractions` UPDATE policy too broad~~ | ✅ RESOLVED | F0a |
| ~~Three fail-open trust invariants~~ | ✅ RESOLVED | F0c |
| ~~UTR-match enforcement~~ | ✅ RESOLVED | F0d Migration B |
| ~~Hard-block duplicate UTR at submission~~ | ✅ RESOLVED | F0d Migration B |
| ~~`tournament_payments` client write grants~~ | ✅ RESOLVED | F0d Migration A |
| ~~3-arg / 4-arg claim overloads live~~ | ✅ RESOLVED | Dropped in Migration A |
| ~~`review_tournament_payment` `anon`-executable~~ | ✅ RESOLVED | Grant-only fix, Migration A |
| ~~Dead `dark:` variants / raw palette utilities~~ | ✅ RESOLVED | UI batches 1, 2a, 2b, 2c |
| ~~`normalize_utr` parity~~ | ✅ RESOLVED | `utr_active_duplicate_exists` + `20260808172212`; verified in prod on `extract` v45 |
| ~~F0d test suite~~ | ✅ RESOLVED | 21 vitest cases + 13-branch SQL harness; `EXTRACTION_NOT_OWNED` covered 3 ways |
| ~~No UI guard test~~ | ✅ RESOLVED | `tests/ui-conventions.spec.ts`, 5 rules, sabotage-verified |
| **Auto-approve gate must use named flag reasons** | **HIGH — F2** | See D28 |
| **F2 decline messages are a fraud oracle** | **HIGH — F2 design** | PRD says "specific, human-readable pop-up". Naming which invariant failed lets an attacker iterate. Recommend generic message to organizer, itemised reasons in `/admin/payments` only. |
| **No duplicate-screenshot (`file_hash`) invariant** | MEDIUM — F2 | Same image re-uploaded creates a new `extraction_documents` row with the same `file_hash`; nothing checks it |
| **Advisory duplicate check fails open** | Accepted residual | RPC error → no flag, only a `console.warn`. Bounded by the hard block + unique index (Q6). Nothing alerts if it starts failing in production — only absence of `utr_duplicate` on a known-duplicate upload would reveal it |
| `import.meta.url` vs `process.cwd()` inconsistency | LOW | `ui-conventions.spec.ts` resolves the repo root from `import.meta.url` and works; `payment-utr-normalization.spec.ts` uses `process.cwd()` and its comment claims `import.meta.url` is an `http://` URL under jsdom. Both work; the second justification looks wrong. Harmonise when either file is next touched |
| 122 `extraction_documents` rows with `uploaded_by` NULL | LOW | Legacy (≤20 Jul). If any were `payment_screenshot`, the F0d ownership gate would reject them — fail-closed, so not a hole. Not audited by doc_type |
| **Consistent-but-wrong UTR** | Accepted residual | OCR misreads, organizer accepts pre-fill → submitted and extracted agree, both wrong vs bank. Only Phase 2B closes this. |
| **UTR-only valve** | Accepted residual | No screenshot = no mismatch check by construction. Safe under F2 (no-extraction claims never auto-approve). |
| `tsconfig.app.json` scope gap | MEDIUM | Covers `src/` only |
| `MAX_ATTEMPTS=5` with no backoff | MEDIUM | Brief Resend outage permanently loses a notification |
| `CLAUDE.md` schema drift | MEDIUM | Says v3 active; actual is v5. Missing AuthProvider, `db query --linked`, tsc correction, N1 hygiene, UI conventions |
| Stale generated types | MEDIUM | `src/integrations/supabase/types.ts` predates Jul 29 onward. Regenerate. |
| `/admin/team-snapshots` broken | MEDIUM | RPC `detect_missing_team_snapshots` 404; page calls `is_master(uuid)` but DB function is `is_master()` |
| `brew unlink node` fragile | MEDIUM | Homebrew node 26.5.0 unlinked; any `brew upgrade` re-shadows v22 → 9 test failures |
| Direction marker regexes lack `\b` anchors | LOW | `sent to` matches inside `present to`; bounded by D27 |
| Stale v2 tests reference `direction_label` | LOW | Pass but mislead |
| `app`/`status_text` grounding nondeterministic | LOW | Cosmetic; excluded from F2 gate per D28 |
| Repo is public | LOW — noted | Verified no secrets committed. Escape-hatch phone number ships deliberately. |
| Two parallel session paths | LOW | 16 call sites read token via `supabase.auth.getSession()` directly |
| `platform_feature_flags` RLS | LOW | Enabled with zero policies; read via SECURITY DEFINER RPC only |
| Payment unit tests assert literals | LOW | Tests 7–10 assert arithmetic rather than calling `paymentTrustCheck.ts` |

---

## 15. How to start each new chat

**One chat per workstream.** At every phase boundary: Claude gives an updated `PROJECT_STATE.md` → delete the old one in the Project knowledge panel → upload the new one → open a fresh chat → paste the opening line.

**Working rules that do not change:**
- Always `/clear` in Claude Code before a new prompt.
- Edge-function changes need `supabase functions deploy <name>` — Lovable publish ships frontend only (P5).
- Use `git --no-pager diff`, never plain `git diff`.
- Paste terminal output as **text**, never screenshots.
- Claude (chat) verifies every Claude Code / Lovable claim against Supabase SQL before advancing.
- Full `git diff` text is required in every build report. "Printed above in tool output" is not acceptable.
- `npx tsc -p tsconfig.app.json --noEmit`; verify the 12-error baseline by stashing, not by assuming.
- Before starting a branch: `git status` must be clean.
- Migration workflow: `supabase db query --linked -f <file>` then `supabase migration repair --status applied <version>`. `supabase db execute` does not exist.
- When touching allocation-adjacent files, take a SHA-256 baseline of `supabase/functions/` first and diff it afterwards.
