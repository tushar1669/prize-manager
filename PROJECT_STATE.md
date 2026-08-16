# PROJECT_STATE — Prize Manager · Universal Extraction Engine
**Last updated:** 16 August 2026 · **Owner:** Tushar · **This file is the single source of truth for continuing work in any new chat.**

Replace the previous PROJECT_STATE.md in the repo with this file. Paste it at the start of every new chat to re-establish context.

---

## 1. What this project is

**Prize Manager** (prize-manager.com) is a chess tournament management platform. Phase 1 built a brochure extraction engine: organizer uploads a PDF brochure → two-pass Gemini OCR + structured extraction + deterministic trust/grounding layer → review screen → on Approve, a tournament is created with categories and prizes.

**Phase 2** extends the same extraction engine into a Universal Extraction Engine serving three platforms and eventually external developers. The engine is doc-type-driven; adding a new document type requires only a new schema row and new trust invariants — not a new pipeline.

**Three-platform context:**
- **prize-manager.com** — Tournament prize management (live). Phase 2A/2A-2/2A-3 added payment screenshot verification, the full payment lifecycle, UTR trust hardening, and the profile prerequisite.
- **certificate-hub.com** — Certificate creation service; paywalled. Will consume the extraction engine via REST API (Phase 2C).
- **sportup.online** — Discovery + tournament management platform. Will consume via REST API (Phase 2C).

---

## 2. Key identifiers

| Item | Value |
|---|---|
| Supabase project | `nvjjifnzwrueutbirpde` (prize-manager.com, ap-south-1, Postgres 17) |
| Edge functions | `extract` (**v46**), `commit-extraction` (v13), `send-payment-notifications` (v7, `verify_jwt=false`), `sendWelcomeOnboardingEmail` (v20), `allocatePrizes`, `allocateInstitutionPrizes`, `backfillTeamAllocations`, `finalize`, `publicTeamPrizes`, `generatePdf`, `parseWorkbook`, `pmPing` |
| Active extraction schema | `extraction_schemas` v5 (chess_brochure), **v3 (payment_screenshot)** |
| Storage buckets | `extraction-uploads`, `brochures`, `exports`, `imports` |
| Repo | github.com/tushar1669/prize-manager (**public**) · branch: **main** at **`01e6a3e`** |
| Gemini model | `GEMINI_MODEL` env secret = `gemini-3.1-flash-lite` |
| Local paths | repo `~/Desktop/prize-manager`, test PDFs `~/Desktop/prize-manager/test-brochures/` |
| Payment trust invariants | 8 in `extract/paymentTrustCheck.ts`: `utr_format`, `utr_duplicate`, `amount_mismatch`, `payee_vpa_mismatch`, `payee_vpa_missing`, `date_stale`, `direction_not_outgoing`, `required_fields_missing` |
| Test baseline | **474 passing, 3 known failures** (conflict-utils ×2, martech-metrics ×1 — pre-existing). Verified 16 Aug. |
| TypeScript check | `npx tsc -p tsconfig.app.json --noEmit` — **12 pre-existing errors**. Verified 16 Aug. Root `npx tsc --noEmit` checks nothing. |
| pg_cron jobs | jobid 1 `expire-stuck-extraction-documents` (*/10); jobid 2 `drain-payment-notifications` (*/2) |
| Claim RPC | **5-arg only.** 3-arg and 4-arg dropped in F0d Migration A. |
| Client grants on `tournament_payments` | `authenticated`: **SELECT only**. `anon`: **nothing**. |
| Client grants on `profiles` | `authenticated`: **SELECT only**. `anon`: **nothing**. All writes via `update_my_profile`. (F1-A2) |
| Client grants on `tournament_player_watermark` | **NOTHING for either role.** RLS on, zero policies. (Audit step 3) |
| Backstop index | `uq_tournament_payments_utr_active` — UNIQUE on `normalize_utr(utr)` WHERE `status <> 'rejected'` |
| Advisory duplicate lookup | `public.utr_active_duplicate_exists(text)` — STABLE, SECURITY DEFINER, EXECUTE to `service_role` only |
| Verification harnesses | `supabase/tests/f0d_rpc_checks.sql` — **17 branches**, ends `ERROR: HARNESS RESULTS` (pass condition). **17/17 verified 16 Aug, byte-identical to the F1 baseline.**<br>`supabase/tests/pf1b_expected_amount.sql` — **9 cases**, ends `ERROR: PF1B HARNESS RESULTS` (pass condition). **9/9 verified 16 Aug.** |
| Design doc | `docs/design/UI_CONVENTIONS.md` — governs all styling. Dark-only. Enforced by `tests/ui-conventions.spec.ts`. |
| Live counts (16 Aug, session close) | 97 tournaments · 13,699 players · 117 watermark rows · 7 payments · 9 entitlements · 31 coupons · 172 extraction_documents · 170 extractions · **0 `auto_ok` payment extractions** |

### Functions added / changed in PF1 (16 Aug)

| Function | Shape | Grants |
|---|---|---|
| `public.tournament_billing_basis(uuid)` | **NEW.** `GREATEST(live players, watermark)`. STABLE, SECURITY DEFINER, `search_path=public` | `anon` **no**, `authenticated` **no**, `service_role` yes |
| `public.tournament_pro_tier(integer)` | **NEW.** The 0/500/1000 ladder + tier label + the `150` threshold. IMMUTABLE. RETURNS TABLE | `anon` **no**, `authenticated` **no**, `service_role` yes |
| `public.expected_payment_amount_inr(uuid,uuid)` | **NEW.** Canonical price **and** the coupon rule. Returns `(billing_basis, canonical_amount_inr, expected_amount_inr)`. STABLE, SECURITY DEFINER | `anon` **no**, `authenticated` **no**, `service_role` yes |
| `public.get_tournament_pro_price(uuid)` | Rewired to the two helpers; no inline count, ladder or `150` | `authenticated` retained; **`anon` revoked** (dead grant) |
| `public.get_tournament_access_state(uuid)` | Rewired to the two helpers; same billing basis | unchanged (`authenticated` only) |
| `public.submit_tournament_payment_claim(...)` | Coupon block removed; calls `expected_payment_amount_inr`. Error census and gate ordering unchanged | unchanged (`authenticated` only) |

### Migrations (16 Aug)

| Version | What |
|---|---|
| `20260816120000` | PF1-A — one billing basis, one tier ladder; price/access rewired; dead `anon` EXECUTE on `get_tournament_pro_price` revoked |
| `20260816140000` | PF1-B — `expected_payment_amount_inr` created; claim RPC calls it |

Both applied via `supabase db query --linked -f`, both registered with `supabase migration repair --status applied`, both confirmed in `supabase migration list`.

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
10. NEVER modify `review_tournament_payment`'s core entitlement-insert logic.
11. Screenshot upload is OPTIONAL. The UTR-text-only path must keep working.
12. NEVER expose the platform payee VPA or the auto-approve secret in frontend code or logs.

**Master / admin / auth:** M1–M5 unchanged. **Phase 2A-2:** N1–N5 unchanged. **Phase 2A-3:** P1–P6 unchanged. **F0d:** Q1–Q7 unchanged. **UI:** U1–U5 unchanged. **F1:** R1–R7 unchanged. **Client write-grant audit:** S1–S8 unchanged (see §10).

**PF1 — single source of truth (new, 16 Aug) — T1–T6:**

T1. **The billing basis is `public.tournament_billing_basis(uuid)` and it exists exactly once.** `get_tournament_pro_price`, `get_tournament_access_state` and `expected_payment_amount_inr` all call it. Never inline a player count or a watermark lookup again — S5's "change one, change both" has been replaced by "there is only one."

T2. **The tier ladder is `public.tournament_pro_tier(integer)` and it exists exactly once.** It is the only place the numbers `150`, `500` and `1000` and the labels `free_0_to_150` / `pro_151_to_500` / `pro_501_plus` are written in the database. `src/constants/tournamentAccess.ts` holds a **display fallback only** and must never become a computation.

T3. **`public.expected_payment_amount_inr(tournament, user)` is the only answer to "what should this person pay".** It carries the canonical price *and* the coupon predicate. `submit_tournament_payment_claim` validates against it; `extract/paymentTrustCheck.ts` flags `amount_mismatch` against it. **F2 must use it too — do not compute an expected amount anywhere else.**

T4. **`paymentTrustCheck.ts` must never regain its own price logic.** It previously counted players **live**, so it disagreed with the billing basis the instant anyone deleted a player — the exact E2 scenario the watermark closed. A comment block in the file says so; keep it.

T5. **`getExpectedAmountInr` returning null is a deliberate fail-open** — no `amount_mismatch` flag is raised when the RPC fails. That is correct *today* because a human reviews every payment. **It stops being correct the moment F2 ships.** See §11 finding 2.

T6. **New functions need `notify pgrst, 'reload schema'`.** `extract` reaches `expected_payment_amount_inr` over PostgREST, not over a direct connection. Without the reload the call 404s, the amount check silently stops running, and nothing looks broken. Verified live after PF1-C: `amount_mismatch` fired with `expected: 500`.

**Phase 2B:**
13. Bank statements are `privacy_class='sensitive'`. NEVER process through Gemini. pdfplumber only.

---

## 4–9. Phases 1, 2A, Workstream C, 2A-2, F0a–F0e, F1 — COMPLETE

See prior PROJECT_STATE for full detail. All shipped and production-verified. Nothing in these sections changed during the audit or PF1.

---

## 10. Client write-grant audit — COMPLETE ✅ (14 August 2026)

Unchanged from the previous PROJECT_STATE. Summary: run **before** F2 by deliberate reversal of the order in the older docs. Three proven exploits found and closed — **E1** `issue_referral_rewards` unbounded 100%-off coupons (`20260814120000`), **E2** player-count price self-attestation (`20260814160000`, high-water mark), **E3** `publish_tournament` with no ownership check (`20260814140000`). Dead grants removed from eight tables (`20260814180000`). `coupons` / `coupon_redemptions` / `tournament_entitlements` checked and clean (master-only RLS, control-tested `42501`). Guardrails S1–S8. **D38: a SECURITY DEFINER function's EXECUTE grant is a write path RLS cannot see.**

**E2 is the reason PF1 exists.** The audit fixed the *database's* billing basis but left two other implementations of the same rule in place — one of which is the input to F2's `amount_mismatch` gate.

---

## 11. F2 pre-design audit + PF1 — COMPLETE ✅ (16 August 2026)

### The audit that preceded any code

Four questions were answered against the live DB and the deployed `extract` source before anything was proposed.

**Which flag reasons `extract` emits, and at what severity.** Nine reasons across both checkers. **Every payment reason is hardcoded `severity: "high"` — including `ungrounded`.** There is no severity value that separates the security set from the cosmetic set, which confirms D28's named allow-list is the only workable discriminator, not merely the preferable one. Live counts over 14 payment extractions: `amount_mismatch` 13, `utr_duplicate` 5, `ungrounded` 5, `payee_vpa_missing` 3, `direction_not_outgoing` 3, `payee_vpa_mismatch` 1. **`utr_format`, `date_stale` and `required_fields_missing` have never fired in production** — F2 will gate on three branches no real screenshot has ever exercised.

**How `status` is forced.** `extract/index.ts` line 785: `if (doc.doc_type === "payment_screenshot") status = "needs_review";` — an unconditional override *after* `decideStatus`, persisted to both `extractions.status` and `extraction_documents.status`. `decideStatus` itself uses `flags.length === 0`, the exact rule D28 rejects. Live: 14/14 `needs_review`, zero `auto_ok`. The `extraction_status` enum already contains `auto_ok`, `approved`, `rejected` — no enum change needed.

**What the `source` CHECK permits.** `CHECK (source = ANY (ARRAY['payment','coupon','manual_upi']))`. **`auto_upi` is not permitted** (F2-7 confirmed). Only `review_tournament_payment` writes it, hardcoded. Nothing branches on the value; `useMartechMetrics.ts:299` groups generically. **`review_tournament_payment` cannot be reused by a server-side caller** — its first statement is `has_role(auth.uid(),'master')` and `auth.uid()` is NULL under service-role, so it raises `FORBIDDEN`. Guardrail 10 forbids changing it. F2's approval write needs its own path.

**Whether anything reads `file_hash`.** **Nothing does.** Four write sites, one **non-unique** btree index, zero functions, views, constraints or frontend reads. Live: 14 payment documents, **5 distinct images**. One image was submitted against **two different tournaments** under two different UTRs with one approved. Correction to the older note: `extract/index.ts:493` **overwrites** the client-supplied hash with a server-computed SHA-256 before pass 1, so any row that has an extraction carries a server-authoritative hash.

### Five findings that constrain F2

1. **~~A third implementation of the pricing rule~~ — RESOLVED by PF1.**
2. **Absence of a flag is not evidence a check passed.** `amount_mismatch` is skipped entirely when `tournament_id` is absent from the request body, when `uploaded_by` is NULL (122 legacy rows), or when the extracted amount is not finite. `payee_vpa_mismatch` is skipped if `PLATFORM_PAYEE_VPA` is unset. `utr_duplicate` fails open on RPC error (Q6). A gate reading "no allow-listed reason is present" auto-approves all of these. **Decision taken: `skipped` is not `pass`.**
3. **`/extract` performs no caller-ownership check.** `verify_jwt=true`, then a service-role client reads the document by ID with no comparison between the JWT subject and `doc.uploaded_by`. Both `document_id` and `tournament_id` are caller-supplied. Harmless today; fatal if the auto-approve decision lives there.
4. **Re-extraction is unbounded and nondeterministic.** Three documents carry multiple extractions; one carries **6 extractions with 3 distinct flag sets** from identical bytes. The client picks which `extraction_id` to submit. The claim RPC pins ownership and UTR-match but not "is this the only extraction".
5. **The outbox has no slot for F2-4's admin email.** `action` is `CHECK (action IN ('approved','rejected'))` with `UNIQUE (payment_id, action)`. The organizer's approval email already fires from the existing trigger with no wiring (D17 as designed); the oversight email to chess.tushar@gmail.com needs the CHECK widened.

### PF1 — one billing basis, one tier ladder, one expected amount

Three deploy cycles, all verified live. **Merged to `main` at `01e6a3e`.**

**PF1-A (`20260816120000`).** Created `tournament_billing_basis` and `tournament_pro_tier`; rewired `get_tournament_pro_price` and `get_tournament_access_state` to call them. The migration proved equivalence over **all 117 tournaments** before committing — 0 basis mismatches, 0 amount mismatches, 0 label mismatches. Tier distribution unchanged: 92 free / 20 at ₹500 / 5 at ₹1000. **No tournament's price moved.**

It also caught something nobody was looking for. The grant-proof block failed on first run with `anon gained price EXECUTE` — and `anon` had not gained it, it **already held an explicit EXECUTE on `get_tournament_pro_price`** while `get_tournament_access_state` did not. Provably dead (the function's first statement raises `UNAUTHORIZED` when `auth.uid()` is NULL, which it always is for `anon`; sole caller is an authenticated page), so it was removed rather than left to drift. **Same asymmetry shape as E3.** The lesson is about the guard, not the grant: *an assertion written from memory rather than measurement will fire on the truth and look like a regression.*

**PF1-B (`20260816140000`).** Created `expected_payment_amount_inr` carrying the canonical price and the coupon predicate; `submit_tournament_payment_claim` now calls it and no longer mentions `coupon_redemptions` or `get_tournament_pro_price`. Verified structurally: **profile gate at char 1258 → price lookup at 1716 → F0d block at 2605**, so D37's ordering holds. Error census unchanged across all 11 codes (`UNAUTHORIZED` ×3, `PENDING_PAYMENT_ALREADY_EXISTS` ×2, `UTR_ALREADY_USED` ×2, rest ×1).

**All 6 live coupon redemptions are 100%-off (`amount_after = 0`), so the partial-discount branch has never executed in production.** Live data could not prove the move was faithful. `supabase/tests/pf1b_expected_amount.sql` proves it with fixtures — 9 cases covering baseline, partial discount, consumed-coupon reversion, stale `amount_before`, `amount_after = 0`, newest-redemption-wins, cross-user isolation, and **end-to-end through the claim RPC**: a claim at canonical ₹500 with a discount active returns `INVALID_PAYMENT_AMOUNT`, a claim at the discounted ₹300 succeeds. **9/9, all fixtures rolled back, residue verified zero.**

**PF1-C (`extract` v46).** `getExpectedAmountInr` lost its live player count, its 0/500/1000 ladder and its coupon query; it is now one `admin.rpc("expected_payment_amount_inr", …)` call. Bundle hash changed (`b387a65c…` → `0136c488…`).

**Proven in production, not inferred.** A ₹1 screenshot uploaded against a ₹500 tournament on `tusharsaraswat68@gmail.com` produced:

```json
{ "field": "amount_inr", "reason": "amount_mismatch", "stated": 1, "expected": 500, "severity": "high" }
```

`expected: 500` can only have come from the new RPC — the code that used to compute it no longer exists in the bundle. A failed RPC would have produced **no flag at all**, which is what makes the test decisive. `payee_vpa_mismatch`, `direction_not_outgoing`, `payee_vpa_missing` and `date_stale` all correctly stayed silent; `status` remained `needs_review`.

**Session close:** tsc **12** · vitest **474 passed / 3 known failures** · F0d harness **17/17 byte-identical to the F1 baseline, case Q returning `PROFILE_INCOMPLETE`** · PF1-B harness **9/9** · `main` at `01e6a3e`, working tree clean.

One artifact left behind deliberately: extraction `9c41508d` (document `f5a88a46`) is a `needs_review` payment extraction with no payment claim attached — the PF1-C proof.

---

## 12. Immediate next step

**F2 (conditional auto-approval) is the next workstream. Fresh chat.** Its blocking prerequisite — a third implementation of the pricing rule feeding the `amount_mismatch` gate — is now gone.

**Four decisions already taken during the F2 pre-design audit. Do not relitigate them; implement them.**

1. **The auto-approval decision lives in a claim-time RPC, not inside `/extract`.** At claim time `auth.uid()` is real, ownership is checked, the amount is validated against `expected_payment_amount_inr`, the UTR is matched, and the extraction is pinned to the payment. Findings 3 and 4 both disappear. The entitlement write has to happen in SQL anyway, since `review_tournament_payment` is unusable from service-role and guardrail 10 forbids changing it.

2. **`skipped` is not `pass`.** `extract` must record a **verdict per named invariant** — `pass` / `fail` / `skipped` — and F2 requires all eight to be `pass`. This is the same principle as D22 (absence became its own flag) and D27 (outgoing must be *proven*). **Accepted cost:** F2 modifies `extract` as well as adding an RPC, and the false-decline rate rises — three of the eight invariants have never fired in production, and any landing in `skipped` sends an honest payer to manual review. A false decline costs a click; a false approval costs revenue and is invisible.

3. **`file_hash` scope: global, restricted to hashes linked to a non-rejected payment, and it denies auto-approval rather than blocking submission.** Global costs nothing over per-user in false positives and per-user has a trivial bypass (a second signup). Restricting to non-rejected payments preserves D15 — the live data contains a legitimate resubmission (`282d67b367`, rejected 3 Aug then approved 6 Aug with the same image and UTR) that an "any upload ever" rule would have blocked. Denying auto-approval rather than hard-blocking avoids inventing a new way for an honest organizer to get stuck at the paywall, which F2-2's generic messaging would make un-debuggable for them.

4. **F2-5 changes from "Edge Function secret" to "server-side kill switch unreachable from any client."** A database RPC cannot read an edge function secret. `platform_feature_flags` satisfies every property the requirement actually asks for — verified live: RLS on, **zero policies**, `anon` and `authenticated` hold **no SELECT and no UPDATE** — and is *more* auditable than a secret, since it carries `updated_at` and `updated_by`. **This is a PRD amendment; apply it when PHASE2_PRD.md is next revised.**

Plus the three items already tracked: gate on named flag reasons never flag count (D28); decline messages are a fraud oracle, generic to the organizer and itemised in `/admin/payments` only; and widen the `tournament_entitlements.source` CHECK to permit `auto_upi`, mirroring how `manual_upi` was added.

**Opening line for the next chat:**

> *Continue the Prize Manager project. Read PROJECT_STATE.md §11 and §12. The F2 pre-design audit is complete and PF1 has shipped: the billing basis, the tier ladder and the expected payment amount each now have exactly one implementation, `extract` v46 reads `expected_payment_amount_inr` over RPC, and that was proven in production by an `amount_mismatch` flag carrying `expected: 500`. Guardrails T1–T6 now apply on top of S1–S8. 474 tests / 3 known failures, tsc 12, F0d harness 17/17, PF1-B harness 9/9, main at `01e6a3e`, working tree clean. Starting F2 (conditional auto-approval). The four decisions in §12 are settled — design to them, don't reopen them. Before any code, propose the F2 design in three parts: (a) where the per-invariant verdict record lives and what shape it takes, (b) the exact signature and authorization of the claim-time auto-approval RPC, (c) how the `file_hash` check is expressed. Show me the design before writing anything.*

---

## 13. Backlog — carried forward, NOT forgotten

### B1 — `coupons` admin hardening (was audit step 5) · MEDIUM, defence-in-depth

**Not currently exploitable.** `coupons`, `coupon_redemptions` and `tournament_entitlements` hold client write grants but are fully closed by master-only RLS — control-tested `42501` as a non-master. This is about removing a surface that is one careless policy edit from being live.

**The ordering is the decision (D36 pattern) — never revoke before the write path exists:** additive `admin_update_coupon(...)` RPC (note `admin_create_coupon` already exists and is unused) → frontend switches `src/hooks/useCouponsAdmin.ts` off direct table writes → **production HAR capture proving zero PATCH/POST to `/rest/v1/coupons`** (mandatory here, unlike step 4's dead grants, because these writes genuinely work today) → revoke INSERT/UPDATE/DELETE and consider dropping the write policies so both layers close together.

### B2 — `master_allowlist` dead grants · LOW, blocked on M1

Full client write grants with zero write policies, so closed today. Deliberately excluded from `20260814180000` because it sits on the master/admin role-resolution path. Requires an explicit M1 exception. One-line migration when cleared.

### B3 — Watermark UI for the master reset · LOW

`master_reset_player_watermark(uuid)` exists and is verified working (520 → 294 in test) but is SQL-only. Add a control on `/admin/tournaments` when that page is next touched.

---

## 14–17. Phase 2B / 2C-D / 3 / 4 — unchanged

Phase 2B (bank statement reconciliation) blocked on 2A-3. Phase 2C-D (REST API + MCP) blocked on 2B. See PHASE2_PRD.md.

---

## 18. Tracked debt

| Item | Priority | Detail |
|---|---|---|
| ~~`extractions` UPDATE policy / three fail-open invariants / UTR hard-block / `tournament_payments` grants~~ | ✅ RESOLVED | F0a, F0c, F0d |
| ~~`normalize_utr` parity / F0d test suite / no UI guard test~~ | ✅ RESOLVED | `utr_active_duplicate_exists`, 21 vitest cases, SQL harness, `ui-conventions.spec.ts` |
| ~~`profiles` client-writable / reward-flag reset / harness depends on live phone / stale types~~ | ✅ RESOLVED | F1 |
| ~~33 tables retain client write grants~~ | ✅ RESOLVED | Audit 14 Aug. Real number 26. Three exploits closed. See §10 |
| ~~`issue_referral_rewards` / player-count self-attestation / `publish_tournament`~~ | ✅ RESOLVED | `20260814120000`, `20260814160000`, `20260814180000` |
| ~~Third implementation of the pricing rule in `paymentTrustCheck.ts`~~ | ✅ RESOLVED | PF1. See T1–T4 |
| ~~Price vs access-state billing-basis drift (S5)~~ | ✅ RESOLVED | PF1-A — both call one helper |
| ~~Dead `anon` EXECUTE on `get_tournament_pro_price`~~ | ✅ RESOLVED | PF1-A |
| **`extract` cannot tell "check passed" from "check skipped"** | **HIGH — F2** | Finding 2. Blocking for F2's gate; harmless while a human reviews every payment |
| **`/extract` has no caller-ownership check** | **HIGH — F2 design input** | Finding 3. `document_id` and `tournament_id` both caller-supplied. Mitigated by putting the decision at claim time |
| **Re-extraction unbounded → flag shopping** | **HIGH — F2 design input** | Finding 4. One document has 6 extractions with 3 distinct flag sets |
| **Auto-approve gate must use named flag reasons** | **HIGH — F2** | D28. Severity cannot discriminate — `ungrounded` is also `high` |
| **F2 decline messages are a fraud oracle** | **HIGH — F2 design** | Generic to organizer, itemised in `/admin/payments` only |
| **No duplicate-screenshot (`file_hash`) invariant** | MEDIUM — F2 | Scope decided: global, non-rejected payments only, denies auto-approval. `file_hash` is server-overwritten on the extraction path |
| **Outbox `action` CHECK has no slot for the F2 oversight email** | MEDIUM — F2 | `CHECK (action IN ('approved','rejected'))` + `UNIQUE (payment_id, action)` |
| **`FieldFlag.reason` union in `trustCheck.ts` is stale** | MEDIUM | Missing `payee_vpa_missing`, `direction_not_outgoing`, `required_fields_missing` — all three are pushed anyway. Compiles only because `tsconfig.app.json` excludes `supabase/functions/`. **Do not derive F2's allow-list from this type** |
| **Three named invariants have never fired in production** | MEDIUM — F2 | `utr_format`, `date_stale`, `required_fields_missing`. F2 will gate on untested branches |
| **PRD / ARCHITECTURE carry stale content** | MEDIUM | Both still say the grant audit follows F2 (it preceded it). ARCHITECTURE §2.4 shows an early `return` that is not the shipped code. F2-5's "Edge Function secret" needs amending per §12.4. Correct all four at the next revision |
| **Gate / helper drift risk** | MEDIUM | `my_payment_gate_status()` vs the RPC gate (R4). Nothing tests the helper side. The billing-basis instance of this shape (S5) is now closed by T1 |
| `CLAUDE.md` schema drift | MEDIUM | Says v3 active; actual is v5. Missing AuthProvider, `db query --linked`, tsc correction, N1 hygiene, UI conventions, R1–R7, S1–S8, and now T1–T6 |
| `MAX_ATTEMPTS=5` with no backoff | MEDIUM | Brief Resend outage permanently loses a notification |
| `/admin/team-snapshots` broken | MEDIUM | RPC `detect_missing_team_snapshots` 404; page calls `is_master(uuid)` but DB function is `is_master()` |
| `brew unlink node` fragile | MEDIUM | Any `brew upgrade` re-shadows v22 → 9 test failures |
| `tsconfig.app.json` scope gap | MEDIUM | Covers `src/` only — this is why the stale `FieldFlag` union compiles |
| **No watermark UI** | LOW — B3 | `master_reset_player_watermark` is SQL-only |
| `as never` RPC casts in `TournamentUpgrade.tsx` | LOW | Drop when the file is next touched |
| Direction marker regexes lack `\b` anchors | LOW | Bounded by D27 |
| Stale v2 tests reference `direction_label` | LOW | Pass but mislead |
| `app`/`status_text` grounding nondeterministic | LOW | Cosmetic; excluded from the F2 gate per D28 |
| 122 `extraction_documents` rows with `uploaded_by` NULL | LOW | Legacy (≤20 Jul). Fail-closed under F0d, but they also silently skip `amount_mismatch` — see finding 2 |
| Repo is public | LOW — noted | Verified no secrets committed |
| Two parallel session paths | LOW | 16 call sites read token via `supabase.auth.getSession()` directly |
| `platform_feature_flags` RLS | LOW → **now load-bearing** | RLS on, zero policies, no client SELECT or UPDATE. This is what makes it a valid F2 kill switch (§12.4) |
| Payment unit tests assert literals | LOW | Tests 7–10 assert arithmetic rather than calling `paymentTrustCheck.ts` |
| **Advisory duplicate check fails open** | Accepted residual | Bounded by the hard block + unique index (Q6) |
| **Consistent-but-wrong UTR** | Accepted residual | Only Phase 2B closes this |
| **UTR-only valve** | Accepted residual | No screenshot = no mismatch check by construction |
| Merge commit `7dca9fb` malformed message | COSMETIC | Left alone — amending means force-pushing a public `main` that Lovable syncs |

---

## 19. How to start each new chat

**One chat per workstream.** At every phase boundary: Claude gives an updated `PROJECT_STATE.md` → delete the old one in the Project knowledge panel → upload the new one → open a fresh chat → paste the opening line.

**Working rules that do not change:**
- Always `/clear` in Claude Code before a new prompt — **and verify it took.**
- **First command in any new Terminal window is `cd ~/Desktop/prize-manager`.**
- Edge-function changes need `supabase functions deploy <name>` — Lovable publish ships frontend only (P5).
- **A new database function also needs `notify pgrst, 'reload schema'`** if anything reaches it over PostgREST — including edge functions using `admin.rpc(...)` (T6).
- **Publishing is a separate step from merging.** A database-only migration is live the moment `supabase db query` runs.
- Use `git --no-pager diff`, never plain `git diff`.
- **Always merge with `git merge --no-ff -m "message" <branch>`.** Never rely on the editor.
- Paste terminal output as **text**, never screenshots.
- Claude (chat) verifies every Claude Code / Lovable claim against Supabase SQL before advancing.
- Full `git diff` text is required in every build report — **and must actually be read before a deploy, not summarised from a `--stat` line.**
- `npx tsc -p tsconfig.app.json --noEmit`; verify the 12-error baseline by stashing, not by assuming.
- Before starting a branch: `git status` must be clean.
- Migration workflow: `supabase db query --linked -f <file>` then `supabase migration repair --status applied <version>`. `supabase db execute` does not exist.
- **`RAISE NOTICE` is swallowed** by both `supabase db query --linked` and Supabase MCP `execute_sql`. Silence is the success signal; put failures in `RAISE EXCEPTION` and verify separately with a query.
- **Every migration must self-verify and fail loudly**, in one transaction, so a failed proof rolls the whole thing back.
- **Write guard assertions from measurement, not memory.** PF1-A's grant proof failed on first run because it asserted a state that had never been measured. The guard was right to fire; the assumption behind it was wrong. Query the current state first, then assert it.
- **Prove the fix with a test that can only pass if the fix works.** PF1-C was proven by a flag whose `expected` value could only come from the new RPC — a broken RPC produces no flag at all. "It deployed without errors" proves nothing.
- **Prefer deleting a duplicated rule to synchronising it.** D34 and PF1 both reached the same conclusion from opposite directions.
- When touching allocation-adjacent files, take a SHA-256 baseline of `supabase/functions/` first and diff it afterwards.
- **Never redirect a generator onto a tracked file (R7).** Temp file → verify → `cp`.
- Additive migration → verify → frontend → verify → restrictive migration. Never the reverse.
