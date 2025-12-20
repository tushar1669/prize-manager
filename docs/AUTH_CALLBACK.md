# Auth Callback Flow

## Purpose

Documents the `/auth/callback` handler behavior for email confirmation redirects.

## What It Protects

- Session establishment from email confirmation links
- Graceful handling of expired/invalid links
- Proper routing based on user verification status

---

## Supported Flows

The callback handler (`src/pages/AuthCallback.tsx`) supports multiple auth patterns:

### 1. PKCE Flow (`?code=...`)

```
Email link: /auth/callback?code=abc123
```

- Calls `supabase.auth.exchangeCodeForSession(code)`
- On success → redirect based on role
- On error → show expired/error UI

### 2. Hash Token Flow (`#access_token=...&refresh_token=...`)

```
Email link: /auth/callback#access_token=xyz&refresh_token=abc
```

- Calls `supabase.auth.setSession({ access_token, refresh_token })`
- On success → redirect based on role
- On error → show expired/error UI

### 3. Error Params (`?error=...`)

```
Email link: /auth/callback?error=access_denied&error_description=Link%20expired
```

- Detects `expired` / `invalid` keywords → shows "Link Expired" UI
- Other errors → shows generic error UI

### 4. Missing Tokens (Recovery)

```
Email link: /auth/callback (no params, no hash)
```

- Checks for existing session → redirect if authenticated
- No session → shows "Confirmation Required" UI with resend option

---

## Redirect Rules After Auth

```
redirectAfterAuth():
  ├── role === 'master' OR is_verified === true  →  /dashboard
  └── role === 'organizer' AND is_verified === false  →  /pending-approval
```

**Where enforced:** Lines 199-223 in `src/pages/AuthCallback.tsx`

---

## Resend Confirmation

When user needs to resend confirmation email:

```typescript
await supabase.auth.resend({
  type: 'signup',
  email: userEmail,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`
  }
});
```

**Critical:** Always uses `window.location.origin` to ensure redirects work across:
- Production domain
- Preview URLs (`.lovableproject.com`)
- Localhost (development)

---

## UI States

| Status    | UI Component         | User Action Available              |
|-----------|----------------------|------------------------------------|
| `loading` | Spinner              | Wait                               |
| `success` | Green checkmark      | Auto-redirect                      |
| `error`   | Red alert            | "Try Again" / "Go to Sign In"      |
| `expired` | Amber refresh icon   | Resend confirmation email          |
| `missing` | Amber mail icon      | Resend confirmation / Sign in      |

---

## Debug Panel

In dev/preview environments only, shows:
- Detected flow type
- Presence of `code`, `access_token`, `refresh_token`, `error`
- Current origin

**Where enforced:** Lines 267-283 in `src/pages/AuthCallback.tsx`, gated by `isDevOrPreview()`

---

## Gotchas

1. **Hash params vs query params:** PKCE uses `?code=`, legacy flow uses `#access_token=`
2. **emailRedirectTo must match Supabase URL config:** Add all domains to Supabase Auth → URL Configuration
3. **Resend uses `type: 'signup'`:** Not `type: 'email'` (which is for email change)

---

## How to Test Manually

1. **Fresh signup:**
   - Sign up → check email → click link
   - Should land on `/pending-approval` (new organizer)

2. **Expired link:**
   - Wait for link to expire (or use an old one)
   - Should show "Link Expired" UI with resend option

3. **Already confirmed:**
   - Click confirmation link again after confirming
   - Should show error or redirect to dashboard (if session exists)

4. **Resend flow:**
   - On expired/missing UI, enter email → click resend
   - Check inbox for new confirmation email
