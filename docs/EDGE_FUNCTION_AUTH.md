# Edge Function Auth Guardrails

## Canonical function auth config location

Use exactly one canonical config file for function JWT settings:

- `supabase/config.toml`

Do not keep alternate config variants for edge function auth in this repository. Production deploys should always read from this single file.

## `parseWorkbook` must keep `verify_jwt = true`

`parseWorkbook` handles organizer import payloads and runs with elevated privileges in the edge environment. If JWT verification is disabled, unauthenticated callers could hit a privileged endpoint directly.

For this reason, `supabase/config.toml` must continue to include:

```toml
[functions.parseWorkbook]
verify_jwt = true
```

Only explicitly public endpoints (`pmPing` and `publicTeamPrizes`) should have `verify_jwt = false`. All other functions remain `verify_jwt = true`.

## Deploy instructions (no local CLI required)

### Option A: Dashboard toggle (if available)

1. In Supabase Dashboard, open your project.
2. Go to **Edge Functions** → **parseWorkbook**.
3. Find the **Verify JWT** / **Enforce JWT** toggle in function settings.
4. Ensure it is **enabled**.
5. Save/redeploy if prompted.

### Option B: One-time CLI deploy from any machine

If the dashboard toggle is unavailable, run Supabase CLI once from any machine:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase functions deploy parseWorkbook
```

This applies the repository's `supabase/config.toml` function JWT settings.

## 2-step smoke test (gateway + logs)

### Run smoke checks

Node script (preferred):

```bash
PARSE_WORKBOOK_URL="https://<project-ref>.supabase.co/functions/v1/parseWorkbook" \
node scripts/smoke/parseWorkbook-auth.mjs
```

Optional authenticated step:

```bash
PARSE_WORKBOOK_URL="https://<project-ref>.supabase.co/functions/v1/parseWorkbook" \
SUPABASE_USER_JWT="<valid-user-jwt>" \
node scripts/smoke/parseWorkbook-auth.mjs
```

Curl alternative:

```bash
scripts/smoke/parseWorkbook-auth.sh \
  --url https://<project-ref>.supabase.co/functions/v1/parseWorkbook \
  --jwt "$SUPABASE_USER_JWT"
```

### Validate in dashboard logs

1. Open **Edge Functions** → **parseWorkbook** → **Logs**.
2. Execute unauthenticated request (step 1): expect `401` and no handler logs from function execution.
3. Execute authenticated request with valid JWT (step 2): expect non-`401` and corresponding function logs.
