# AGENTS

## Security & Authorization Rules
- **Master features must be gated server-side.** UI checks are never sufficient.
  - ✅ Example: verify `user.role === "master"` (or equivalent) in the server/API route.
  - ❌ Anti-example: hide buttons but allow the API route without a role check.
- **Edge Functions using the service role must enforce tournament ownership/authorization.**
  - ✅ Example: validate `tournament_id` belongs to the requester before any write.
  - ❌ Anti-example: accept any `tournament_id` when using a service key.

## PII Logging Rules
- **Never log PII** (emails, DOB, phone, addresses, etc.).
  - ✅ Example: log anonymized IDs or counts.
  - ❌ Anti-example: `console.log("email", user.email)`.

## Data Access Rules
- **Public pages must only expose published tournament data.**
  - ✅ Example: filter by `published = true` in queries.
  - ❌ Anti-example: returning drafts in public endpoints.

## Before Merging (required)
- `npm run lint`
- `npm run test:unit`
- existing e2e subset (current Playwright selection)
