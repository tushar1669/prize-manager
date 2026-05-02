# Supabase Migration Deployment SOP

## Purpose
Prevent schema drift between this repository and production by requiring an explicit, recorded migration application process for every release that includes Supabase migration changes.

## When this SOP is required
Use this SOP whenever a PR adds or modifies files in:

- `supabase/migrations/*`

Also run this SOP if production behavior indicates missing schema objects (tables, columns, views, functions, policies, or RPCs) that exist in repository migrations.

## How to identify migration PRs/files
Before release:

1. Check the PR file list for any path under `supabase/migrations/`.
2. Verify migration file names included in the PR (for example: `supabase/migrations/<timestamp>_<name>.sql`).
3. Copy those filenames into your deployment notes and into `docs/PRODUCTION_MIGRATION_LEDGER.md` after application.

Quick command:

```bash
git diff --name-only origin/main...HEAD | rg '^supabase/migrations/'
```

If output is non-empty, this SOP is mandatory.

## Manual workflow (Supabase SQL Editor)
Use this as the immediate, canonical fallback when CLI setup is unavailable.

1. Open Supabase Dashboard for the target production project.
2. Go to **SQL Editor**.
3. For each migration file from the PR:
   - Open the migration SQL in this repo.
   - Paste SQL into SQL Editor.
   - Run it once in production.
4. Save execution evidence (timestamp + migration filename + operator).
5. Run verification SQL for each migrated object/RPC.
6. Record each migration in `docs/PRODUCTION_MIGRATION_LEDGER.md`.

## Optional workflow (Supabase CLI)
Use this when Supabase CLI is available and linked to the correct project.

Example patterns (team must use the command that matches local setup):

```bash
supabase link --project-ref <project_ref>
supabase db push
```

or

```bash
supabase migration up
```

After CLI apply, still run verification SQL and update `docs/PRODUCTION_MIGRATION_LEDGER.md`.


## CI migration guard (PR-time)
A GitHub Actions workflow (`.github/workflows/migration-guard.yml`) runs on pull requests that change files under `supabase/migrations/**`.

To satisfy the acknowledgement gate, either:
- check the PR template item: `If this PR adds/changes \`supabase/migrations/*\`, production migration application + verification plan is documented.`
- or apply the PR label `migration-acknowledged`.

This guard does not apply migrations, does not invoke Supabase CLI, and does not touch production. It only enforces acknowledgement and posts a sticky reminder comment.

Ledger tracking is still required after production migration application and verification, and frontend publish remains blocked until verification is complete.

## Verification checklist (required)
- [ ] All migration files from the release PR were applied in production.
- [ ] Required tables/views/functions/RPCs exist after apply.
- [ ] Verification SQL was run and result captured.
- [ ] A ledger row was added per migration or per manual fix batch in `docs/PRODUCTION_MIGRATION_LEDGER.md`.
- [ ] Release notes include who applied migrations and when.
- [ ] **Frontend publish is blocked until DB verification passes.**

## Release gate rule
**Do not publish frontend (Lovable or any hosting publish step) until database migration verification passes.**

Publishing frontend does not guarantee Supabase migrations are applied.

## Rollback / escalation
If a migration fails or verification does not match expected schema:

1. Stop release and do not publish frontend.
2. Escalate to engineering owner + DB owner immediately.
3. Capture failed SQL, error message, and partial state.
4. Decide recovery path:
   - apply corrective SQL,
   - revert application rollout,
   - or prepare a follow-up migration.
5. Record incident notes in `docs/PRODUCTION_MIGRATION_LEDGER.md` and release notes.
