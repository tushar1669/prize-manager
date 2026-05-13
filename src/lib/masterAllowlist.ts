/**
 * Master access is enforced server-side by the SQL function `public.is_master()`,
 * which checks `master_allowlist` joined with `user_roles` (role='master', is_verified=true).
 *
 * The client no longer ships the master email list. The `useUserRole` hook reads
 * the role from the database and uses that as the only client-side signal for
 * showing/hiding admin-only navigation. This is purely a UX hint — the real
 * security boundary is the server-side RLS policies and `is_master()`.
 */
export const MASTER_EMAIL_ALLOWLIST: readonly string[] = [] as const;

/**
 * Deprecated client-side allowlist check. Always returns true — gating is done
 * by the server-side `is_master()` function and the `role` returned from
 * `useUserRole`. Kept as a no-op so existing callers continue to compile.
 */
export function isEmailAllowedMaster(_email: string | null | undefined): boolean {
  return true;
}
