/**
 * Master email allowlist - only these emails can access Master pages/actions
 * This is a hard security boundary enforced in both frontend and backend logic.
 */
export const MASTER_EMAIL_ALLOWLIST: readonly string[] = [
  'chess.tushar@gmail.com'
] as const;

/**
 * Check if an email is in the master allowlist
 */
export function isEmailAllowedMaster(email: string | null | undefined): boolean {
  if (!email) return false;
  return MASTER_EMAIL_ALLOWLIST.includes(email.toLowerCase());
}
