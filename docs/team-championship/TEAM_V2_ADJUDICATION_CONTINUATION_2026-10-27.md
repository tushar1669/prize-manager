# Team Ranking v2 Option B — safe manual ruling continuation

**Date:** 27 October 2026. **Repo:** `tushar1669/prize-manager`. **Status:** in draft PR [#483](https://github.com/tushar1669/prize-manager/pull/483), not merged, not deployed, not operational. **Canonical priority/ID:** UNKNOWN — `BACKLOG.md` is missing on main. This is a handoff and evidence index, not an owner authorization to deploy.

## Decisions not to revisit

- Owner chose **Option B**: secure, server-authoritative manual adjudication for a truly exhausted Team Ranking v2 tie **before release**. Do **not** substitute Option A, unsupported automatic winners, alphabetic tie orders or legacy Rank Sum.
- Owner visually approved synthetic versions of the four print layouts. That is synthetic visual acceptance, not authenticated browser, printer or runtime evidence.
- No Team Prizes were actually announced/awarded/handed over for the six events reviewed; the ₹10,000 Team Prizes Guide Demo entry is **test data**. **Preserve all saved historical `allocations`, `team_allocations`, `team_allocation_notes`, `publications` and public allocation pins unchanged.** No backfill, deletion, historical re-ranking or payout override.
- Fixed **Total Points** primary; organizer-approved ordered **score vector, verified source TB1…TBn** only; missing or unverified source TB data means **BLOCKED**, not an arbitrary manual resolution. Only a genuinely exhausted `tied` partition is eligible for cited arbiter adjudication. The locked data import/export restriction remains unchanged.
- **No main push, merge, publication, deployment, live migration, production DML or draft-to-ready conversion** without separate explicit owner approval. Push to main may deploy both frontend and Edge Functions. Never use the unrelated CertificateHub backend as QA.

## Intended vs source vs runtime (do not conflate)

**Intended/approved:** Team Ranking v2 specification in draft PR #468, `docs/team-championship/TEAM_RANKING_CONFIGURABLE_TB_CONTRACT_2026-10-25.md` (not main); Option B confirmed by owner. Rule changes preserve recorded history and public allocation-version pins.

**Source (draft #483):** Team comparator, source-TB import and rules editor, four synthetic print views and Team Prizes results, public/PDF/XLSX criterion labels; pure `validateTeamRulingV2`; `prepareTeamRulingV2` server-authenticated **read-only** review; organizer `TeamV2RulingDialog` with visible **Review official tie ruling** and explicit **Not saved** messaging. The SQL draft `supabase/migrations/20261027080000_team_v2_adjudicated_atomic_version.sql` proposes a server-role-only *new-version* RPC. The new pure `teamV2CommitPlan.ts` computes placement instructions from fresh trusted scorer partitions and already validated rulings **without writing data**. It is **not** a deployed save endpoint.

**Runtime (direct read-only evidence):** Main was `9800fdc8805d678d29e6023b6f47d9672db448df` in recent checks. Live `team_allocations.ranking_snapshot` and `institution_prize_groups.ranking_rules` columns absent. Current `resolve_team_tie` SECURITY DEFINER RPC may delete/reinsert saved team awards at an existing version; **forbid its use for v2**. No authenticated v2 runtime integration proven. Latest exact PR HEAD, CI run IDs and publication state must be re-checked via tools on continuation.

## One safety blocker before enabling a Save button

A source-only plan is **not** a safe committed award. The current draft writer takes service-role-supplied JSON rows, but has **not been compiled/exercised** against an isolated compatible PostgreSQL schema, and does not itself independently re-run the team scorer. The existing `finalize` writes individual allocations via a separate, unguarded MAX+1 sequence and is protected by DD1. A first-ever finalization after an unresolved team tie has **no prior individual version to clone**. A later-version resolution must not rewrite the old winner or change public pinned results; shared individual/team version consistency is load-bearing. The live legacy `resolve_team_tie` needs fencing before rollout. Arbiter reference strings alone do not independently authenticate a real-world decision. **Do not wire a privileged commit path to the existing SQL under these unverified conditions.**

## Required scoped continuation

1. Reconcile main HEAD vs legacy PROJECT_STATE baseline, draft PR #483 HEAD and approved spec; check existing PR #483 comments and exact CI run. Keep the one coherent item **server-authoritative atomic Save official resolution**, not unrelated normalization.
2. Use the new pure award-place planner to cover **all prize-bearing v2 tie partitions** and clear automatic placements without raw Rank Sum or client-supplied winner rows. Confirm the helper's focused tests on the exact commit.
3. Before enabling the SQL write, make the minimal safely reviewable **source** changes for full scorer-derived audit/player snapshots, authorization, initial-version individual allocation review, current rules/source fingerprint and tournament-locked version/published-pin checks. Address competing legacy writers; do not bypass protected `finalize` DD1 without a separate, narrow owner decision.
4. Verify with a real isolated transaction test (positive, negative controls, rollback/privilege/concurrency) and authenticated organizer journey when its release prerequisites are actually available. Do **not** create a new QA project or use production for test writes just to manufacture a green CI. Existing Action failures due to unavailable QA are not proof of a source regression.
5. Only after those gates and explicit separate owner release authorization, consider migration, deployment and operational Save UI. No automatic publish. Until then, the user-visible dialog must say **Not saved**, and unresolved ties must block payout.

## One next action

Inspect and tighten the draft **server-to-DB atomic commit safety boundary** against the real scorer and existing individual finalize invariants, then implement only a safely testable source step. If the first-finalization/protected-finalize or DB transactional dependency remains unresolved, **record BLOCKED** rather than adding a misleading Save button. Do not ask the owner to revisit Option B, prior visual acceptance or historical prize handovers.

**No user action required for draft-source work.** If file-specific authorization for protected `finalize` or a production migration/release is actually needed, request that precise separate decision with exact scope, rollback and beginner-friendly steps. The next `continue` works in this same chat; fresh chat is optional.
