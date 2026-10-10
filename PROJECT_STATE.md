# PROJECT_STATE — Prize Manager · Universal Extraction Engine

> **Scoped work note · 10 October 2026 · Issue #459 (website only).** Latest verified `main` before the draft: `fbec110bdfb9a39b1614d7ba5142f84b777893b8` (20 commits after the older `251101b` baseline below). The approved Team Prizes organizer PDF (18 pp, SHA256 `6129f0ed1fa6e5d5508da31be7743929d9758ed3387044eef64ba844b1fdef11`) and public How it works/footer changes are staged on `feat/issue-459-team-prizes-guide-20261010` for an **unmerged draft PR**. This is source-only pending PR checks, visual/mobile QA, authorized release and production HTTP verification; the authentic Resolve Tie / Save Resolution capture remains unavailable. The rest of this legacy state document predates the current HEAD and is not normalized by Issue #459. `SOURCE_OF_TRUTH.md`, `BACKLOG.md`, `DOCUMENT_INDEX.md`, `RUNTIME_STATE.md`, `RISK_REGISTER.md` and `EVIDENCE_REGISTER.md` are absent; do not treat this note as their replacement.

**Last updated:** 28 September 2026 · **Owner:** Tushar · **This file is the single source of truth for continuing work in any new chat.**

Replace the previous PROJECT_STATE.md in the repo with this file. Paste it at the start of every new chat to re-establish context.

---

## 1. What this project is

**Prize Manager** (prize-manager.com) is a chess tournament management platform. Phase 1 built a brochure extraction engine: organizer uploads a PDF brochure → two-pass Gemini OCR + structured extraction + deterministic trust/grounding layer → review screen → on Approve, a tournament is created with categories and prizes.

**Why it exists, from the Phase 1 documents.** `docs/extraction-engine/PRD.md` calls Prize Manager the *"first face of the Universal Extraction Engine"*; `ARCHITECTURE.md` opens with **"One engine, many faces."** Two faces run in production (`chess_brochure`, `payment_screenshot`) and the generality bet held: Phase 2A added payment screenshots with a new schema row and new invariants, not a new pipeline.

**Three-platform context:**
- **prize-manager.com** — Tournament prize management (live, takes UPI money). Through 28 Sep: Phase 2A/2A-2/2A-3, conditional auto-approval (20 Aug), F3 oversight (28 Aug), Resend SMTP (29 Aug), G1/G2/G3, B22, B18-a/b (5 Sep), **TC0** (6 Sep), **TC1** (6–7 Sep), **ground-truth validation 96/100** (8 Sep), **GTM public pages** (8–9 Sep), **coupon system repair** (9–10 Sep), **counsel's Terms live** (14 Sep), **AICF ID** (15 Sep), **B8b extraction RCA + fixture harness** (23–28 Sep, local branch — §12.24).
- **certificate-hub.com** — Certificate creation. **Paywall NOT live.** Will consume the engine via REST API (Phase 2C).
- **sportup.online** — Discovery + registration. Organisers collect entry fees directly; the platform takes no cut. **Carries one live exposure, `/debug/auth` (SP-1).**

**GTM status.** Demonstrated to FIDE arbiters at a seminar on 13 September. It landed well. The product is now being shown to people who want to use it, not built toward a date.

**Brochure import is unreliable on multi-section brochures** (§12.24). On today's model at least 8 of 27 real brochures lose material prize data, and the same brochure can come out right or wrong on consecutive uploads. The review screen is the guardrail: organisers must check categories against the brochure until the fix ships.

---

## 2. Key identifiers

| Item | Value |
|---|---|
| Supabase project | `nvjjifnzwrueutbirpde` (ap-south-1, Postgres 17.6). Org is on the **FREE** plan |
| Repo | github.com/tushar1669/prize-manager (**public**) · `main` at **`251101b`** (Lovable `.lovable/plan.md` commits, 20 Sep — no code) · `c31938c` AICF ID (15 Sep) · `906d592` PROJECT_STATE 14 Sep · `8483ad8` Terms of Service · `766faad` profile toast · `4b57f68` profile reward auto-issue · `705e1bb` coupon origin fix · `5779d14` GTM pages. **`PROJECT_STATE.md` lives at the repo root only.** `.claude/` is gitignored — headroom tooling state, never commit it |
| **Only clone** | `~/Desktop/prize-manager`. The GitHub Desktop clone at `~/Documents/GitHub/prize-manager` was deleted 25 Sep; it held no test PDFs |
| **Local branch `fixture/b8b-extraction`** | **Never pushed, no upstream.** `fa42b45` probe + ignores · `7f3aba7` ruler · `9827375` Gwalior ruler · `6bc318f` harness · `93ee166` hardening · replay commit (28 Sep). Harness and ruler only — **the engine under `supabase/` is byte-identical to `main`** |
| **Harness data paths** | `test-brochures/` (27 PDFs, local only) · `fixture-data/` (export, substrates, manifest) · `fixture-runs/` (every run record) · `.env.harness` (harness Gemini key + model). Ignored by `.gitignore` on the branch and by `.git/info/exclude` on **every** branch |
| **Deploy model (DD6)** | **`git push` to `main` deploys BOTH edge functions and the frontend.** No CLI deploy step, no Lovable publish gate. **There is no review gate between commit and production — review before the push, not after** |
| **Edge function versions are not evidence** | Every push redeploys everything, so recorded version numbers go stale within a day. The only reliable check is a function's own build string via `?ping=1` (Y3, DD6). `allocateInstitutionPrizes` carries `BUILD_VERSION = "2026-09-07T09:00:00Z-TC1.5"` |
| **`verify_jwt=false` is THREE functions** | `send-payment-notifications`, `pmPing`, `publicTeamPrizes` |
| **Free-plan log retention** | **1 day.** Edge-function logs older than ~24h are gone |
| Active extraction schema | v5 (chess_brochure, id `74ca346c-0fe4-4ca4-ab35-2aa88631d182`) · v3 (payment_screenshot, id `4e8beb4d-4a07-4ef8-a774-18b22f722522`) |
| Gemini model | Production `GEMINI_MODEL` = `gemini-3.1-flash-lite`, used for **both** passes. Candidate for pass 2 only: `gemini-3.8-flash` (§12.24) |
| **Gemini projects** | Harness key (`.env.harness`) → AI Studio project **"Prize-Manager trial cla…"**. Production key (Supabase secret) → project **"Prize Manager"**. Both free tier. **Limits apply per project, so the harness cannot spend production's quota** |
| **Free-tier limits (read 28 Sep)** | `gemini-3.1-flash-lite` 15 RPM · 250K TPM · 500 RPD. `gemini-3.5-flash` and `gemini-3.8-flash` 5 RPM · 250K TPM · **20 RPD**. RPD resets at midnight Pacific (12:30 IST during PDT). **Failed 503 attempts and timeouts count toward RPD** |
| **Production extraction volume** | Peak 4 flash-lite requests/day over 28 days ≈ 2 brochure extractions on the busiest day |
| **Production Gemini call facts** | `GEMINI_CALL_TIMEOUT_MS` 60 s per call, 140 s total budget. One 5xx retry after 2.5 s; no 429 retry. `callGeminiOnce` joins every response part (no thought filtering). `DEFAULT_OCR_FALLBACK_MODELS = "gemini-3.5-flash,gemini-3.1-flash"` — **the second id does not exist** (404) |
| Local paths | repo `~/Desktop/prize-manager`, test PDFs `~/Desktop/prize-manager/test-brochures/` (local only, not in repo) |
| Deno | Installed locally — the harness runtime |
| Payment trust invariants | 8 in `extract/paymentTrustCheck.ts` · returns `{flags, verdicts}` |
| **F2 kill switch** | `platform_feature_flags` — `key='payment_auto_approve'`, enabled since 2026-08-20. RLS on, zero policies. Off: `supabase/ops/f2_auto_approve_off.sql` |
| **`public.referrals` triggers** | **ZERO, by design, since `20260822120000`.** Do not re-add one — W1 |
| **Test baseline** | **534 passing / 3 known failures of 537** (conflict-utils ×2, martech-metrics ×1) |
| **Unconfirmed flake** | A fourth failure was seen once on an unchanged tree, never reproduced across four later runs, unnamed in the summary. Tier 3, not a known failure |
| TypeScript check | `npx tsc -p tsconfig.app.json --noEmit` — **12 errors in 6 files**: `PendingPaymentsPanel` 5 · `TournamentUpgrade` 2 · `BrochureImportDialog` 2 · `BrochureReview` 1 · `AdminPayments` 1 · `useAuth` 1. Root `npx tsc --noEmit` and `npm run typecheck` check **nothing** |
| **tsc exits non-zero, so never chain it** | `npx tsc … && npx vitest run` silently SKIPS vitest. Use `;` or separate commands |
| pg_cron jobs | jobid 1 `expire-stuck-extraction-documents` (*/10); jobid 2 `drain-payment-notifications` (*/2) |
| **Verification harnesses** | **9 SQL harnesses.** `f2_gate_checks` 24/24 · `f3_audit_checks` 33/33 · `f3c_read_checks` 13/13 · `f0d_rpc_checks` 17/17 · `pf1b_expected_amount` 9/9 · `g1_publish_state_checks` 16/16 · `b22_publish_gate_checks` 14/14 · `b18_version_pin_checks` 16/16 · `tc0_team_version_checks` 12/12. The **brochure fixture harness** (`tools/fixtures/`) is separate and lives on the local branch |
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
| `/terms` | **Counsel's Terms of Service, LIVE since 14 Sep, indexed** | 25 sections, contents list, three tables rendered with the shadcn `Table` component |
| `/privacy` `/refund` | Placeholder notices, **noindex** | "Being finalised with counsel" |

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

`20260817120000`–`20260817160000` F2 · `20260822120000` drop dead referrals trigger · `20260827120000`/`130000` F3-A/B · `20260828120000`/`130000` F3-C0/C0b · `20260829120000` SEC · `20260902120000` G1 · `20260904120000` B22 · `20260905120000` B18-a · `20260905130000` TC0 · **`20260909120000` coupon origin fix** · **`20260909130000` profile reward auto-issue** · AICF ID (`c31938c`, 15 Sep — version per the repo).

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

**Harness (B8b):**
15. **The builder never writes the ruler.** `tests/fixtures/brochures/*.expected.json` are derived in chat from the brochure, checksummed in `RULER.sha256`, chmod 444. `score.ts` refuses to score if any checksum breaks.
16. **No extraction model, prompt or trust-layer change ships without a full-corpus harness comparison** at N ≥ 3 per brochure (DD9).
17. **The harness never touches production.** `run.ts` is limited by Deno flags to `generativelanguage.googleapis.com`; `score.ts` and `retrust.ts` have no network. The substrate export is a single read-only SELECT the owner runs.

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

### DD9 — A single run proves nothing (28 September)
Temperature 0 is not deterministic. On identical input, Gwalior came back right 4 times in 15 and Delhi 8 times in 14. A "regression" read from one August run against two September runs was a lottery: the August run was simply a winning draw. **Judge any extraction change on distributions — N ≥ 3 per brochure — never on a single run.**

### DD10 — A count can flatter in both directions (28 September)
Gwalior's "5 of 15 categories" was one category broken into five fragments, with the other 14 missing. Raipur's 23 over 13 was fragmentation, not better recall. **Placings, rupee totals and a ruler tell the truth; category counts alone do not.**

### DD11 — Keep the raw answer, so evaluation is free (28 September)
Every harness run stores the model's exact output. Any trust-layer change can therefore be replayed on every past sample with zero API calls (`retrust.ts`). **Pay for sampling once; evaluate as often as needed.**

### DD12 — A shared quota is a shared outage (28 September)
Gemini limits are per project, and failed 503 attempts count toward the daily allowance. The harness has its own project; **nothing experimental runs on production's.**

---

## 4–12.21. Phases 1 through 8 September — COMPLETE

See prior PROJECT_STATE for Phase 1, Phase 2A, Workstream C, Phase 2A-2, F0a–F0e, F1, E1–E3, PF1, **F2 (live 20 Aug)**, the **referrals repair**, **production validation**, **F3**, **Resend SMTP**, **F3-C2**, **B16**, **batch F1 + sweeps**, **G1/G2/G3/G3b**, **B22 + GTM1**, **§12.15 B18-a/B18-b**, **§12.16 TC0**, **§12.17 TC1**, **§12.18 census**, **§12.19 individual-engine gender investigation**, **§12.20 status**, **§12.21 ground-truth validation (96/100)**.

Governing decisions unchanged: **D38, D39, D40, D41, X1–X9, Y1, Z1–Z4, AA1–AA5, BB1–BB5, CC1–CC12, DD1–DD8**. New: **DD9–DD12**. Carry DD9–DD12 and §12.24's findings into `PHASE2_ARCHITECTURE.md` §6 as D42–D44 at its next revision.

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

Counsel (a friend, not charging; incorporation to follow) delivered a Scope of Work and six documents. **Only prize-manager's Terms is published.**

| Site | Terms | Privacy | Refund |
|---|---|---|---|
| prize-manager.com | ✅ **LIVE 14 Sep**, indexed, `src/pages/public/Terms.tsx` | ❌ 5 gaps | ❌ not supplied |
| certificate-hub.com | ❌ Clause 16.1 liability floor TBD | ❌ **7 gaps — see below** | ❌ not needed — no money taken |
| sportup.online | ❌ Clause 10 redraft + ₹500 into 18.1 | ❌ sub-processor list blocked on PostHog | ❌ not needed — no money taken |

### CertificateHub Privacy Policy — seven defects found on transcription (14 Sep)

Lovable transcribed it verbatim and flagged, as instructed. **Three are substantive gaps in counsel's own document**, not transcription errors:

1. **Clause 15 "Cookies and similar technologies" — heading present, body empty.**
2. **Clause 8.1 says provider categories "are set out below" — no table follows.** Same missing sub-processor table as Prize Manager.
3. **Clause 9 ends "Our measures include:" — no list follows.**
4. Clause 4.1 cites a "Clause 1.4" that does not exist in the document.
5. Clause 16 refers to a "Last updated" date the document does not carry.
6. Clause 2.1 ends without a full stop; Clause 11 reads "legal claims.Where consent" — missing space.

**It must NOT be published in this state.** A privacy policy with an empty cookies clause and a missing sub-processor table is worse than the placeholder, because it presents itself as complete. `/privacy` on certificate-hub must be reverted to the placeholder notice until counsel returns corrections.

### Lovable shells built 14 Sep

Both sites now have `/terms`, `/privacy`, `/refund`, a site footer with the Legal column and "© 2026 DERA Tech", and header links. **SportUp's changes are built but NOT PUBLISHED** — publishing replaces the garbled 2023 Privacy line and the contradictory refund policies with an honest notice, closing most of SP-2…SP-7.

**Known copy defect on both sites:** the placeholder notice reads "Our refund policy **are** being finalised" — a bracket in the source instruction was expanded literally. Verb agreement needs correcting per page.

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

**New item for counsel (28 Sep):** production's Gemini key is on the **free tier**. A pricing summary reports that free-tier content may be used to improve Google's products, while paid-tier content is not. Confirm against Google's Gemini API terms; it bears on the Google row above and on decision D3 (§12.24).

### Clause 8.5 — anti-scraping, what is already true

Measured 14 Sep: `anon` **cannot** read `dob`, `dob_raw`, `disability` or `special_notes` on `players` — column-level grants are already in place. Public access is gated on `tournaments.is_published`. Still anon-readable: name, club, city, state, `type_label` (encodes U08–U16), rating, points, rank, gender, `fide_id`. No rate limiting exists.

---

## 12.24 · 23–28 September 2026 — B8b: extraction RCA and the fixture harness

### Trigger

A live user's **Eklavya** brochure — 22 categories, ₹2,00,000 printed on page 1 — imported as **1 category, ₹1,52,000**. Extraction `9f4cca8f` was approved despite a high-severity `sum_mismatch` (expected 152000, stated 200000) and committed to tournament **`d72ea3b3`**.

### Root cause — every layer measured against the artifact

| Layer | Verdict |
|---|---|
| Pass 1 OCR | ✅ every category marker present in `ocr_markdown` |
| Schema | ✅ no `maxItems` on `prize_categories` |
| Output length | ✅ `finish=STOP`, 1,516 tokens, no thinking tokens |
| Trust-layer prune | ✅ dropped 0 |
| **Pass 2 (`gemini-3.1-flash-lite`)** | ❌ **returns 1 of 22 categories from a complete substrate** — reproduced offline by the probe and the harness |

**One mechanism, two symptoms.** On multi-section brochures, today's pass 2 extracts the **first visual prize block and stops** (collapse: Eklavya, Bareilly, Sangli, Delhi). When that first block is laid out as separate visual units — badges, rank columns — it also **splits it into one pseudo-category per rank** (fragmentation: Gwalior "Main Open 1st…5th"; Raipur "Open 1st…10th, Open 11-20th"; Vijaywada, whose 10 categories are all pieces of its Open list). Fragmentation keeps the rupee total, so no cash check can see it.

**It is a lottery, not a regression (DD9).** Identical input, temperature 0: Eklavya 1 category in 5 of 5; Gwalior right 4 of 15; Delhi 18 categories 8 of 14 and 1 category 6 of 14; Kashmir 16 or 6; Raipur 23 (fragmented) in 5 of 8, 13 in 3 of 8. Gwalior's correct August production run was a winning draw — no file the extract function imports has changed since 19 August.

**Scale (baseline-v1, 27 brochures, N=2):** at least 8 lose material prize data, with gaps from ₹16,000 to ₹5.8 lakh; Raipur fragments in 5 of 8 runs; 3 unresolved (Kashmir, Pune above 2200, Noida). Historically, 13 brochures have collapsed to a single category at least once, and 4 collapsed extractions were approved into production.

**Trust-layer findings:**
- `pruneStructuralNoise` drops are **silent** — the counters go only to `safeLog` (1-day retention). Observed firing once: Mundra, two empty `U-11`/`U-15` shells, correctly.
- Literal-substring grounding **blanks correctly composed category names** ("Under 7" beneath "Age Category (Girls)" becomes "Under 7 Girls", which never appears verbatim), producing a wall of `ungrounded` flags.
- `sum_mismatch` is **blind to non-cash loss** — Shahdol loses 14 trophy-only categories with cash matching exactly — and **absent when no fund is stated** (Kashmir).
- `confidence = 1.000` was shown on the Eklavya extraction that lost 95% of the brochure.

### The ruler — `tests/fixtures/brochures/` (branch)

| Fixture | Basis | Asserts |
|---|---|---|
| Eklavya | Hand-derived; cash sums to the printed ₹2,00,000 | 22 categories · 75 rows · 88 placings · 3 trophy rows · 63 medal rows · full name list |
| Gwalior | Hand-derived; cash sums to the printed ₹1,64,000 | 15 categories · 100 placings · full name list (rows unasserted: grouping-dependent) |
| Shahdol | D41 | 20 categories · 59 rows · ₹51,000 |
| Vijaywada | D41 | ₹8,00,000 |

### The harness — `tools/fixtures/` (branch)

- **`export_substrates.sql`** (owner runs it; one read-only SELECT) → **`split_substrates.ts`** → `fixture-data/`: 27 stored pass-1 substrates, plus a manifest carrying each brochure's first production extraction as a reference.
- **`run.ts`** replays production pass 2 exactly: imports `extractionPrompt.ts`, `responseSchema.ts`, `trustCheck.ts` and `geminiProvider.ts`; mirrors the unexported parse and response-text code under drift guards (`MIRROR DRIFT` / `MIRROR SELF-DRIFT`). Accumulate-only output, quota-aware stop, capped backoff for 429/5xx/timeouts/network errors, key sent in a header and redacted everywhere, per-run model/prompt/trust fingerprints and durations. Deviates from production only in availability (retries), never in outputs.
- **`score.ts`** — ruler gate, UNSCORED never PASS, named raw vs post-trust, `EXTRA` lines, `MIXED` detection, mandatory `--runs-dir`.
- **`retrust.ts`** + **`trust_variants.ts`** — replay trust-layer rules over stored raw answers with zero API calls (DD11).

### Candidate A — `gemini-3.8-flash` for pass 2 only

- **7 of 7 completed runs correct:** Eklavya 2/2 with every ruler check passing, Gwalior 2/2, Delhi 3/3. `gemini-3.5-flash` produced no valid runs.
- About 19–50 s per call (the largest brochure came near the 60 s cap); 6.9k–10.8k output tokens; no thinking tokens.
- 14 of 21 requests got a 503 in one window, and those failures counted toward the 20-a-day allowance.
- Cost: roughly 3–5 US cents per call at third-party tracker rates for 3.6/3.7 Flash; 3.8's own price unconfirmed.
- **Untested:** Shahdol, and the 23 brochures that work today — where a switch's regression risk lies.

### Candidate N1 — word-wise category-name grounding

The rule `trustCheck.ts` already applies to fee labels (`groundLabel`: every content word ≥ 3 characters must appear among the brochure's words), applied only to names the literal rule blanked. On 3.8-flash output, **Eklavya goes from 4–9 of 22 named with 13–18 flags to 22 of 22 named, zero flags, every name matching the ruler.** Across 54 flash-lite runs it changed names and nothing else. It also names fragments ("Open 3rd") that were previously blank — easier for a reviewer to spot, but a broken extraction looks tidier.

### Open decisions (owner)

- **D2 — harness billing.** Enable billing on "Prize-Manager trial…" to run the full comparison in one night (roughly $3–5), or stay free: 20 candidate calls a night means one to two weeks of rotating slices.
- **D3 — production pass 2 on 3.8-flash.** At today's volume it would use about 2 of 20 daily requests, so the free tier covers it only with a flash-lite fallback for 503 days. Billing is roughly $2–3 a month at today's volume and exits the free tier's content-use terms.
- **D4 — adopt N1 in `trustCheck.ts`.** Guardrail 3: this loosens grounding for one field, on evidence.

D1 (harness quota isolation) is settled: separate projects.

---

## 13. Immediate next step — B8b continuation (new chat)

**Owner decides D2 first.** Then, strictly sequentially:

1. **Nightly automation** (Claude Code, Sonnet 5): `nightly.sh`, a `launchd` agent and a `pmset` wake shortly before 02:00, quota-aware, with a morning summary file. On the free tier: a rotating slice of about 7 brochures a night, both models at N=1, `--max-retries 0–1` on the 3.8-flash arm, accumulating under fixed labels. With billing: the whole corpus at N=3 on both models in one night. **Built and tested by Claude Code, not hand-typed.**
2. **Full rulers for Raipur, Vijaywada and Delhi** — the fragmentation and collapse cases cash cannot judge. Owner uploads the PDFs; the ruler is derived in chat.
3. **Full comparison**: 3.8-flash vs flash-lite across all 27, scored raw and under N1 via `retrust.ts` at no cost.
4. **If 3.8-flash holds — production design**: a separate pass-2 model setting (pass 1 stays on flash-lite); fall back to flash-lite on 503/429/timeout and mark the extraction as a fallback; timeout headroom for the largest brochures; include-thoughts off; N1 if D4 approves. Implemented with harness proof, and **reviewed before the push** (DD6).

The branch stays local until step 4 is approved.

### In parallel — each in its own chat

- **Review gate (Tier 1, `src/`, Sonnet):** a high-severity `sum_mismatch` must require explicit acknowledgement before Approve. It would have stopped Eklavya.
- **Tournament `d72ea3b3` (Eklavya):** confirm the organiser completed it by hand — 22 categories, 75 prize rows, 88 placings, ₹2,00,000.

### Queued after B8b — unchanged from 14 Sep

**AICF ID is done** (`c31938c`, 15 Sep; completeness stays five fields).

**The dependency chain:** PostHog sets non-essential cookies → Privacy Clause 16.2 promises a consent mechanism → the banner must exist before PostHog goes live → PostHog must appear in the sub-processor table → the table cannot go to counsel until the tools are decided → the Privacy Policy cannot publish until the table is filled.

1. **Per-site legal and copy fixes** — three separate chats, one per property:
   - **prize-manager.com** — `/privacy` and `/refund` still placeholders, awaiting counsel.
   - **certificate-hub.com** — revert `/privacy` to the placeholder notice; send counsel the seven defects; fix the "policy are" verb agreement.
   - **sportup.online** — **publish the built changes**; fix the verb agreement; then SP-1 (`/debug/auth`, ungated public route) in its own chat, different repo.
2. **Cookie consent + PostHog** — Sonnet. Consent banner first, then PostHog by snippet (not npm, guardrail 5), analytics **and** error tracking, billing limit set on day one.
3. **Anti-scraping hardening** — Opus. `robots.txt`, and review whether `gender` and `fide_id` need to be anon-readable. Touches published-results read paths.
4. **Legal completion** — return to the chat titled *"Prize Manager TC1 gender slots implementation"*. Fill the sub-processor table, send counsel the remaining items, publish everything together.

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
| AICF ID | ✅ 15 Sep |

**Still Tier 1:**
- **B8b — brochure extraction collapse and fragmentation** (§12.24, §13). In progress.
- **Review gate** — a high-severity `sum_mismatch` can be waved through with an ordinary Approve.
- **Tournament `d72ea3b3`** — confirm the organiser completed it by hand.
- **SP-1** `/debug/auth` ungated on sportup.online — own chat, different repo · **SP-2…SP-7** sportup's contradictory refund policies, advertised card/net-banking payments it does not process, garbled Privacy line · **PM-1** legal pages not yet published while taking UPI money.

### Tier 2

- **Validate entered prize amounts against the extracted brochure table** — a ₹4 entry error moved two placings in the Jaipur check and nothing flagged it. Highest-value fix outstanding.
- **Prune drops are silent** — `namelessCategoriesDropped` / `emptyCategoriesDropped` should become flags on the row.
- **`sum_mismatch` blind spots** — non-cash loss, and brochures with no stated fund. A mentioned-but-missing check would cover both.
- **Production retries a 503 once and never retries a 429** — tonight's "high demand" windows would fail real uploads.
- **`DEFAULT_OCR_FALLBACK_MODELS` names `gemini-3.1-flash`, which does not exist** — the second pass-1 fallback always 404s.
- **Gemini free-tier content-use terms** — to counsel (§12.23).
- **`confidence` shown as 1.000 on a 95%-lossy extraction** — it should not be presented as reassurance.
- **Populate `rule_config.category_priority_order`** — empty on every tournament, so equal-value ties resolve by implicit fallback.
- **Institution-import gap** — leads TC2/TC3.
- **Coupon-insert failure blocks a profile save** — catch, keep the save, record to `audit_events`.
- **`fide_arbiter_id` mandatory** — decide whether it stays required.
- **Truncated player name** — `0d54de9f`, Unrated #10 stored as `T`; actual player Tavish Singh Rathore, rank 170.
- **`generatePdf` live-compute fallback** (`index.ts:155-169`) — the defect TC0-d removed from `publicTeamPrizes`, still present here.
- **Migration `20251201090000` false-applied** — recorded applied, column absent.
- **RULING 3 — per-group `minimum_roster_size`** — decided 7 Sep, not built. No `tc1_` harness exists.
- **Girls-only prize that can never be awarded** — `8265c82a`, zero gender data on 150 players, unpublished. Warn at finalize when a category's rule can match no player.
- **G4** required details before publish · **B7** drift migration, now **ten** untracked functions · **B18-c** `ON DELETE CASCADE` into published history · **B22 slug-change UI** · column-level UPDATE on `tournaments`/`publications` · **B13 batch B/C, #9, #7** · **B17** · **B5** audit cadence · **B19** · **B18-3**.
- **Sweep check B7a can never read CLOSED** — it measures "does `is_master(uuid)` exist"; TC0 removed the dependency instead. Needs rewriting (CC4).

### Tier 3

3 known test failures, probably one timezone bug · the unconfirmed fourth flake · `resolveOrigin` dead code · no test covers `ColumnFilter` or the B18 selector modes · `PublicWinnersPage` "0 Winners" badge on the pin error path · `401` on `/rest/v1/players` capability probe · `CLAUDE.md` says the chess_brochure schema is v3 (active is v5) · harness: `names-wordwise` mirrors the private `groundLabel` without a drift guard · harness: the retry log line prints "/6" regardless of `--max-retries` · B1 · Y2 · B10 · B12 · B14 · B15 · B2 · B3 · B6 · Playwright layout test · `MAX_ATTEMPTS=5` no backoff · `tsconfig.app.json` scope gap.

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
- **Do not make brochure-import accuracy claims** until B8b's comparison is in (§12.24).

---

## 16. Ordering

**B8b continuation** (D2 → nightly automation → rulers → full comparison → production change) ∥ **review gate** (own chat) → **cookie consent + PostHog** → **anti-scraping hardening** → **legal completion** → SP-1 (own chat, different repo) → sportup SP-2…SP-7 → sitemaps → G4 → Tier 2 → Phase 2B → TC2 → TC3.

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

**Sync and stop.** When a phase ends, write PROJECT_STATE, stop, and start a new chat. Don't extend a chat by chasing side issues — file them in §14 instead.

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
- **B8b** — design, verification and decisions in chat on **Fable 5.1 at medium effort**; Claude Code builds on **Sonnet 5 at medium effort**.
- **This chat** — schema audit, reconciling external audits, independent verification. Never make Claude Code re-derive what chat has already established.

### The brochure fixture harness — quick reference (branch `fixture/b8b-extraction`)

```
# Run pass 2 on stored substrates. A new --label per experiment; re-running a label adds samples.
caffeinate -i deno run --no-prompt --allow-net=generativelanguage.googleapis.com --allow-read --allow-write=fixture-runs tools/fixtures/run.ts --only <ids> --n <N> --label <label> [--model <id>] [--max-retries 0-5] [--max-calls N]

# Score a label. --runs-dir is required.
deno run --no-prompt --allow-read --allow-write=fixture-runs tools/fixtures/score.ts --runs-dir "$(ls -d fixture-runs/*/<label> | tail -1)"

# Replay the trust layer on stored answers. Zero API calls.
deno run --no-prompt --allow-read --allow-write=fixture-runs tools/fixtures/retrust.ts --from <runs dir> --label <new label> --trust baseline|names-wordwise
```

- **Exit codes:** 2 bad flags or ruler tampered · 3 mirror drift · 4 `--max-calls` exceeded · 5 quota exhausted.
- **Watch the first line** of every run: it prints `model=` — confirm it before walking away.
- **Adding a ruler file:** derive it in chat → `chmod 644 RULER.sha256` → `shasum -a 256 *.expected.json > RULER.sha256` → confirm the old hashes did not move → `chmod 444` on all → commit with `git commit -m "…" -- tests/fixtures/brochures`.
- **Git does not remember chmod 444** across branch switches; re-run it on the ruler after switching back.
- **New brochures** need a stored substrate: upload once on prize-manager.com, reject the extraction, re-run the export and the split.

### The backlog loop

Run both sweeps first · correct the document where a verdict contradicts it (BB1) · re-run after shipping · **UNMEASURED is never CLOSED** · every new item gets a check the day it is filed (BB5), with a reachable CLOSED state (CC4).

### Working rules

- **A `git push` to `main` IS a deploy (DD6).** Review before the push, not after. A migration is live the moment `db query` runs.
- Always `/clear` in Claude Code before a new prompt — **and verify it took.**
- **First command in any new Terminal window is `cd ~/Desktop/prize-manager`.**
- **`npm run dev` reads and writes the live database.** Check which account you are signed in as.
- **Never chain `npx tsc … && npx vitest run`.** Use `;` or run separately.
- **`supabase db execute` does not exist.** **`supabase functions logs` does not exist.** **`supabase db query --linked -f -` does not read stdin** — write a temp file and pass the path.
- **`supabase db query` prints only the last statement's result set** — one statement per file.
- **Commit with a pathspec (`git commit -m "…" -- <path>`) whenever other work is staged.**
- Migration workflow: `supabase db query --linked -f <file>` then `supabase migration repair --status applied <version>`.
- **A new database function needs `notify pgrst, 'reload schema'`** (T6) — and so does a new COLUMN the frontend will select.
- **Make a function report its own build string and curl `?ping=1`** — a version bump cannot fake that (Y3).
- **A build report is a claim. Require the full `git --no-pager diff`** — blind to NEW files, so `git add -A` then `diff --cached` (CC6). Long diffs: `sed -n` in 300-line parts.
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
- **One run proves nothing; judge distributions** (DD9). **Counts can flatter; trust placings and rulers** (DD10).
- **Read the triggers on any table a function writes to** (CC1) — **and watch the guard actually fire** (CC9).
- **A grant is not an exposure until a real read returns rows — and it is one once it does** (BB4).
- **Absence of a value is not evidence the value is null.** A failed query must render an explicit state (D32).
- **Never let an error handler discard the input that caused the error** (W4).
- **Never redirect a generator onto a tracked file** (R7). Temp file → verify → `cp`.
- Additive migration → verify → frontend → verify → restrictive migration. Never the reverse.
- **Do not fix what measurement says is not broken.** Record it as drift (W3).
- **Reference literals, not line numbers**, in any check or document.
- Paste terminal output as **text**, never screenshots.
