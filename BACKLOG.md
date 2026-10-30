# Prize Manager — Canonical Backlog Index (draft restoration)

**Updated:** 30 October 2026. **Status:** Draft on PR #484 only; do not treat as deployed or merged.

## Why this file exists

An exact-path history check for root `BACKLOG.md` on `main` returned no commits as of 30 October 2026. This is not proof there was never a backlog: `docs/BACKLOG_POST_TEMPLATE_V2.md` **exists on `main`** (added 26 April, updated 29 April 2026), while `PROJECT_STATE.md` contains historical handoffs. Earlier AI cycles incorrectly said backlog inventory was missing without first finding the existing document.

This root document is a **pointer and current evidence index**, not approval to manufacture priorities, merge unfinished features or replace the existing post-template backlog.

## Current coherent delivery item

| Field | Evidence-based current state |
|---|---|
| Item | Excel, printable PDF/A4, Team Prizes V2, restricted Master-only trial |
| Canonical backlog ID | **UNKNOWN** — no owner-assigned ID found in existing root backlog |
| Canonical priority | **UNKNOWN** — do not invent P0/P1 |
| Lifecycle | **IN_PROGRESS; release BLOCKED** (draft source & scoped tests, no production release) |
| Existing PR | [#484](https://github.com/tushar1669/prize-manager/pull/484) — DRAFT, unmerged |
| Latest verified main baseline at reconciliation | `104aa4221016091ed4ca1b15a033f062da44d178` |
| Owner direction | Master-only trial first on an owner test tournament; no new paid test environment; retire obsolete team-ranking rules for **new V2 allocations**, preserve historical awards; UI/UX follow-up after functional acceptance |

### Scope and source evidence

- Preserve individual allocation engine, historical prize allocation versions, publication pins, authoritative Master/ownership authorization, source-grounded prize computation, no CSV import/export and existing CI/security checks.
- Team V2 new awards require organizer-confirmed published rules; Rank Sum / Best Rank are not default monetary tie-breakers.
- Excel four-sheet Final Prizes plus Coverage/RCA and printable server HTML/A4 source verified in existing synthetic QA. Server endpoint returns **printable HTML**, not binary PDF bytes; do not claim live parity.
- Master-only Team V2 Save is source-implemented behind `ENABLE_TEAM_V2_ATOMIC_SAVE` and a default-off per-tournament DB canary. No production canary migration, scoring migration, service enablement or activation occurred.
- Existing draft SQL safeguards now restrict the canary to a selected tournament, rather than locking unrelated events; deactivation must not reopen legacy team writers on already saved V2 versions.

### Remaining release dependencies, not new backlog priorities

1. Verify **project-specific usable recovery point** and rollback process before applying any production Team V2 migration. Pro organization subscription by itself is not evidence of a restorable project backup.
2. Verify production-compatible schema/migration ordering and the complete authenticated server Master-only scorer → official ruling → RPC Save, with source consistency and historical version protection. Existing authenticated Swiss-import e2e suite fails closed without a separately configured nonproduction QA backend; do not bypass or count passing unit/isolated PG as all CI green.
3. Review production load and unexpected side effects of per-row source lineage triggers before enabling. Ensure no impact on unrelated tournaments.
4. Once required release gates pass, use recorded owner authorization for restricted Master-only release, verify actual deployed ref/environment, then request owner test tournament acceptance (including sanitized HAR/console as needed). UI/UX review and general availability are later, separately approved work.

**Latest pre-index scoped evidence:** [PostgreSQL transaction CI 41047237072](https://github.com/tushar1669/prize-manager/actions/runs/41047237072), [Excel/A4 QA 41047237128](https://github.com/tushar1669/prize-manager/actions/runs/41047237128), [migration guard 41047236999](https://github.com/tushar1669/prize-manager/actions/runs/41047236999): PASS. [Overall CI 41047237052](https://github.com/tushar1669/prize-manager/actions/runs/41047237052): FAIL (authenticated QA gate), not release green.

## Existing queue to preserve, not absorb into the current release

**[Post-template V2 non-blocking backlog](docs/BACKLOG_POST_TEMPLATE_V2.md)** — five recorded UX/copy/flow follow-ups, including Prize-tab hierarchy, density, apply wording, Team mode discoverability and micro-polish. They are **not prerequisites** for the current safety-focused V2 release. Preserve that file and its original non-blocking designation.

**[PROJECT_STATE.md](PROJECT_STATE.md)** — dated 28 September 2026; historical canonical operational notes and older planned work. It is **not a current, verified October priority ordering**, and must not silently be converted into P0/P1 tickets.

## Inventory and ordering

P0/P1/P2 project-wide inventory is **UNKNOWN until an owner-approved normalized inventory exists**. Do not claim there are no P0/P1 items. During incomplete canonical normalization, existing `AGENTS.md`, `PROJECT_STATE.md` and approved design/QA/spec decisions retain authority. Execute the active release item; do not start unrelated normalization.

## Next exact action

Verify a direct, project-specific production recovery/restore path using connected existing tools; if unavailable, block risky database execution and report the precise missing proof or minimal owner action. Do not merge, deploy, enable canaries or update main merely to publish this index.
