# Edge Function Auth Guardrails

## Canonical function auth config location

Use exactly one canonical config file for function JWT settings:

- `supabase/config.toml`

Do not keep alternate config variants for edge function auth in this repository. Production deploys should always read from this single file.

## `parseWorkbook` must keep `verify_jwt = true`

`parseWorkbook` accepts organizer upload payloads and runs privileged server-side checks (including tournament authorization and storage writes). Keeping `verify_jwt = true` ensures the Supabase gateway rejects unauthenticated browser/API callers before privileged logic can run.

For this reason, `supabase/config.toml` must continue to include:

```toml
[functions.parseWorkbook]
verify_jwt = true
```

Only explicitly public endpoints (`pmPing` and `publicTeamPrizes`) should use `verify_jwt = false`. All other functions remain `verify_jwt = true`.

## Browser CORS requirements for `parseWorkbook`

`parseWorkbook` is called from the browser app (`https://prize-manager.com`), so preflight and JSON responses must include CORS headers for the request to be accepted by the browser.

At minimum, the CORS allow-headers set must cover:

- `authorization`
- `apikey`
- `content-type`

When these headers are missing (or not present on error responses), browsers can block requests before the response body is visible to the client.

## Validate in browser DevTools + Supabase logs (no CLI)

1. Open `https://prize-manager.com`, trigger a workbook import, and inspect the Network tab for the `parseWorkbook` request.
2. Confirm the preflight (`OPTIONS`) succeeds and the response includes CORS headers.
3. Confirm the main request response (200/4xx/5xx) also includes CORS headers and JSON body.
4. In Supabase Dashboard, open **Edge Functions** → **parseWorkbook** → **Logs**.
5. Verify request outcomes in logs match browser-observed status codes (authorized runs, forbidden tournament access, and parse failures).
