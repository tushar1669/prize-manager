# Production Deployment Runbook

Use this exact order in production:

1. **Database migrations**
2. **Edge Functions deploy**
3. **Frontend publish**

Expected Supabase project ref: `nvjjifnzwrueutbirpde`.

## 1) Deploy database migrations first

```bash
# Run from repo root
cd /workspace/prize-manager

# Verify you are linked to the production project
supabase status
supabase projects list
supabase link --project-ref nvjjifnzwrueutbirpde

# Push all pending migrations to production
supabase db push
```

## 2) Deploy edge functions second

```bash
# Deploy all edge functions in this repo
supabase functions deploy allocatePrizes
supabase functions deploy allocateInstitutionPrizes
supabase functions deploy finalize
supabase functions deploy generatePdf
supabase functions deploy parseWorkbook
supabase functions deploy pmPing
supabase functions deploy publicTeamPrizes
```

## 3) Publish frontend last

```bash
# Build before publish
npm run build

# Then publish using your hosting platform's production command/process.
```

## Quick verification

- Confirm migration-backed RPCs exist in production before frontend traffic:
  - `get_tournament_access_state`
  - `get_public_tournament_results`
- Confirm `generatePdf` and `publicTeamPrizes` are deployed from the same commit as frontend.
