# PR #484 — Team Ranking v2 atomic SQL isolated Postgres contract evidence

**Date:** 29 October 2026. **Current item:** draft v2 SQL writer **isolated transactional QA implemented and VERIFIED**. **Operational Team v2 Save still NOT IMPLEMENTED / RELEASE BLOCKED.** Do not treat database-only QA as proof that a server has authenticated/re-scored awards.

## Scope and exact source
[Draft commit 5c0d7a9708dca7888918783e7bb9ffe2ac5c8046](https://github.com/tushar1669/prize-manager/commit/5c0d7a9708dca7888918783e7bb9ffe2ac5c8046), based on current main `104aa4221016091ed4ca1b15a033f062da44d178`, adds **only** `qa/team-v2/{isolated-schema.sql,seed.sql,atomic-contract.sql,concurrent.sh}` and `.github/workflows/team-v2-atomic-postgres.yml`. No SQL migration, client, allocation algorithm, Edge deployment, production schema, publications or source award calculation changed.

## Runtime-equivalent isolated SQL checks
[GitHub Actions 40905054967](https://github.com/tushar1669/prize-manager/actions/runs/40905054967): **SUCCESS** in an ephemeral `postgres:17` service attached to GitHub Actions. It loads a **minimal synthetic** representation of affected tables and roles, then applies **unchanged** real candidate migrations:
- `20261025193000_team_tiebreak_v2_additive.sql`
- `20261027080000_team_v2_adjudicated_atomic_version.sql`

It confirms: (1) `authenticated` and `anon` roles lack direct EXECUTE; (2) a browser-role call cannot reach the protected writer; (3) the service-role procedure rejects an unauthorized actor; (4) a stale expected version is rejected; (5) bad team total causes **full transaction rollback**, including individually awarded rows; (6) a synthetically consistent first-version ruling writes one individual plus one team award into the same version; (7) publication version pin is unchanged; (8) a replay of expected version zero fails; (9) two **separate concurrent PostgreSQL connections** contending for the same version yield exactly **one commit and one stale rejection**, with no partial duplicate version.

**Boundary:** These tests directly invoke the draft SQL using a fabricated *synthetic* scorer/ruling payload. They prove SQL access/version/atomicity properties under the minimal fixture, **not** that regulations, eligibility, true score ties, selected rosters, multi-group prize completeness or official ruling provenance are authentic. They do **not** use the full production schema, existing RLS policies/triggers, authenticated Edge client, deployment/recovery, backup/restore or UI. Some privilege and integration behavior may therefore differ from the live database. This ephemeral service is not a Supabase branch and incurred no new Supabase project/plan.

## Release blocking dependencies confirmed
- There is no active `commit_team_v2_adjudicated_version` or `commit_finalize_version_atomic` production RPC, and production lacks both Team v2 ranking/audit columns. All draft SQL remains unapplied.
- No server-owned v2 finalization route independently invokes the trusted individual allocator, full Team v2 scorer, validates genuine ordered source TBs and official decisions, checks all active prize/group inventory, and submits the complete exact-row proposal at a source-consistent allocation version. Pure checks and read-only ruling review cannot substitute for this.
- Legacy `finalize` remains uncoordinated with the proposed version-locked writer; the source explicitly blocks configured v2 groups but the complete old-writer/legacy tie-RPC fence and genuine production recovery are not verified.
- There is no isolated authenticated Supabase QA backend currently available. **Overall CI is not green** until required AGENTS.md lint/unit/e2e conditions and integrated release runbooks pass. No tests were weakened; owner previously declined additional paid Supabase resources.

## Outcome and next action
**CURRENT ITEM:** Ephemeral SQL atomic safety contract — **VERIFIED** (synthetic DB only), release **BLOCKED**. **PRIORITY:** backlog ID and P0/P1 inventory UNKNOWN because `BACKLOG.md` absent. No change in live website.

**NEXT EXACT ACTION:** Implement the missing authenticated, server-owned Team v2 Save caller on a draft-only ref, deriving every individual award and team group/prize/ruling from independent trusted server sources and refusing a save when freshness or completeness is unknown. Re-verify its actual DB interactions and legacy-writer fencing on isolated fixtures before requesting live release. Do not enable UI Save, merge, apply SQL or publish without all safety and recovery gates. Owner action not needed for this isolated SQL test cycle.
