# Security & Access Control

## Purpose

Documents the role-based access control system, master allowlist, and verification lifecycle to prevent accidental regressions.

## What It Protects

- Master-only pages (`/master-dashboard`, `/admin/users`, `/admin/martech`, `/admin/coupons`, `/admin/tournaments`)
- Unverified organizer isolation (pending approval flow)
- Role escalation attacks (no client-side role assignment)

---

## Roles

| Role       | Description                                      |
|------------|--------------------------------------------------|
| `organizer`| Default role for new signups (unverified initially) |
| `master`   | Superuser access, can approve organizers         |

**Where stored:** `public.user_roles` table with `role` enum and `is_verified` boolean.

---

## Master Allowlist

Hard security boundary: only emails in the allowlist can access master functions.

- **Client-side:** `src/lib/masterAllowlist.ts` → `MASTER_EMAIL_ALLOWLIST` array, `isEmailAllowedMaster()` function
- **Server-side (real security):** `is_master()` PostgreSQL function checks `master_allowlist` table

**Invariant:** No UI action can grant master access. Only DB-level allowlist controls this.

---

## Verification Lifecycle

```
Signup → Confirm Email → Unverified Organizer → Master Approves → Verified Organizer
           │                    │                      │
           │                    └──→ /pending-approval │
           │                                           │
           └───────────────────────────────────────────┘
                              ↓
                         /dashboard
```

1. User signs up → `user_roles` row created with `role='organizer'`, `is_verified=false`
2. User confirms email (Supabase Auth)
3. User lands on `/pending-approval` until master approves
4. Master visits `/master-dashboard` → approves organizer → sets `is_verified=true`
5. On next load, verified organizer goes to `/dashboard`

**Where enforced:**
- `src/pages/PendingApproval.tsx` – displays pending UI, redirects if verified
- `src/hooks/usePendingApprovals.ts` – fetches unverified organizers for master
- `src/pages/MasterDashboard.tsx` – approve/reject actions

---

## Route Guards

The `ProtectedRoute` component guards authenticated routes:

| Prop             | Effect                                          |
|------------------|-------------------------------------------------|
| (default)        | Requires auth, redirects unverified to `/pending-approval` |
| `requireMaster`  | Additionally requires master role               |

**Master-only routes:**
- `/master-dashboard` – organizer approvals
- `/admin/users` – organizer approvals in admin layout
- `/admin/martech` – non-coupon martech placeholder
- `/admin/coupons` – coupon code management and analytics
- `/admin/tournaments` – view all tournaments

**Where enforced:**
- `src/components/ProtectedRoute.tsx` – route wrapper
- `src/App.tsx` – route definitions with `requireMaster={true}`

---

## RLS vs Client Responsibility

| Layer   | Purpose                                    |
|---------|--------------------------------------------|
| Client  | UX convenience (hide buttons, redirect)    |
| RLS     | **Real security** (blocks unauthorized DB access) |

**Critical:** Never trust client-side checks alone. All sensitive data must be protected by RLS policies that use `auth.uid()` and `is_master()`.

---

## Gotchas

1. **Master check is dual:** Both `role === 'master'` in DB AND email in allowlist required
2. **SECURITY DEFINER functions bypass RLS:** Any such function must be reviewed as a security boundary
3. **Profiles table is public-readable:** Only non-sensitive data (email, created_at)

---

## How to Test Manually

1. **Organizer flow:**
   - Sign up with new email
   - Confirm email → should land on `/pending-approval`
   - Try navigating to `/master-dashboard` → should redirect to `/dashboard`

2. **Master approval:**
   - Log in as master (allowlisted email)
   - Go to `/master-dashboard` → see pending organizer
   - Approve → organizer can now access `/dashboard`

3. **Master route guard:**
   - Log in as verified organizer (not in allowlist)
   - Navigate to `/master-dashboard` → should redirect to `/dashboard`
   - Navigate to `/admin/tournaments` → should redirect to `/dashboard`
   - Navigate to `/admin/martech` or `/admin/coupons` → should redirect to `/dashboard`
