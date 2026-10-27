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

## Explicit scope authorization for the NEXT source-only cycle (27 Oct 2026)

**The exact database writer source file** — no alternatives or inferred path:

`supabase/migrations/20261027080000_team_v2_adjudicated_atomic_version.sql`

It defines **`public.commit_team_v2_adjudicated_version(uuid, integer, uuid, jsonb, jsonb, jsonb)`**. It is a **draft SQL migration file in PR #483**, not an installed database routine, not proof of valid PostgreSQL runtime behavior, and **not approval to execute it**. It depends on the earlier unapplied `supabase/migrations/20261025193000_team_tiebreak_v2_additive.sql`.

**ALLOWED source-only edits, limited to one coherent writer-safety item:**

1. Inspect and, where a demonstrated contract flaw exists, tighten the SQL **text of the exact writer file above** in the existing draft branch. Examples of permissible safeguards: service-role-only invocation; independently checked tournament owner/master and expected version; append-only new-version behavior; no past-version changes or public-pin rewrites; valid prize/group/player ownership and complete server-derived roster/award metadata; exact authenticated arbiter ruling/affected-prize binding; rejection of extra, missing or duplicated winning rows; deterministic fail-closed rollback on invalid or stale input. Verify assumptions against schema with **read-only** queries; do not overstate the guarantees of `SECURITY INVOKER` or a claimed transaction.
2. Strengthen existing source/fixture tests **only** at `tests/utils/team-v2-atomic-writer-contract.spec.ts` and `tests/utils/team-v2-commit-plan.spec.ts` (or one tightly related new unit test if necessary). Add actual behavioral/negative tests when possible; **static SQL-string assertions are not a PostgreSQL transaction test**. Do not remove, relax or skip an existing guard.
3. Only if an evidenced mismatch in this same seam requires it, make minimal matching **pure-logic** edits at `supabase/functions/_shared/teamV2CommitPlan.ts` or `supabase/functions/_shared/teamTieAdjudicationV2.ts` with corresponding tests. Do not broaden to other domains.
4. **READ ONLY for dependency checks:** `supabase/functions/prepareTeamRulingV2/index.ts`, `supabase/functions/allocateInstitutionPrizes/index.ts`, `supabase/functions/finalize/index.ts`, `src/components/allocation/TeamV2RulingDialog.tsx`, `src/components/final-prize/TeamPrizesTabView.tsx`, `supabase/config.toml`, publication/pin read paths, approved contract in draft PR #468, and production schema/function definitions. Only quote grounded fields; no customer rows, private prize records or secrets.
5. Record verified blockers and exact evidence in this handoff, the short current-status notice in `PROJECT_STATE.md` **only if materially changed**, and one PR #483 evidence comment. Do not create missing canonical files or add timestamp-only commits.

**NOT authorized by this scope:**

- **No SQL execution or schema change**, including `apply_migration`, `execute_sql` with DDL/DML, function deployment, RLS/grant changes to the live DB, destructive cleanup, historical allocation backfill, or test writes against production. Read-only SQL inspection is allowed.
- **Do not edit `supabase/functions/finalize/index.ts`** (protected DD1). Do not edit the existing individual allocation engine, `allocatePrizes`, prizes/conflicts/rule_config, the legacy `resolve_team_tie` implementation or any stored historical rows. Any change to the protected finalize contract requires a **separate file-specific owner decision** after exact source/risk/recovery review.
- Do not connect the dormant writer to a callable committing Edge endpoint, expose a real Save/Publish button, call the legacy RPC for v2, introduce a new broad migration, change the approved UI/print layouts or delegate production-linked writes to Lovable/Codex. Current organizer **Check official ruling** is **read-only** and must continue to say **Not saved**.
- Do not merge, mark PR ready, push main, deploy, publish, build a new QA project, use the unrelated CertificateHub project, or reopen the already-decided CI/visual/historical-award questions. Do not treat the owner's product-scope approval as release permission.

**Required acceptance and stop conditions:**

- Initial v0 path uses **reviewed individual allocations from the existing protected individual engine**; subsequent versions preserve all individual winners from the previous version. No old rows or publication pins are rewritten. New team assignments match the **entire** scorer-derived prize-bearing set, not partial or user-supplied awards. All unresolved prize-bearing ties require authenticated documented rulings; blocked/unverified TB inputs remain non-adjudicable.
- Verify actor, group, place, exact selected K roster, score/source fingerprint, official regulation reference, affected awards, allocation version and publication state at the authoritative server/transaction boundary. Unknowns are blockers, **not assumptions to implement as fact**. The current writer's trust in service-supplied JSON and the legacy finalize concurrency gap are **known unresolved risks**.
- Exercise the exact source ref with lint, units and available guards. Separate passing source tests from authenticated QA and actual PostgreSQL integration. To claim atomicity/privilege/rollback/concurrency proven, require a real **isolated** DB run with negative controls plus verified recovery; none is currently available/approved. Do not substitute production or claim a green run from selected steps.
- If SQL safety cannot be established without editing protected finalize or using an unavailable isolated database, **STOP as BLOCKED on that one dependency**, sync evidence, and request only the precise owner authorization that is genuinely required. Do not keep adding disconnected review artifacts.

## One next exact action

**Assistant only, no user action:** Reconcile HEAD, then inspect and **tighten the exact draft SQL writer source file** `supabase/migrations/20261027080000_team_v2_adjudicated_atomic_version.sql` against the existing server-derived award planner and read-only live schema. Make only demonstrably necessary writer/source test fixes in the allowed paths. Prove the exact change with available tests, sync this handoff/PR evidence and stop. **No deployment, executable Save endpoint or protected finalize edit.**

## Optional fresh-chat continuation prompt

> Continue Prize Manager (`tushar1669/prize-manager`), existing DRAFT PR #483 on `feature/import-tiebreak-visibility-20261025`. Before work, check current `main` and PR HEAD, read `AGENTS.md`, `PROJECT_STATE.md`, this handoff and the owner-approved Team Ranking v2 contract in draft PR #468. Last verified before this scope clarification: `main` `9800fdc8805d678d29e6023b6f47d9672db448df`; draft PR #483 `8f7434501d13a020b4d91767dceb980eaf58fca8`. Do not assume they remain current.
>
> Owner's locked decision is **Option B**: safe server-authoritative arbiter adjudication **before release**. No historical Team Prize handovers; ₹10,000 demo is fixture; preserve history/published pins, no backfill. Synthetic print designs accepted. Keep current organizer UI review labelled **Not saved**. Locked forbidden data import/export format remains forbidden.
>
> **ONE item this cycle:** source-only writer hardening at **`supabase/migrations/20261027080000_team_v2_adjudicated_atomic_version.sql`** (`public.commit_team_v2_adjudicated_version(uuid,integer,uuid,jsonb,jsonb,jsonb)`). Allowed source edits limited to that file, `tests/utils/team-v2-atomic-writer-contract.spec.ts`, `tests/utils/team-v2-commit-plan.spec.ts` and, only on demonstrated need, the pure helpers `supabase/functions/_shared/teamV2CommitPlan.ts` or `supabase/functions/_shared/teamTieAdjudicationV2.ts`. All other named functions/UI/config are READ-ONLY dependencies. Read the detailed allowed/not-allowed list above first.
>
> Do not edit protected `supabase/functions/finalize/index.ts`, change the individual engine, wire/activate a live Save button or RPC, execute or deploy SQL, change production/QA or use CertificateHub backend, merge/push main, publish, or weaken tests. Validate the writer's owner/master, v0/v>0 version and individual integrity, exact team rows, authorized prizes/rulings, publication pins, rollback and stale/concurrent writer exposure. If real DB or protected-finalize evidence is required, record a **single BLOCKED dependency** rather than pretending static assertions prove atomicity. Keep PR #483 DRAFT and unmerged.
>
> Verify exact ref and distinguish CI steps, authenticated QA and runtime. After material progress, update only affected draft-branch canonical state/handoff and one PR evidence comment, then STOP with CURRENT ITEM, RESULT, PRIORITY SNAPSHOT (BACKLOG ID/priority UNKNOWN because missing) and one NEXT EXACT ACTION. No action from me unless separate protected-file or production approval is actually essential. Same chat works; fresh chat is optional.
