// Shared extraction constants (Phase J / LIST B). Hoisted here so the trust layer
// (extract/trustCheck.ts) and the commit mapper (commit-extraction/mapper.ts) match
// byte-for-byte instead of maintaining two independent copies that could silently drift.

// Team/institutional prize names (Best Academy, Best School…). These are flagged for
// review and never auto-committed as individual prize categories.
export const TEAM_PRIZE_NAME = /\b(academy|school|library|club|college|institution)\b/i;

// Strict ISO calendar date (YYYY-MM-DD), used to gate date grounding and commit mapping.
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
