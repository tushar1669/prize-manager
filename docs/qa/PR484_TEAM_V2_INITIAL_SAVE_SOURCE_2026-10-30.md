# PR #484 — initial uncontested Team Ranking v2 Save source candidate

**Date:** 30 October 2026. **Exact source commit:** [`1aa7e4fe071ec7cd28335b126d479f18391fe518`](https://github.com/tushar1669/prize-manager/commit/1aa7e4fe071ec7cd28335b126d479f18391fe518). **State:** source **IMPLEMENTED + UNIT VERIFIED**, not authenticated end-to-end verified, not released. Priority/ID **UNKNOWN**: default-branch BACKLOG is absent.

## Scope (one coherent source item)

Added `supabase/functions/saveTeamV2/index.ts` as a **strict first-version-only, no-tie source candidate** and pure `_shared/teamV2InitialSaveRows.ts`, registered the function as JWT-required, and added six pure/contract unit tests. The existing scoring engines, SQL migrations, allocation histories, frontend components and published data were not changed.

Only `{tournament_id, expected_version:0}` is accepted from the browser; extra fields (including winners, team rows, rule overrides, tie orders) are rejected. The Edge handler verifies JWT identity, current owner/master role and full-access entitlement on the server. Independently fetches complete active individual category/prize IDs and all Team v2 active groups/prize metadata; checks confirmed regulation references; invokes the existing authenticated individual engine with no overrides and full output, and independent Team scorer with no browser candidate lists. The pure assembler checks exact prize/group inventory, full unmasked individual results, zero unfilled awards, all team award slots resolved without ties, complete real scorer ranking audit, canonical rules, selected K-player roster/points, and no duplicate/missing prize IDs. The handler verifies the current allocation version is zero before and after scoring and prepares a single atomic RPC request; later versions, official tie rulings, absent source details, any discrepancy and unknown access all fail closed.

**Important defense:** `ENABLE_TEAM_V2_ATOMIC_SAVE` is required and **OFF by default**; no environment was changed to enable it. This is not a production-ready Save UI. It deliberately rejects partially filled individual categories, as the current first-version SQL has no explicit unfilled-row representation; it never guesses missing winners.

## Exact-ref verification

- [GitHub CI 40980314099](https://github.com/tushar1669/prize-manager/actions/runs/40980314099): **712 unit tests PASS** (six new focused tests), build PASS, lint PASS, strict format guard PASS, public smoke PASS. **Overall CI FAILURE**: authenticated Swiss QA preflight fails closed because no dedicated non-production HTTPS Supabase backend/test account is authorized; subsequent authenticated flows SKIPPED. Do not call overall CI green.
- [Isolated PostgreSQL 40980314265](https://github.com/tushar1669/prize-manager/actions/runs/40980314265): SUCCESS, preserving the existing direct SQL role/rollback/version/concurrent-write tests for the draft transaction.
- [Synthetic Excel/browser/server A4 QA 40980314092](https://github.com/tushar1669/prize-manager/actions/runs/40980314092): SUCCESS.
- [Migration Guard 40980314096](https://github.com/tushar1669/prize-manager/actions/runs/40980314096): SUCCESS.

## Remaining mandatory gate — do NOT release

The current version-locked DB RPC checks exact latest allocation version, award metadata and selected roster totals under a tournament row lock, but **it does not atomically reprove the complete independently scored individual eligibility and whole-team partition ordering against all current mutable player/source data**. A source revision or concurrent change outside the version-locked writers may invalidate the precomputed award plan. This must be solved fail-closed at the transactional boundary and independently tested before `ENABLE_TEAM_V2_ATOMIC_SAVE` can ever be enabled. The current endpoint also **does not support genuine tied-place official rulings or later-version amendments**, which are separate approved functionality and must not silently fall back to Rank Sum/Best Rank.

Full authenticated Supabase integration (owner/master/non-owner, real independent scorers, source changes during transaction, rollback and recovery), legacy finalize/tie writer fencing, production migration recovery, actual frontend/version and Lovable rollout remain unverified. This synthetic-only endpoint plus direct SQL fixture **is not a complete end-to-end Team v2 Save**. The current production DB lacks Team v2 ranking/audit columns and atomic RPCs, and no draft SQL was applied here. Owner's release intent is recorded; that does not bypass these blockers.

**Cycle exit:** CURRENT ITEM initial uncontested source Save candidate — **IMPLEMENTED / SOURCE VERIFIED**, final Team v2 Save **BLOCKED**. **NEXT EXACT ACTION:** establish and test one atomic source-freshness contract at the DB boundary for the server-computed complete prize plan, then validate the actual authenticated Edge→RPC call in an authorized isolated backend. Keep PR #484 DRAFT/unmerged. No action needed from owner to preserve this draft state; a dedicated QA environment or alternative approved isolated backend is required before release.
