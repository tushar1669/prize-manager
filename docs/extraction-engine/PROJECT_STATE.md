# PROJECT_STATE — Prize Manager · Universal Extraction Engine
**Last updated:** 14 August 2026 · **Owner:** Tushar · **This file is the single source of truth for continuing work in any new chat.**

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
| Edge functions | `extract` (**v45**), `commit-extraction` (v13), `send-payment-notifications` (v7, `verify_jwt=false`), `sendWelcomeOnboardingEmail` (v20), `allocatePrizes`, `allocateInstitutionPrizes`, `backfillTeamAllocations`, `finalize`, `publicTeamPrizes`, `generatePdf`, `parseWorkbook`, `pmPing` |
| Active extraction schema | `extraction_schemas` v5 (chess_brochure), **v3 (payment_screenshot)** |
| Storage buckets | `extraction-uploads`, `brochures`, `exports`, `imports` |
| Repo | github.com/tushar1669/prize-manager (**public**) · branch: **main** at **`3434db9`** |
| Gemini model | `GEMINI_MODEL` env secret = `gemini-3.1-flash-lite` |
| Local paths | repo `~/Desktop/prize-manager`, test PDFs `~/Desktop/prize-manager/test-brochures/` |
| Payment trust invariants | 8 in `extract/paymentTrustCheck.ts`: `utr_format`, `utr_duplicate`, `amount_mismatch`, `payee_vpa_mismatch`, `payee_vpa_missing`, `date_stale`, `direction_not_outgoing`, `required_fields_missing` |
| Test baseline | **474 passing, 3 known failures** (conflict-utils ×2, martech-metrics ×1 — pre-existing). Verified 14 Aug. |
| TypeScript check | `npx tsc -p tsconfig.app.json --noEmit` — **12 pre-existing errors**. Verified 14 Aug. Root `npx tsc --noEmit` checks nothing. |
| pg_cron jobs | jobid 1 `expire-stuck-extraction-documents` (*/10); jobid 2 `drain-payment-notifications` (*/2) |
| Claim RPC | **5-arg only.** 3-arg and 4-arg dropped in F0d Migration A. |
| Client grants on `tournament_payments` | `authenticated`: **SELECT only**. `anon`: **nothing**. |
| Client grants on `profiles` | `authenticated`: **SELECT only**. `anon`: **nothing**. All writes via `update_my_profile`. (F1-A2) |
| Client grants on `tournament_player_watermark` | **NOTHING for either role.** RLS on, zero policies. (Audit step 3) |
| Backstop index | `uq_tournament_payments_utr_active` — UNIQUE on `normalize_utr(utr)` WHERE `status <> 'rejected'` |
| Advisory duplicate lookup | `public.utr_active_duplicate_exists(text)` — STABLE, SECURITY DEFINER, EXECUTE to `service_role` only |
| Verification harness | `supabase/tests/f0d_rpc_checks.sql` — self-aborting, **17 branches** (A–M plus N/Q/O/P). Ends with `ERROR: HARNESS RESULTS`; that is the pass condition. **17/17 verified 14 Aug, byte-identical to the F1 baseline.** |
| Design doc | `docs/design/UI_CONVENTIONS.md` — governs all styling. Dark-only. Enforced by `tests/ui-conventions.spec.ts`. |
| Live counts (14 Aug, session close) | 113 tournaments · 13,397 players · 112 watermark rows · 7 payments · 9 entitlements · 31 coupons · 81 publications · 171 extraction_documents · 169 extractions · 3 referrals · 0 referral_rewards |

### Functions added / changed in the audit session (14 Aug)

| Function | Shape | Grants |
|---|---|---|
| `public.issue_referral_rewards(uuid,uuid)` | **UNCHANGED body.** Protected solely by grant removal | **`postgres` + `service_role` only.** anon/authenticated/PUBLIC revoked |
| `public.publish_tournament(uuid,text)` | Owner-or-master predicate added, folded into the existing `FOR UPDATE` lock | `authenticated` retained; anon + PUBLIC revoked |
| `public.get_tournament_pro_price(uuid)` | Tier now computed from `GREATEST(live_count, watermark)` | unchanged |
| `public.get_tournament_access_state(uuid)` | Same billing basis; `players_count` now returns the basis | unchanged |
| `public.tg_players_bump_watermark()` | Trigger fn, SECURITY DEFINER, statement-level, raise-only | no client EXECUTE |
| `public.master_reset_player_watermark(uuid)` | SECURITY DEFINER, master-only, resets watermark to live count | `authenticated` (checks master internally) |

### Audit migrations (14 Aug)

| Version | What |
|---|---|
| `20260814120000` | Revoke client EXECUTE on `issue_referral_rewards` (all three paths) |
| `20260814140000` | `publish_tournament` ownership check + anon/PUBLIC revoke |
| `20260814160000` | `tournament_player_watermark` table, backfill, 2 triggers, price/access on high-water basis, master reset |
| `20260814180000` | Revoke dead client write grants on 8 tables |

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

**Master / admin / auth:** M1–M5 unchanged. See §3 of the prior PROJECT_STATE.

**Phase 2A-2:** N1–N5 unchanged.

**Phase 2A-3:** P1–P6 unchanged.

**F0d:** Q1–Q7 unchanged.

**UI:** U1–U5 unchanged.

**F1:** R1–R7 unchanged.

**Client write-grant audit (new, 14 Aug) — S1–S8:**

S1. **`issue_referral_rewards` has NO internal authorization check and must never be given client EXECUTE again.** It takes the beneficiary-chain root and the idempotency key as caller-supplied parameters and never calls `auth.uid()`. `trigger_tournament_id` has no FK, so every random UUID is a fresh idempotency slot. Its only protection is that `anon`, `authenticated` and `PUBLIC` hold no EXECUTE. Its two legitimate callers (`review_tournament_payment`, `redeem_coupon_for_tournament`) are SECURITY DEFINER owned by `postgres` and run the nested call with postgres privileges. If you ever need a client to trigger rewards, write a new wrapper that checks `auth.uid()` — do not re-grant this one.

S2. **`publish_tournament` must keep its owner-or-master predicate.** It mirrors `unpublish_tournament` exactly. The asymmetry between the two is what made the hole invisible for so long. If you touch either, touch both, and re-run the stranger/owner/master/anon test set.

S3. **`tournament_player_watermark` has RLS on, ZERO policies and ZERO client grants — never add any.** It is deliberately not a column on `tournaments`: `authenticated` holds unrestricted row-level UPDATE on `tournaments` under `org_update_own_tournaments`, so an owner could simply zero the column. This is the D36 trap. Keep the watermark in its own sealed table.

S4. **The watermark is RAISE-ONLY.** Two statement-level triggers cover INSERT and UPDATE on `players`. There is deliberately **no DELETE trigger** — that omission *is* the fix. The only thing that may lower a watermark is `master_reset_player_watermark`. Postgres forbids `REFERENCING NEW TABLE` on a multi-event trigger (`0A000`), which is why there are two triggers and not one.

S5. **The billing basis is `GREATEST(live_count, watermark)`, used identically by `get_tournament_pro_price` and `get_tournament_access_state`.** These are two implementations of one rule, same drift risk as R4. Change one, change both. A tournament with no watermark row falls back to the live count via `COALESCE(...,0)` — correct for a brand-new empty tournament, and the row appears on first player insert.

S6. **Every new table in `public` must have its grants revoked at creation.** Supabase default privileges grant new public tables to `anon` and `authenticated` automatically. That default is how 26 tables ended up needing this audit. The pattern is `REVOKE ALL ... FROM PUBLIC, anon, authenticated` in the same migration as the `CREATE TABLE`.

S7. **A SECURITY DEFINER function's EXECUTE grant is a write path that RLS cannot see (D38).** Two of the three exploitable holes found in this audit were function-grant holes, not table-grant holes. Any future grant-surface review must cover `pg_proc` alongside `pg_class`, and must read each function's body for an internal authorization check rather than trusting that one exists.

S8. **Do not report a table as vulnerable from a grant listing alone.** `coupons`, `coupon_redemptions` and `tournament_entitlements` all hold client write grants and are all fully closed by master-only RLS policies — control-tested live, `42501` on both INSERT attempts. Show the exploit in a rolled-back `DO $$ … RAISE EXCEPTION 'RESULT=…' $$` block or don't claim it.

**Phase 2B:**
13. Bank statements are `privacy_class='sensitive'`. NEVER process through Gemini. pdfplumber only.

---

## 4–8. Phases 1, 2A, Workstream C, 2A-2, F0a–F0e — COMPLETE

See prior PROJECT_STATE for full detail. All shipped and production-verified. Nothing in these sections changed during F1 or the audit.

---

## 9. F1 — Profile verification prerequisite — COMPLETE ✅ (12–13 August 2026)

Unchanged from the previous PROJECT_STATE. Summary: OTP deliberately deferred (TRAI DLT registration fails guardrail 5 against 36 users); F1 gates payment submission on **confirmed email + a validated Indian phone** with a master carve-out; `profiles` was found client-writable at column level, enabling an unbounded free-Pro coupon loop, and was closed by `update_my_profile` + revoke (D36); harness grew 13 → 17 branches. Guardrails R1–R7.

**The generalisation from F1 is what triggered this audit:** RLS restricts rows, never columns. It has now been proven three times (D25/D29 on `extractions`, D36 on `profiles`) — and the audit below added a fourth mechanism it does not cover at all.

---

## 10. Client write-grant audit — COMPLETE ✅ (14 August 2026)

### Why this ran before F2, not after

All three docs originally scheduled this workstream *after* F2. **That order was reversed deliberately.** F1 found a live, exploitable vulnerability on `profiles` only because we happened to be auditing that table for an unrelated reason. F2 grants entitlements automatically; building it on an unaudited grant surface would have automated whatever fraud that surface permitted. The reversal was correct — see the pricing hole below, which F2 would have auto-approved.

**This section supersedes the "after F2" ordering in PHASE2_PRD.md §Timeline and PHASE2_ARCHITECTURE.md §8.** Those two documents still carry the old order and should be corrected at the next revision.

### Scope correction

The docs said "33 tables retain client INSERT/UPDATE/DELETE grants." The real number was **26** (`profiles` was already closed by F1-A2). More importantly, **the framing was too narrow**: two of the three exploitable holes were `EXECUTE` grants on SECURITY DEFINER functions, which no table-grant audit would have surfaced. Recorded as **D38** and guardrail S7.

Column-level write grants existed on exactly **one** table in `public` — `extractions`, the F0a fix. Every other table was RLS-only.

### Three proven exploits, all fixed

Each was demonstrated as `753b536b` — a real non-master organizer — inside a self-aborting `DO $$ … RAISE EXCEPTION $$` block, then re-tested after the fix.

**🔴 E1 — `issue_referral_rewards`: unbounded 100%-off Pro coupons from one RPC call.**

SECURITY DEFINER, EXECUTE held by `anon` *and* `authenticated`, and it never calls `auth.uid()`. Both parameters are caller-supplied. `trigger_tournament_id` has no FK, so any random UUID is a fresh idempotency slot.

```
BEFORE: caller=753b536b beneficiary=753b536b coupons_before=2 coupons_after=5
        minted REF1-83960F31, REF1-4C369E41, REF1-DEFBDAA6 — all 100percent/tournament_pro
AFTER:  42501 permission denied for function issue_referral_rewards — coupons 2 → 2
```

Terminal impact identical to the `profiles` hole F1 closed — `redeem_coupon_for_tournament` computes `amount_after = 0` and inserts an entitlement — but reachable with a single RPC call and **no table write at all**. Precondition is being the referrer of any account, which any user can manufacture with a second signup. Fixed by `20260814120000`. Zero code dependency: the function appears in the repo only in generated `types.ts`.

**Positive control after the fix:** a rolled-back 100%-off redemption completed end-to-end (`after=0 discount=500 reason=redeemed`, entitlement written), proving the nested server-side call still works. Had it broken, all 100%-off coupons would have stopped working in production.

**🔴 E2 — Player-count self-attestation: the payer controlled their own price.**

`get_tournament_pro_price` and `get_tournament_access_state` both counted `players` live, and `players` is client-writable by the tournament owner under `org_players_access`.

```
BEFORE: 1119 players = Rs1000 → deleted 620 → 499 players = Rs500
        294 players full_access=f → deleted 150 → 144 players full_access=t
AFTER:  1119 players = Rs1000 → deleted 620 → still 1119 = Rs1000
        294 full_access=f → deleted 150 → still 294 full_access=f
        direct UPDATE on the watermark → 42501
```

The durable attack was tier downgrade: delete players, pay the lower tier, receive a **365-day** entitlement that nothing re-checks, then re-import. **This is the one that made the reordering necessary** — F2 would have auto-approved it, because the payment amount matches the price the system itself calculated. No named flag in the D28 allow-list can detect it.

Fixed by `20260814160000` (Option A, high-water mark). Backfilled to today's counts: **zero price movement across all 109 tournaments at migration time**, no entitlement touched. Verified that growth still bills correctly — adding 226 players moved 294 → 520 and ₹500 → ₹1000, and deleting those same players **left it at ₹1000**.

**🟠 E3 — `publish_tournament` had no ownership check.**

SECURITY DEFINER, EXECUTE held by anon, and it never checked `owner_id` or `has_role`. `unpublish_tournament` checked both — the asymmetry is what made it look intentional.

```
BEFORE: caller=753b536b victim_owner=6b6a521c
        publish=[PUBLISHED slug=pwned-by-753b536b v2]  unpublish=[not authorized]
AFTER:  stranger=[not authorized] · owner=[OK v1] · master-on-behalf=[OK v2] · anon=[42501]
```

Impact: private drafts forced public (readable via the anon-executable `get_public_tournament_results`), slug squatting against globally-unique active slugs, unbounded version churn. Fixed by `20260814140000`. **Master carve-out retained by explicit decision** so support can publish for a stuck organizer.

### Dead grants removed (step 4)

`20260814180000` removed write grants from eight tables that had RLS on with **zero write policies** — grants that were already unusable, so removal was a provable no-op in behaviour rather than a change needing a HAR capture. If any code path had depended on them it would already have been broken in production.

- **Fully dead:** `extraction_schemas`, `payment_notification_outbox`, `referrals`, `referral_codes`, `referral_rewards`, `welcome_onboarding_rewards`
- **`extractions`:** INSERT/DELETE removed; **UPDATE untouched** — the F0a/D29 column grants on `payload`/`status`/`updated_at` are load-bearing for `BrochureReview.tsx`
- **`extraction_documents`:** DELETE removed for both roles, INSERT removed for `anon`; **authenticated INSERT retained** for `BrochureImportDialog.tsx` and `TournamentUpgrade.tsx`

`SELECT` was not touched anywhere. Live paths re-verified after the revoke: upload insert **OK**, review edit **OK**, document delete `42501`, extractions insert `42501`, referral_codes insert `42501`.

### Checked and clean — recorded so the negatives are on the record

- `coupons`, `coupon_redemptions`, `tournament_entitlements` — hold client write grants, fully closed by master-only RLS. Control-tested: `42501` on both INSERT attempts as a non-master.
- `admin_create_coupon` — holds anon EXECUTE but checks `has_role(...,'master')` internally. Safe, **and currently unused** — the admin UI writes the `coupons` table directly instead.
- `bootstrap_master` — holds anon EXECUTE; requires allowlist membership *and* zero existing masters. Dead, because a master exists.
- `apply_referral_code` — self-referral blocked, requires `email_confirmed_at`, constrained to a ±300s window around signup. Tight.
- `rule_config` — owner-or-master scoped ALL policy; client writes it via `CopyFromTournamentDialog.tsx` and `AdminTournaments.tsx`. **Allocation-adjacent (guardrail 1) — audited, reported, no change proposed or made.**
- `user_roles` — INSERT limited to own `organizer` row with `is_verified = false`; UPDATE/DELETE master-only; `allowlist_bootstrap_master` is dead code. Self-verification is not reachable. **M1 — audited, reported, untouched.**

### Data-integrity note

Payment history was checked for prior exploitation of E2. One tournament (`03dc398e`, 1119 players) carries an approved ₹500 payment from 6 Aug, which is the ₹500 tier rather than ₹1000. **Tushar confirmed this was his own testing** on his own test account `753b536b`. No other payment shows the pattern. `referral_rewards` had 0 rows, so E1 was never exploited.

### Session verification at close

`tsc` 12 errors (baseline) · vitest **474 passed / 3 known failures** · SQL harness **17/17, byte-identical to the F1 baseline** — cases N/O/P/Q run through `submit_tournament_payment_claim` and therefore through the changed pricing function.

---

## 11. Immediate next step

**Status as of 14 Aug 2026:** the client write-grant audit is complete. Three live, proven exploits closed; dead grants removed; `extract` v45, schema v3, **474 tests / 3 known failures**, tsc 12, harness 17/17, merged to `main` at **`3434db9`**, working tree clean.

**F2 (conditional auto-approval) is now UNBLOCKED and is the next workstream. Fresh chat.**

Three things must be resolved during F2 design, all already analysed:

1. **Gate on named flag reasons, never flag count** (D28). Allow-list: `utr_format`, `utr_duplicate`, `amount_mismatch`, `payee_vpa_mismatch`, `payee_vpa_missing`, `date_stale`, `direction_not_outgoing`, `required_fields_missing`. Cosmetic `ungrounded` flags stay visible in `/admin/payments` but must not block.
2. **Decline messages are a fraud oracle.** Naming which invariant failed lets an attacker iterate. Generic message to the organizer, itemised reasons in `/admin/payments` only.
3. **`file_hash` duplicate-screenshot invariant** — nothing checks it today.

Plus: `auto_upi` needs the `source` CHECK on `tournament_entitlements` widened, mirroring how `manual_upi` was added.

**New F2 precondition surfaced by the audit:** `extraction_documents` INSERT remains open to `authenticated` (necessarily — it is the upload path). A client can therefore fabricate a document row including `ocr_text` and `file_hash`. **It does not chain today** — there is no INSERT policy on `extractions` and no UPDATE policy on `extraction_documents`, so a fabricated document cannot acquire an extraction row. But F2's `file_hash` invariant would be reading a client-insertable column, and its uniqueness scope must be designed with that in mind.

**Opening line for the next chat:**

> *Continue the Prize Manager project. Read PROJECT_STATE.md §10 and §11. The client write-grant audit is complete and production-verified — it was deliberately run BEFORE F2, reversing the order in the older docs, and it found three live exploits (unbounded referral coupons, player-count price self-attestation, unauthenticated publish) which are all closed and proven closed. Guardrails S1–S8 now apply. extract v45, schema v3, 474 tests / 3 known failures, tsc 12, harness 17/17, main at `3434db9`, working tree clean. Starting F2 (conditional auto-approval). Before any code, audit the live DB and `extract/paymentTrustCheck.ts` and report: exactly which flag reasons `extract` emits today and at what severity, how `status` is currently forced to `needs_review` for `payment_screenshot`, what the `source` CHECK on `tournament_entitlements` permits, and whether anything reads `file_hash`. Do not propose a design until that audit is on the table.*

---

## 12. Backlog — carried forward, NOT forgotten

### B1 — `coupons` admin hardening (was audit step 5) · MEDIUM, defence-in-depth

**Not currently exploitable.** `coupons`, `coupon_redemptions` and `tournament_entitlements` hold client write grants but are fully closed by master-only RLS — control-tested `42501` as a non-master. This is about removing a surface that is one careless policy edit from being live, not about closing an open wound.

**Deferred deliberately:** it is the only remaining item requiring a frontend change and a Lovable publish, which is a different failure mode from the four clean database migrations of 14 Aug, and guardrail 6 caps a session at 3–4 deploy cycles.

**The ordering is the decision (D36 pattern) — never revoke before the write path exists:**

1. **Additive:** add `admin_update_coupon(...)` RPC, master-checked internally. Note `admin_create_coupon` **already exists and is unused** — the create half is already built.
2. **Frontend:** switch `src/hooks/useCouponsAdmin.ts` from direct `.from('coupons').insert/.update` to the two RPCs.
3. **Verify:** production HAR capture proving a full admin coupon session issues **zero** PATCH/POST to `/rest/v1/coupons`. This step is mandatory here — unlike step 4's dead grants, these writes genuinely work today.
4. **Restrictive:** revoke INSERT/UPDATE/DELETE from `anon` and `authenticated` on all three tables; consider dropping the write policies too so they fail closed even if grants were restored (per D29/D36, both layers close together).

### B2 — `master_allowlist` dead grants · LOW, blocked on M1

Holds full client write grants with **zero write policies**, so it is closed today — identical shape to the eight tables cleared in step 4. **Deliberately excluded from `20260814180000`** because it sits on the master/admin role-resolution path. Requires an explicit M1 exception from Tushar before the revoke runs. One-line migration when cleared.

### B3 — Watermark UI for the master reset · LOW

`master_reset_player_watermark(uuid)` exists and is verified working (520 → 294 in test), but has no UI. Today it can only be called via SQL. Add a control on `/admin/tournaments` when that page is next touched, so a bad import can be corrected without a console.

---

## 13–16. Phase 2B / 2C-D / 3 / 4 — unchanged

Phase 2B (bank statement reconciliation) blocked on 2A-3. Phase 2C-D (REST API + MCP) blocked on 2B. See PHASE2_PRD.md.

---

## 17. Tracked debt

| Item | Priority | Detail |
|---|---|---|
| ~~`extractions` UPDATE policy too broad~~ | ✅ RESOLVED | F0a |
| ~~Three fail-open trust invariants~~ | ✅ RESOLVED | F0c |
| ~~UTR-match + duplicate hard-block~~ | ✅ RESOLVED | F0d Migration B |
| ~~`tournament_payments` client write grants~~ | ✅ RESOLVED | F0d Migration A |
| ~~Dead `dark:` variants / raw palette utilities~~ | ✅ RESOLVED | UI batches 1–2c |
| ~~`normalize_utr` parity~~ | ✅ RESOLVED | `utr_active_duplicate_exists` |
| ~~F0d test suite / no UI guard test~~ | ✅ RESOLVED | 21 vitest cases + SQL harness + `ui-conventions.spec.ts` |
| ~~`profiles` client-writable at column level~~ | ✅ RESOLVED | F1-A2 `20260812141500` |
| ~~Reward-flag reset → unbounded free Pro coupons~~ | ✅ RESOLVED | Same migration |
| ~~Harness depends on live profile phone state~~ | ✅ RESOLVED | Seeds its own fixtures |
| ~~Stale generated types~~ | ✅ RESOLVED | Regenerated 12–13 Aug (see R7) |
| ~~33 tables retain client write grants~~ | ✅ RESOLVED | Audit 14 Aug. Real number was 26. Three exploits found and closed; 8 tables' dead grants removed. See §10 |
| ~~`issue_referral_rewards` unbounded coupon minting~~ | ✅ RESOLVED | `20260814120000` |
| ~~Player-count price self-attestation~~ | ✅ RESOLVED | `20260814160000` |
| ~~`publish_tournament` no ownership check~~ | ✅ RESOLVED | `20260814140000` |
| **`coupons` admin writes the table directly** | MEDIUM — B1 | Not exploitable (master-only RLS, control-tested). Needs RPC + frontend + HAR before revoke |
| **`master_allowlist` dead grants** | LOW — B2 | Closed by RLS; revoke blocked on M1 exception |
| **Auto-approve gate must use named flag reasons** | **HIGH — F2** | See D28 |
| **F2 decline messages are a fraud oracle** | **HIGH — F2 design** | Generic to organizer, itemised in `/admin/payments` only |
| **No duplicate-screenshot (`file_hash`) invariant** | MEDIUM — F2 | Note `file_hash` is client-insertable via the upload path; design the uniqueness scope accordingly |
| **Gate / helper drift risk** | MEDIUM | `my_payment_gate_status()` vs the RPC gate (R4). Now joined by a second instance of the same shape: price vs access-state billing basis (S5). Nothing tests either helper side |
| **No watermark UI** | LOW — B3 | `master_reset_player_watermark` is SQL-only today |
| `as never` RPC casts in `TournamentUpgrade.tsx` | LOW | Casts could be dropped when the file is next touched |
| **Advisory duplicate check fails open** | Accepted residual | Bounded by the hard block + unique index (Q6) |
| `import.meta.url` vs `process.cwd()` inconsistency | LOW | Harmonise when either file is next touched |
| 122 `extraction_documents` rows with `uploaded_by` NULL | LOW | Legacy (≤20 Jul). Fail-closed under the F0d ownership gate |
| **Consistent-but-wrong UTR** | Accepted residual | Only Phase 2B closes this |
| **UTR-only valve** | Accepted residual | No screenshot = no mismatch check by construction. Safe under F2 |
| `MAX_ATTEMPTS=5` with no backoff | MEDIUM | Brief Resend outage permanently loses a notification |
| `CLAUDE.md` schema drift | MEDIUM | Says v3 active; actual is v5. Missing AuthProvider, `db query --linked`, tsc correction, N1 hygiene, UI conventions, R1–R7, and now S1–S8 |
| **PRD / ARCHITECTURE carry the old ordering** | MEDIUM | Both still say the grant audit follows F2. It preceded it. Correct at next revision of those two docs |
| `/admin/team-snapshots` broken | MEDIUM | RPC `detect_missing_team_snapshots` 404; page calls `is_master(uuid)` but DB function is `is_master()` |
| `brew unlink node` fragile | MEDIUM | Any `brew upgrade` re-shadows v22 → 9 test failures |
| `tsconfig.app.json` scope gap | MEDIUM | Covers `src/` only |
| Direction marker regexes lack `\b` anchors | LOW | Bounded by D27 |
| Stale v2 tests reference `direction_label` | LOW | Pass but mislead |
| `app`/`status_text` grounding nondeterministic | LOW | Cosmetic; excluded from F2 gate per D28 |
| Repo is public | LOW — noted | Verified no secrets committed |
| Two parallel session paths | LOW | 16 call sites read token via `supabase.auth.getSession()` directly |
| `platform_feature_flags` RLS | LOW | Enabled with zero policies; read via SECURITY DEFINER RPC only |
| Payment unit tests assert literals | LOW | Tests 7–10 assert arithmetic rather than calling `paymentTrustCheck.ts` |
| Merge commit `7dca9fb` has a malformed message | COSMETIC | `core.editor "true"` baked the comment block into the subject. Left alone — amending means force-pushing a public `main` that Lovable syncs. `core.editor` has since been unset; use `git merge --no-ff -m "..."` always |

---

## 18. How to start each new chat

**One chat per workstream.** At every phase boundary: Claude gives an updated `PROJECT_STATE.md` → delete the old one in the Project knowledge panel → upload the new one → open a fresh chat → paste the opening line.

**Working rules that do not change:**
- Always `/clear` in Claude Code before a new prompt — **and verify it took.**
- **First command in any new Terminal window is `cd ~/Desktop/prize-manager`.**
- Edge-function changes need `supabase functions deploy <name>` — Lovable publish ships frontend only (P5).
- **Publishing is a separate step from merging.** A database-only migration is live the moment `supabase db query` runs; publishing changes nothing and proves nothing about it.
- Use `git --no-pager diff`, never plain `git diff`.
- **Always merge with `git merge --no-ff -m "message" <branch>`.** Never rely on the editor. `core.editor` is unset again as of 14 Aug.
- Paste terminal output as **text**, never screenshots.
- Claude (chat) verifies every Claude Code / Lovable claim against Supabase SQL before advancing.
- Full `git diff` text is required in every build report.
- `npx tsc -p tsconfig.app.json --noEmit`; verify the 12-error baseline by stashing, not by assuming.
- Before starting a branch: `git status` must be clean.
- Migration workflow: `supabase db query --linked -f <file>` then `supabase migration repair --status applied <version>`. `supabase db execute` does not exist.
- **`RAISE NOTICE` is swallowed** by both `supabase db query --linked` and Supabase MCP `execute_sql`. Silence is the success signal; put failures in `RAISE EXCEPTION` and verify separately with a query.
- **Every migration must self-verify and fail loudly.** Each of the four audit migrations ended in a `DO $$ … RAISE EXCEPTION $$` block asserting both that the fix landed *and* that the live paths survived. The exit code alone proves nothing (N1).
- **Prove the fix with the same test that proved the hole.** Every audit fix was verified by re-running the exact exploit and expecting a permission error, plus a positive control proving the legitimate path still works.
- When touching allocation-adjacent files, take a SHA-256 baseline of `supabase/functions/` first and diff it afterwards.
- **Never redirect a generator onto a tracked file (R7).** Temp file → verify → `cp`.
- Additive migration → verify → frontend → verify → restrictive migration. Never the reverse.
