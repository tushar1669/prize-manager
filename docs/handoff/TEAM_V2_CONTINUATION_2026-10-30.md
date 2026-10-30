# Team Prizes V2 — focused next-chat handoff (30 October 2026)

Repo: https://github.com/tushar1669/prize-manager
Scope: Team Prizes V2 ONLY. Use latest default-branch facts; this file is a dated handoff, not live runtime proof.

## Already delivered
- Branded Excel + A4 print reports released through PR #485, squash 6af6e89bccfe50a39881fd58664d0afc1c71a79e.
- Owner accepted three attached real-tournament visual reports (Category Cards Updated, Arbiter Sheet, Team Prizes) on 30 October. Visual acceptance is NOT Team V2 engine/payout/Save acceptance.
- PR #486 removes old Category Cards across Finalize, stand-alone Final Prize and public views, retains only the updated design, defaults to v6, redirects /final/v1 to /final/v6. Verify current merge and runtime before asserting publication.
- Production generatePdf Edge Function previously observed ACTIVE v361; it serves printable HTML, not binary PDF bytes.

## Current V2 candidate, do not blindly merge
- Draft PR #484: https://github.com/tushar1669/prize-manager/pull/484. Last observed source HEAD 2467e32efbba5002bf4daba9e71707021d534974. Recheck live.
- Main already contains newer approved reports and security/publication work. Reconcile V2-only changes without overwriting approved Excel/A4 or reviving legacy Category Cards.
- User rejects obsolete prior team monetary ranking rules for NEW Team V2 allocations. Total Points first, then verified tournament-specific source tie-breakers explicitly approved by organizer/arbiter; unresolved ties require an official ruling. No Rank Sum or Best Rank fallback. Preserve historical payout versions and publication pins.
- Source-only protected admin trial and saveTeamV2 are disabled by default. ENABLE_TEAM_V2_ATOMIC_SAVE OFF, per-tournament canary OFF. No V2 SQL or Edge Save deployed as of last check.

## Unresolved safety and delivery gates
1. Transaction-bound server-authoritative consistent scoring/source freshness (individual and team data), legacy finalize/tie write fencing, source-lineage/lock contention and version guards.
2. Official tied-place adjudications and later-version corrections without arbitrary payout.
3. Production-compatible migration order, actual recovery/rollback point and verification; no extra paid environment.
4. Authenticated real Edge-to-database tests for Master, owner, unauthorized user; preserve private/public exposure, RLS and published-only data.
5. Exact-ref unit, format guard, lint, relevant browser and SQL tests; full CI has historically failed at unavailable authenticated Swiss QA backend. Report that independently; do not disable or relabel it.
6. Master-only real test-tournament acceptance AFTER basic safety and functionality, then UI/UX refinement; general availability only with separate approval.

## Start here and execute ONE coherent item per cycle
- Fetch latest main HEAD, AGENTS.md, BACKLOG.md, PROJECT_STATE.md, draft PR #484, its docs/qa/PR484_TEAM_V2_INITIAL_SAVE_SOURCE_2026-10-30.md, docs/release/EXCEL_PDF_TEAM_V2_INTEGRATION_PLAN_2026-10-29.md and docs/SUPABASE_MIGRATION_DEPLOYMENT_SOP.md. Also query Supabase runtime directly.
- SOURCE_OF_TRUTH.md, DOCUMENT_INDEX.md, RUNTIME_STATE.md, RISK_REGISTER.md and EVIDENCE_REGISTER.md were missing on main at prior check; do not invent their contents or queue priority.
- Choose the smallest safety fix; write a failing test first; implement; verify exact commit and environment; sync only material backlog/QA/evidence docs on draft branch. Repeat sequentially only when real progress is possible.
- Honor existing free infrastructure and security tests; do not deploy destructive migrations or unverified Team Save without recovery. Keep user involvement for real decision/approval unavailable to tools.

## Copy/paste new chat prompt
Continue Team Prizes V2 only in tushar1669/prize-manager. Read docs/handoff/TEAM_V2_CONTINUATION_2026-10-30.md from latest main and reconcile GitHub HEAD with draft PR #484. Preserve already approved and released Excel/A4 reports and canonical updated Category Cards. Prior team monetary ranking is obsolete for new V2 awards; historical versions must remain intact. Work sequentially with TDD and available connected free tools, verify actual CI and production truth, never weaken guards, sync material evidence, and stop after completing one coherent verified Team V2 cycle. Report exact remaining gate and user action only if genuinely necessary.
