# Edge Function Auth Guardrails

## `parseWorkbook` must keep `verify_jwt = true`

`parseWorkbook` handles organizer import payloads and runs with elevated privileges in the edge environment. If JWT verification is disabled, unauthenticated callers could hit a privileged endpoint directly.

For this reason, `supabase/config.toml` must continue to include:

```toml
[functions.parseWorkbook]
verify_jwt = true
```

Only explicitly public endpoints (for example `pmPing` and `publicTeamPrizes`) should have `verify_jwt = false`.

## Deploying so `config.toml` auth settings are applied

When deploying `parseWorkbook`, use the function deploy command against the target project:

```bash
supabase functions deploy parseWorkbook --project-ref <ref>
```

Deployment must include the repository's `supabase/config.toml` in the deploy artifact/context so per-function JWT settings are applied in production.

## Regression smoke test

Use the repo smoke script to verify unauthenticated access is blocked:

```bash
scripts/smoke/parseWorkbook-auth.sh \
  --url https://<project-ref>.supabase.co/functions/v1/parseWorkbook
```

Expected behavior:
- No `Authorization` header => `401 Unauthorized`.
- Optional valid user JWT provided => non-`401` response.
