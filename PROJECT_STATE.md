# PROJECT_STATE — Prize Manager · Universal Extraction Engine
**Last updated:** 14 September 2026 · **Owner:** Tushar · **This file is the single source of truth for continuing work in any new chat.**

Replace the previous PROJECT_STATE.md in the repo with this file. Paste it at the start of every new chat to re-establish context.

---

## 1. What this project is

**Prize Manager** (prize-manager.com) is a chess tournament management platform. Phase 1 built a brochure extraction engine: organizer uploads a PDF brochure → two-pass Gemini OCR + structured extraction + deterministic trust/grounding layer → review screen → on Approve, a tournament is created with categories and prizes.

**Why it exists, from the Phase 1 documents.** `docs/extraction-engine/PRD.md` calls Prize Manager the *"first face of the Universal Extraction Engine"*; `ARCHITECTURE.md` opens with **"One engine, many faces."** Two faces run in production (`chess_brochure`, `payment_screenshot`) and the generality bet held: Phase 2A added payment screenshots with a new schema row and new invariants, not a new pipeline.

**Three-platform context:**
- **prize-manager.com** — Tournament prize management (live, takes UPI money). Through 14 Sep: Phase 2A/2A-2/2A-3, conditional auto-approval (20 Aug), F3 oversight (28 Aug), Resend SMTP (29 Aug), G1/G2/G3, B22, B18-a/b (5 Sep), **TC0** (6 Sep), **TC1** (6–7 Sep), **ground-truth validation 96/100** (8 Sep), **GTM public pages** (8–9 Sep), **coupon system repair** (9–10 Sep).
- **certificate-hub.com** — Certificate creation. **Paywall NOT live.** Will consume the engine via REST API (Phase 2C).
- **sportup.online** — Discovery + registration. Organisers collect entry fees directly; the platform takes no cut. **Carries one live exposure, `/debug/auth` (SP-1).**

**GTM status.** Demonstrated to FIDE arbiters at a seminar on 13 September. It landed well. The product is now being shown to people who want to use it, not built toward a date.

---

## 2. Key identifiers

| Item | Value |
|---|---|
| Supabase project | `nvjjifnzwrueutbirpde` (ap-south-1, Postgres 17.6). Org is on the **FREE** plan |
| Repo | github.com/tushar1669/prize-manager (**public**) · `main` at **`766faad`** · `4b57f68` profile reward auto-issue · `705e1bb` coupon origin fix · `5779d14` GTM pages · `fc62a60` TC1.6. **`PROJECT_STATE.md` lives at the repo root only** |
| **Deploy model (DD6)** | **`git push` to `main` deploys BOTH edge functions and the frontend.** No CLI deploy step, no Lovable publish gate. **There is no review gate between commit and production — review before the push, not after** |
| **Edge function versions are not evidence** | Every push redeploys everything, so recorded version numbers go stale within a day. The only reliable check is a function's own build string via `?ping=1` (Y3, DD6). `allocateInstitutionPrizes` carries `BUILD_VERSION = "2026-09-07T09:00:00Z-TC1.5"` |
| **`verify_jwt=false` is THREE functions** | `send-payment-notifications`, `pmPing`, `publicTeamPrizes` |
| **Free-plan log retention** | **1 day.** Edge-function logs older than ~24h are gone |
| Active extraction schema | v5 (chess_brochure), v3 (payment_screenshot, id `4e8beb4d-4a07-4ef8-a774-18b22f722522`) |
| Gemini model | `GEMINI_MODEL` = `gemini-3.1-flash-lite` |
| Local paths | repo `~/Desktop/prize-manager`, test PDFs `~/Desktop/prize-manager/test-brochures/` (local only, not in repo) |
| Payment trust invariants | 8 in `extract/paymentTrustCheck.ts` · returns `{flags, verdicts}` |
| **F2 kill switch** | `platform_feature_flags` — `key='payment_auto_approve'`, enabled since 2026-08-20. RLS on, zero policies. Off: `supabase/ops/f2_auto_approve_off.sql` |
| **`public.referrals` triggers** | **ZERO, by design, since `20260822120000`.** Do not re-add one — W1 |
| **Test baseline** | **534 passing / 3 known failures of 537** (conflict-utils ×2, martech-metrics ×1) |
| **Unconfirmed flake** | A fourth failure was seen once on an unchanged tree, never reproduced across four later runs, unnamed in the summary. Tier 3, not a known failure |
| TypeScript check | `npx tsc -p tsconfig.app.json --noEmit` — **12 errors in 6 files**: `PendingPaymentsPanel` 5 · `TournamentUpgrade` 2 · `BrochureImportDialog` 2 · `BrochureReview` 1 · `AdminPayments` 1 · `useAuth` 1. Root `npx tsc --noEmit` and `npm run typecheck` check **nothing** |
| **tsc exits non-zero, so never chain it** | `npx tsc … && npx vitest run` silently SKIPS vitest. Use `;` or separate commands |
| pg_cron jobs | jobid 1 `expire-stuck-extraction-documents` (*/10); jobid 2 `drain-payment-notifications` (*/2) |
| **Verification harnesses** | **9.** `f2_gate_checks` 24/24 · `f3_audit_checks` 33/33 · `f3c_read_checks` 13/13 · `f0d_rpc_checks` 17/17 · `pf1b_expected_amount` 9/9 · `g1_publish_state_checks` 16/16 · `b22_publish_gate_checks` 14/14 · `b18_version_pin_checks` 16/16 · `tc0_team_version_checks` 12/12. **TC1 added none** |
| **Backlog sweeps** | `supabase/ops/backlog_sweep.sql` (24 checks) · `scripts/backlog_sweep_repo.sh` (11 checks + tsc). **Run both before planning anything.** Last reading: DB **12 OPEN / 11 CLOSED / 1 INFO**, repo **7 OPEN / 4 CLOSED** |
| Design doc | `docs/design/UI_CONVENTIONS.md` — dark-only, enforced by `tests/ui-conventions.spec.ts` |
| **Legal entity** | **DERA Tech.** In the site footer. Incorporation status and CIN still unconfirmed — SOW item 1 |
| Platform payee VPA | `9559161414-5@ybl` — hardcoded as `UPI_ID` in `TournamentUpgrade.tsx` **and** held as `PLATFORM_PAYEE_VPA` |
| Grievance Officer | Tushar Saraswat · chess.tushar@gmail.com · Saraswat House, Bhitari, Hatiyanveer Baba Colony, Maheshpur, Varanasi, Uttar Pradesh 221107 |

### Public routes

| Route | Component | Shows |
|---|---|---|
| `/public` | `PublicHome` | **Landing target for prize-manager.com.** Results directory + a one-line signpost to `/how-it-works` |
| `/p/:slug` | `PublicTournamentDetails` | Details + individual winners. **No team prizes** |
| `/p/:slug/results` | `PublicResults` | **The ONLY page showing team prizes** |
| `/t/:id/public` | `LegacyPublicRouteCompat` → `PublicWinnersPage` | Redirects when a slug exists |
| `/how-it-works` `/pricing` `/about` `/faq` `/contact` | GTM pages, shipped 9 Sep | Real content |
| `/terms` `/privacy` `/refund` | Placeholder notices, **noindex** | "Being finalised with counsel" |

`SiteFooter` renders on every public page. `PublicHeader` carries nav plus a mobile sheet menu.

### Publish path

| Item | Value |
|---|---|
| **Frontend entry** | `Finalize.tsx` → `handlePublish` → `functions.invoke('finalize')` → `rpc('publish_tournament', …)` |
| `publish_tournament(uuid, text)` | One overload. `tournament_id uuid, requested_slug text DEFAULT NULL` — the DEFAULT is load-bearing (`42P13`). Enforces the B22 title gate. Records `allocation_version` |
| **`publications.allocation_version`** | The allocation version this publication displays. NULL = published before any allocations existed (Option C) |
| **`publications.version`** | **A PUBLISH COUNTER, not a results version.** Disagrees with `allocation_version` on 24 of 35. Never join to it |
| `get_public_tournament_results(uuid)` | SECURITY DEFINER, language `sql`. Reads the pin. **NO `MAX()` FALLBACK** |
| **`publications` write surface** | `anon` AND `authenticated` hold full DML. **Do not describe published results as "immutable"** |

### Team engine — DD1 boundary

| Object | Role |
|---|---|
| `_shared/teamPrizes.ts` | `computeTeamScoresWithReasons` is the real implementation; `computeTeamScores` is a thin wrapper returning `.scored`. **Gender-slot aware since TC1.4** |
| `allocateInstitutionPrizes` | Read-only compute/preview. Emits real `ineligible_details`, `players_without_group_field`, `players_without_points` |
| `finalize` | **Primary writer of `team_allocations`.** Owner ruling: leave untouched |
| `backfillTeamAllocations` | Master-only repair, resolves from `allocation_version` |
| `publicTeamPrizes` | Public reader, pinned, **no compute path** |
| Tables | `institution_prize_groups`, `institution_prizes`, `team_allocations`, `team_allocation_notes` |

### Coupon system — repaired 9–10 September

| Origin | Code prefix | Trigger | Status |
|---|---|---|---|
| `welcome` | `WELCOME-` | Signup, self-issued | ✅ 32 issued |
| `profile_reward` | `PROFILE-` | **Auto-issued on any save where the profile is complete and unclaimed** | ✅ since 10 Sep |
| `referral_l1/l2/l3` | `REF1/2/3-` | Referral chain | ✅ |
| `admin` | various | Hand-issued | 9 |

`coupons.origin` now carries a **CHECK constraint** (`is not null and origin in (…)`) so a wrong value cannot sit unnoticed. `coupon_origin_from_code` maps the prefix; `CouponTable.tsx` mirrors it in TypeScript and the two agree.

### Email infrastructure

Custom SMTP via Resend. `smtp.resend.com:465`, sender `noreply@prize-manager.com`. Edge-function sender `WELCOME_EMAIL_FROM` = `hello@prize-manager.com`. **Edge-function secrets are runtime env vars — rotating one needs no redeploy.**

### Migrations (all applied, repaired, version-matched)

`20260817120000`–`20260817160000` F2 · `20260822120000` drop dead referrals trigger · `20260827120000`/`130000` F3-A/B · `20260828120000`/`130000` F3-C0/C0b · `20260829120000` SEC · `20260902120000` G1 · `20260904120000` B22 · `20260905120000` B18-a · `20260905130000` TC0 · **`20260909120000` coupon origin fix** · **`20260909130000` profile reward auto-issue**.

**Recorded as applied but NEVER RUN:** `20251201090000_add_category_type_to_categories.sql`. The column does not exist in production. The engine reads `criteria_json.category_type` and is unaffected. A false-applied ledger entry — the inverse of D40.

---

## 3. Non-negotiable guardrails

**Phase 1:**
1. **NEVER touch the main allocation engine** — see **DD1**.
2. `criteria_json` committed as always `'{}'`.
3. Never weaken grounding or arithmetic. Never weaken checks to force a pass.
4. Client never writes production tables; only `commit-extraction` does, on explicit Approve.
5. No paid services, no new dependencies without justification.
6. Sequential phases, one prompt at a time, max 3–4 deploy cycles then stop and report.
7. Builder/auditor split: Claude Code builds; Claude (chat) verifies via Supabase SQL before advancing.

**Phase 2A:** 8. Auto-approval is CONDITIONAL, gated on **named invariant verdicts** (D28); **`skipped` is not `pass`** (D39). 9. NEVER use `commit-extraction` for payment data. 10. NEVER modify `review_tournament_payment`'s entitlement-insert logic. 11. Screenshot upload is OPTIONAL; **no screenshot can never auto-approve**. 12. NEVER expose the kill switch in frontend code or logs.

**Phase 2B:** 13. Bank statements are `privacy_class='sensitive'`. NEVER through Gemini. pdfplumber only.

**Legal:** 14. **No model drafts legal copy.** Terms, Privacy and Refund text comes from counsel and is transcribed verbatim. Transcription is permitted; drafting, summarising, paraphrasing and "improving" are not.

**Other blocks unchanged, see prior PROJECT_STATE:** M1–M5 · N1–N5 · P1–P6 · Q1–Q7 · U1–U5 · R1–R7 · S1–S8 · T1–T6 · V1–V8 · W1–W4 · X1–X9 · Y1–Y5 · Z1–Z4 · AA1–AA5 · BB1–BB5 · CC1–CC12 · DD1–DD6.

### DD1 — Team prizes are a separate engine (owner ruling, 6 Sep)

- **Main engine, never edited for team work:** `allocatePrizes`, `rule_config`, conflicts, player-to-prize matching, the `allocations` table, and the allocation engine's docs.
- **Team engine:** `_shared/teamPrizes.ts`, `allocateInstitutionPrizes`, `backfillTeamAllocations`, `publicTeamPrizes`, `resolve_team_tie`, the four institution tables.
- **`finalize` is the only seam. Owner ruling: leave it untouched.**

### DD2 — A fix can dissolve its own probe (6 Sep)
When a green check goes red immediately after a change you believe is correct, ask whether the check still measures what it claims before assuming a regression — and repair the probe, not the expectation.

### DD3 — A test file that imports nothing tests nothing (6 Sep)
Closed by TC1.2. Check the import list before counting a suite as coverage.

### DD4 — A fixture that starts at version 1 hides a counter mismatch (6 Sep)
When testing a comparison between two values, make the fixture's two values different.

### DD5 — A comment can claim a capability the code does not have (6 Sep)
**CLOSED 7 September by TC1.4–TC1.6**, end to end: engine, organizer display, print gating, PDF.

### DD6 — A git push deploys everything; there is no review gate (7 Sep)
Measured: `allocateInstitutionPrizes` answered `?ping=1` with the new build string before any CLI deploy; all eleven other edge functions moved +3 versions with no CLI deploy; `/admin/team-snapshots`'s build stamp read HEAD with no Lovable publish. **A `git push` IS a deploy.** Anything needing review must be reviewed before the push.

### DD7 — An aggregate can hide the answer (9 September)
Grouping coupons by `origin` alone showed 41 `admin` rows and produced the conclusion "there is no signup coupon." Adding one column — `created_by` — showed 32 of them were self-issued at signup and mislabelled. **The welcome coupon had worked all along.** When a query supports a surprising conclusion, add a dimension before believing it.

### DD8 — A placeholder scan is only as good as its pattern (14 September)
A regex requiring a letter after `[` reported CertificateHub's Terms as having two placeholders. It had three: `[**a fixed amount to be confirmed]` in Clause 16.1 was invisible to the pattern. **A scan that returns "complete" has to be tested against something it should catch.**

---

## 4–12.21. Phases 1 through 8 September — COMPLETE

See prior PROJECT_STATE for Phase 1, Phase 2A, Workstream C, Phase 2A-2, F0a–F0e, F1, E1–E3, PF1, **F2 (live 20 Aug)**, the **referrals repair**, **production validation**, **F3**, **Resend SMTP**, **F3-C2**, **B16**, **batch F1 + sweeps**, **G1/G2/G3/G3b**, **B22 + GTM1**, **§12.15 B18-a/B18-b**, **§12.16 TC0**, **§12.17 TC1**, **§12.18 census**, **§12.19 individual-engine gender investigation**, **§12.20 status**, **§12.21 ground-truth validation (96/100)**.

Governing decisions unchanged: **D38, D39, D40, D41, X1–X9, Y1, Z1–Z4, AA1–AA5, BB1–BB5, CC1–CC12, DD1–DD8**.

---

## 12.22 · 8–10 September 2026 — GTM pages and the coupon system repair

### GTM public pages (commits `5779d14`, `9d01b73`)

Seven new public routes, a `SiteFooter` on every public page, nav in `PublicHeader`, and a one-line signpost on `/public`.

**Owner ruling on the landing shape:** `/public` stays a results directory. No marketing hero. The reasoning was that nobody stumbles onto a niche B2B product — arrivals already know what they want. The signpost line catches the exception, which is seminar traffic.

`/terms`, `/privacy` and `/refund` render a factual notice only and are **noindex**. No model drafted any of it.

### Coupon system — three defects, all closed

1. **Origin mislabelling (`20260909120000`).** `coupon_origin_from_code` had no `WELCOME-` branch, so 32 welcome coupons were stamped `admin`. Fixed the mapping, backfilled 32 rows, added a `CHECK` constraint, corrected the TypeScript mirror in `CouponTable.tsx`. Verified by a live call returning `welcome` — behaviour, not a version number.
2. **Profile reward required a second click (`20260909130000`).** `update_my_profile` set `profile_completed_at` but issued nothing; only a separate button on `/account` minted the coupon. 5 profiles were complete, 2 had coupons. Now auto-issued on **any** save where the profile is complete and unclaimed — so the three waiting organisers get theirs by their own next action, with no retroactive grant by migration. Verified live: `PROFILE-0649F039` issued at 21:44 IST on a plain Save.
3. **The toast lied.** It reported the coupon off the `profile_completed_at` transition, so anyone past that transition was told only "Profile saved." Now driven by the server's `reward` key. Reads positively — only an explicit `ok && !already_claimed` claims a coupon — so the failure direction is under-promising.

**Drift captured:** the live `claim_profile_completion_reward` had been hotfixed directly (website check removed, lookup changed to `code ILIKE 'PROFILE-%'`) and never entered a migration. `20260909130000` captures it byte-exact, asserted by md5. **Building from the git copy would have reintroduced a gate on a field the UI stopped collecting.**

### Verification quality worth keeping

`20260909130000` shipped with **five negative controls**, each demonstrated to fail. One of them exposed a bad check — a harness message misattributing a real regression as "variables lost". **A green dry run proves nothing on its own.**

### Open, filed not fixed

- A coupon-insert failure now **blocks a profile save**, and profile completeness is the F1 payment gate. Blast radius is new users only. Follow-up: catch it, keep the save, record to `audit_events`.
- `resolveOrigin` in `CouponTable.tsx` is now dead code — the constraint forbids null origins.
- **`fide_arbiter_id` is mandatory** for profile completion. Column name is misleading: it holds a FIDE ID, which players and organisers have too, not an arbiter credential. Completion is 5 of 44.

---

## 12.23 · Legal documentation — status as of 14 September

Counsel (a friend, not charging; incorporation to follow) delivered a Scope of Work and six documents. **Nothing is published yet.**

| Site | Terms | Privacy | Refund |
|---|---|---|---|
| prize-manager.com | ✅ **ready** — all placeholders filled, `Terms.tsx` generated but **NOT YET INSTALLED** | ❌ 5 gaps | ❌ not supplied |
| certificate-hub.com | ❌ Clause 16.1 liability floor TBD | ✅ **ready** | ❌ not needed — no money taken |
| sportup.online | ❌ Clause 10 redraft + ₹500 into 18.1 | ❌ sub-processor list blocked on PostHog | ❌ not needed — no money taken |

**Resolved by owner:** entity **DERA Tech** · Grievance address (above) · Prize Manager change-notice **15 days** · SportUp liability floor **₹500** · SportUp PP timelines 15 days / 24 hours / 15 days · SportUp Platform Fee — **state that none is charged, reserving the right to introduce one on notice** · refund on prize-manager only, where failure to receive Pro is reported within 24 hours, processed within 15 days by manual UPI.

**Still with counsel:** the Privacy Notice and Refund Policy for prize-manager; CertificateHub's liability floor; SportUp's two Terms clauses; the CIN / registration number; **and whether children's names may remain on public results pages while this is finalised.**

**The children's-data question is the most consequential item in the engagement.** 10,479 of 15,700 player records are minors; **3,009 appear on published public pages** with name, age category and school.

### Sub-processor table — blocked on the analytics decision

Counsel scaffolded a table in the Prize Manager Privacy Policy and left every cell empty. Proposed content:

| Sub-processor | Purpose | Data | Location |
|---|---|---|---|
| Supabase | Hosting and database | All data stored by the Service | Mumbai, India (ap-south-1) |
| Resend | Transactional email | Organiser name and email | United States |
| Google (Gemini API) | AI-assisted document processing | Brochure content only — no Player Data, no payment data | United States |
| PostHog | Analytics and error tracking | *to be added when installed* | — |

**Open question for counsel: does Lovable belong in this table?** It has repository write access and deploys the frontend.

### Clause 8.5 — anti-scraping, what is already true

Measured 14 Sep: `anon` **cannot** read `dob`, `dob_raw`, `disability` or `special_notes` on `players` — column-level grants are already in place. Public access is gated on `tournaments.is_published`. Still anon-readable: name, club, city, state, `type_label` (encodes U08–U16), rating, points, rank, gender, `fide_id`. No rate limiting exists.

---

## 13. Immediate next step

**AICF ID as an optional organiser profile field.** New chat, Opus.

`update_my_profile` is a SECURITY DEFINER RPC the **F1 payment gate depends on**, so a signature change is money-path work. **AICF ID must NOT join the completeness check** — completion is 5 of 44 and gates payment.

### Then, strictly sequentially — each in its own chat

**The order is forced by a dependency chain:** PostHog sets non-essential cookies → Privacy Clause 16.2 promises a consent mechanism → the banner must exist before PostHog goes live → PostHog must appear in the sub-processor table → the table cannot go to counsel until the tools are decided → the Privacy Policy cannot publish until the table is filled.

1. **AICF ID** — Opus. Migration + UI.
2. **Cookie consent + PostHog** — Sonnet. Consent banner first, then PostHog by snippet (not npm, guardrail 5), analytics **and** error tracking, billing limit set on day one.
3. **Anti-scraping hardening** — Opus. `robots.txt`, and review whether `gender` and `fide_id` need to be anon-readable. Touches published-results read paths.
4. **Legal completion** — return to the chat titled *"Prize Manager TC1 gender slots implementation"*. Install prize-manager's Terms, fill the sub-processor table, send counsel the remaining items, publish everything together.

**Tool decision, made 14 Sep: PostHog for both analytics and error tracking. Not Sentry.** PostHog free gives 100,000 exceptions a month against Sentry's 5,000, unlimited team members against Sentry's one user, per-product billing limits, and — decisively — **one sub-processor instead of two**, meaning one privacy entry, one consent mechanism, one snippet. PostHog free is **1 project**; use one project with a `site` property, or pay-as-you-go ($0 base, 6 projects) with a low billing limit.

**PostHog's three standing conditions still apply:** install after the privacy work, load by snippet not npm, and do not replace `audit_events` or the martech dashboards.

### Then TC2 / TC3

**Led by the institution-import gap.** The team engine groups only on fields that come from the Swiss Manager export, which never carries school names — so Best School cannot be computed at real events. An import path for institution data is required first.

**Operational hold:** do not open `/t/8d1fbd83-…/finalize`. Auto-finalize fires on page load and creates junk allocation versions. Harmless to public pages since B18 + TC0.

---

## 14. Backlog — the GTM gate

**The bar:** does it make a public statement false, produce wrong participant-facing output, or embarrass us at a championship.

### Tier 1 — CLEAR

| Item | Status |
|---|---|
| X1–X4-exposure · GTM1 · B22 · sportup claims | ✅ 2–4 Sep |
| B18-a / B18-b | ✅ 5 Sep |
| B21 / TC0 | ✅ 6 Sep |
| TC1 / DD5 | ✅ 6–7 Sep |
| Ground-truth validation, 96/100 | ✅ 8 Sep |
| GTM pages, footer, nav | ✅ 9 Sep |
| Coupon system, all three defects | ✅ 10 Sep |

**Still Tier 1:** **SP-1** `/debug/auth` ungated on sportup.online — own chat, different repo · **SP-2…SP-7** sportup's contradictory refund policies, advertised card/net-banking payments it does not process, garbled Privacy line · **PM-1** legal pages not yet published while taking UPI money.

### Tier 2

- **Validate entered prize amounts against the extracted brochure table** — a ₹4 entry error moved two placings in the Jaipur check and nothing flagged it. Highest-value fix outstanding.
- **Populate `rule_config.category_priority_order`** — empty on every tournament, so equal-value ties resolve by implicit fallback.
- **Institution-import gap** — leads TC2/TC3.
- **Coupon-insert failure blocks a profile save** — catch, keep the save, record to `audit_events`.
- **`fide_arbiter_id` mandatory** — decide whether it stays required.
- **Truncated player name** — `0d54de9f`, Unrated #10 stored as `T`; actual player Tavish Singh Rathore, rank 170.
- **`generatePdf` live-compute fallback** (`index.ts:155-169`) — the defect TC0-d removed from `publicTeamPrizes`, still present here.
- **Migration `20251201090000` false-applied** — recorded applied, column absent.
- **RULING 3 — per-group `minimum_roster_size`** — decided 7 Sep, not built. No `tc1_` harness exists.
- **Girls-only prize that can never be awarded** — `8265c82a`, zero gender data on 150 players, unpublished. Warn at finalize when a category's rule can match no player.
- **G4** required details before publish · **B7** drift migration, now **ten** untracked functions · **B18-c** `ON DELETE CASCADE` into published history · **B22 slug-change UI** · column-level UPDATE on `tournaments`/`publications` · **B13 batch B/C, #9, #7** · **B17 + B8b** · **B5** audit cadence · **B19** · **B18-3**.
- **Sweep check B7a can never read CLOSED** — it measures "does `is_master(uuid)` exist"; TC0 removed the dependency instead. Needs rewriting (CC4).

### Tier 3

3 known test failures, probably one timezone bug · the unconfirmed fourth flake · `resolveOrigin` dead code · no test covers `ColumnFilter` or the B18 selector modes · `PublicWinnersPage` "0 Winners" badge on the pin error path · `401` on `/rest/v1/players` capability probe · B1 · Y2 · B10 · B12 · B14 · B15 · B2 · B3 · B6 · Playwright layout test · `CLAUDE.md` drift · `MAX_ATTEMPTS=5` no backoff · `tsconfig.app.json` scope gap.

---

## 15. Cross-property GTM inventory

**prize-manager.com** — GTM pages live. Legal pages are placeholders pending counsel. Takes UPI money.

**certificate-hub.com** — Terms and Privacy exist in draft. **Paywall not live**, so no money statements and no refund policy needed. Missing: sitemap, About/FAQ/Pricing.

**sportup.online** — SP-1…SP-7 outstanding. Privacy dated October 2023 while Terms says 3 Sep 2026; Terms footer "© 2023"; WhatsApp link with no number bound; no sitemap. **Takes no money** — organisers collect entry fees directly.

**Do NOT have any model draft the legal copy.** sportup's Terms already had to be corrected for naming Stripe/PayPal on a UPI product, and the garbled *"We use manual payment for payment processing"* line is the visible scar.

### GTM positioning — the Jaipur ground-truth result

- **Permitted:** "matched the official list on 96 of 100 placements on a real 100-prize open."
- **NEVER** "96% accurate" — one tournament, not a rate.
- **NEVER** name the event, the arbiter or any player. The Chief Arbiter is named on that prize list and the audience is his professional peers.
- **NEVER** frame it as finding an arbiter's mistake.
- The positioning is **defensibility, not accuracy**: *"it doesn't replace the arbiter's judgement, it makes the judgement visible and writes it down."*
- **The offer that converts:** a free replay of an organiser's own past tournament from their Swiss Manager file and prize list.

---

## 16. Ordering

**AICF ID** → **cookie consent + PostHog** → **anti-scraping hardening** → **legal completion** → SP-1 (own chat, different repo) → sportup SP-2…SP-7 → sitemaps → G4 → Tier 2 → Phase 2B → TC2 → TC3.

certificate-hub.com engine integration parked by owner decision 2 Sep.

---

## 17. Phase 2B / 2C-D / 3 / 4 — unchanged

Phase 2B bank reconciliation (pdfplumber only, never Gemini). Phase 2C–D REST API + MCP server.

---

## 18. Tracked debt

Superseded by §14's three-tier gate. The sweeps are the canonical *measurement*. Where this document and a sweep disagree, **the sweep wins and the document gets corrected** (BB1).

---

## 19. How to start each new chat

**One chat per workstream.** At every phase boundary: Claude gives an updated `PROJECT_STATE.md` → delete the old one in the Project knowledge panel → upload the new one → open a fresh chat → paste the opening line.

**Division of labour:** design, schema audit and independent verification belong in **chat**; write-run-fix loops on SQL and TypeScript belong in **Claude Code**.

### Starting a Claude Code session

```
cd ~/Desktop/prize-manager
headroom proxy --budget 10 --budget-period daily
headroom wrap claude --code-memory none
```

Then `/clear`, **verify it took**, and paste the prompt. Ponytail runs automatically — if it reports anything about a run, paste it; it is another independent signal alongside the diff and the harness.

`--code-memory none` is why every prompt states its verified facts with file and line: nothing should be re-derived from memory.

### Model selection

- **Opus** — migrations, anything touching money or the F1 payment gate, schema changes, design decisions with real uncertainty.
- **Sonnet** — frontend edits, transcription, test writing, mechanical changes against a clear spec.
- **This chat (Opus)** — schema audit, reconciling external audits, independent verification. Never make Claude Code re-derive what chat has already established.

### The backlog loop

Run both sweeps first · correct the document where a verdict contradicts it (BB1) · re-run after shipping · **UNMEASURED is never CLOSED** · every new item gets a check the day it is filed (BB5), with a reachable CLOSED state (CC4).

### Working rules

- **A `git push` to `main` IS a deploy (DD6).** Review before the push, not after. A migration is live the moment `db query` runs.
- Always `/clear` in Claude Code before a new prompt — **and verify it took.**
- **First command in any new Terminal window is `cd ~/Desktop/prize-manager`.**
- **`npm run dev` reads and writes the live database.** Check which account you are signed in as.
- **Never chain `npx tsc … && npx vitest run`.** Use `;` or run separately.
- **`supabase db execute` does not exist.** **`supabase functions logs` does not exist.** **`supabase db query --linked -f -` does not read stdin** — write a temp file and pass the path.
- Migration workflow: `supabase db query --linked -f <file>` then `supabase migration repair --status applied <version>`.
- **A new database function needs `notify pgrst, 'reload schema'`** (T6) — and so does a new COLUMN the frontend will select.
- **Make a function report its own build string and curl `?ping=1`** — a version bump cannot fake that (Y3).
- **A build report is a claim. Require the full `git --no-pager diff`** — blind to NEW files, so `git add -A` then `diff --cached` (CC6).
- **Every migration must self-verify and fail loudly**, in one transaction, opening with a pre-flight that asserts the audited state.
- **Dry-run the exact file text** (CC11). The only permitted deviation is `commit;` → `rollback;`, proved by a `diff` showing exactly one changed line.
- **A green dry run proves nothing on its own. Add negative controls** and demonstrate each one failing.
- **`prosrc` includes comments** — `regexp_replace(prosrc,'--[^\n]*','','g')` before matching (CC10).
- **Prove the fix with a test that can only pass if the fix works.** Prefer *matched pairs on one row, one column apart*; assert the positive side is non-zero; **compare content checksums, not row counts**.
- **Make a fixture's two compared values different** (DD4).
- **Check a test file's imports before counting it as coverage** (DD3).
- **When a green check goes red after a correct change, ask whether the check still measures what it claims** (DD2).
- **When a query supports a surprising conclusion, add a dimension before believing it** (DD7).
- **A scan that returns "complete" must be tested against something it should catch** (DD8).
- **Read the triggers on any table a function writes to** (CC1) — **and watch the guard actually fire** (CC9).
- **A grant is not an exposure until a real read returns rows — and it is one once it does** (BB4).
- **Absence of a value is not evidence the value is null.** A failed query must render an explicit state (D32).
- **Never let an error handler discard the input that caused the error** (W4).
- **Never redirect a generator onto a tracked file** (R7). Temp file → verify → `cp`.
- Additive migration → verify → frontend → verify → restrictive migration. Never the reverse.
- **Do not fix what measurement says is not broken.** Record it as drift (W3).
- **Reference literals, not line numbers**, in any check or document.
- Paste terminal output as **text**, never screenshots.
