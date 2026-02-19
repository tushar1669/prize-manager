/**
 * Normalizes raw errors into user-friendly messages with reference IDs.
 * 
 * Usage:
 *   const normalized = normalizeError(error);
 *   toast.error(normalized.friendlyMessage);
 */

export type ErrorSeverity = "error" | "warn" | "info";

export interface NormalizedError {
  friendlyMessage: string;
  suggestedAction: string;
  severity: ErrorSeverity;
  referenceId: string;
  rawCode?: string;
  eventType: string;
}

function generateReferenceId(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

type ErrorPattern = {
  test: (msg: string) => boolean;
  friendly: string;
  action: string;
  severity: ErrorSeverity;
  eventType: string;
};

const PATTERNS: ErrorPattern[] = [
  // Auth errors
  {
    test: (m) => /invalid login credentials/i.test(m),
    friendly: "Incorrect email or password.",
    action: "Double-check your credentials or use 'Forgot password'.",
    severity: "error",
    eventType: "auth_error",
  },
  {
    test: (m) => /email not confirmed/i.test(m),
    friendly: "Your email hasn't been confirmed yet.",
    action: "Check your inbox for a confirmation link, or resend it.",
    severity: "warn",
    eventType: "auth_error",
  },
  {
    test: (m) => /already registered/i.test(m),
    friendly: "This email is already registered.",
    action: "Try signing in instead, or use 'Forgot password'.",
    severity: "warn",
    eventType: "auth_error",
  },
  {
    test: (m) => /expired/i.test(m) && (/link|token|session|otp/i.test(m)),
    friendly: "This link or session has expired.",
    action: "Request a new link or sign in again.",
    severity: "warn",
    eventType: "auth_error",
  },
  {
    test: (m) => /rate limit|too many requests/i.test(m),
    friendly: "Too many requests. Please wait a moment.",
    action: "Wait 30–60 seconds before trying again.",
    severity: "warn",
    eventType: "rate_limit",
  },
  {
    test: (m) => /not authorized|forbidden|42501|not_authorized/i.test(m),
    friendly: "You don't have permission for this action.",
    action: "Contact your administrator if you believe this is an error.",
    severity: "error",
    eventType: "authorization_error",
  },
  // Network errors
  {
    test: (m) => /fetch|network|ERR_NETWORK|ECONNREFUSED|Failed to fetch/i.test(m),
    friendly: "Network error — unable to reach the server.",
    action: "Check your internet connection and try again.",
    severity: "error",
    eventType: "network_error",
  },
  {
    test: (m) => /timeout|ETIMEDOUT|aborted/i.test(m),
    friendly: "The request timed out.",
    action: "Try again. If this persists, the server may be under heavy load.",
    severity: "error",
    eventType: "timeout_error",
  },
  // RLS / DB errors
  {
    test: (m) => /row-level security|violates row-level/i.test(m),
    friendly: "A data access rule blocked this operation.",
    action: "Ensure you're signed in and have the correct permissions.",
    severity: "error",
    eventType: "rls_error",
  },
  {
    test: (m) => /duplicate key|unique constraint|already exists/i.test(m),
    friendly: "This record already exists.",
    action: "Check for duplicates before creating a new entry.",
    severity: "warn",
    eventType: "constraint_error",
  },
  // Import errors
  {
    test: (m) => /no valid header row|rank and name columns/i.test(m),
    friendly: "Could not find required columns (Rank, Name) in the file.",
    action: "Ensure your Excel file has 'Rank' and 'Name' column headers.",
    severity: "error",
    eventType: "import_error",
  },
  {
    test: (m) => /no sheets found|empty payload/i.test(m),
    friendly: "The uploaded file appears to be empty or invalid.",
    action: "Re-export the file from Swiss-Manager and try again.",
    severity: "error",
    eventType: "import_error",
  },
  // Publish errors
  {
    test: (m) => /tournament.*not found/i.test(m),
    friendly: "Tournament not found.",
    action: "It may have been deleted. Go back to your dashboard.",
    severity: "error",
    eventType: "not_found",
  },
];

/**
 * Normalizes any error into a user-friendly structure.
 */
export function normalizeError(error: unknown): NormalizedError {
  const referenceId = generateReferenceId();
  const rawMessage = extractMessage(error);
  const rawCode = extractCode(error);

  for (const pattern of PATTERNS) {
    if (pattern.test(rawMessage)) {
      return {
        friendlyMessage: pattern.friendly,
        suggestedAction: pattern.action,
        severity: pattern.severity,
        referenceId,
        rawCode,
        eventType: pattern.eventType,
      };
    }
  }

  // Fallback
  return {
    friendlyMessage: "Something went wrong. Please try again.",
    suggestedAction: "If this continues, contact support with the reference ID below.",
    severity: "error",
    referenceId,
    rawCode,
    eventType: "unknown_error",
  };
}

function extractMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
    if (typeof obj.error_description === "string") return obj.error_description;
    // Supabase edge function error shape
    if (obj.context && typeof obj.context === "object") {
      const ctx = obj.context as Record<string, unknown>;
      if (ctx.body && typeof ctx.body === "object") {
        const body = ctx.body as Record<string, unknown>;
        if (typeof body.error === "string") return body.error;
      }
    }
  }
  return String(error);
}

function extractCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const obj = error as Record<string, unknown>;
  if (typeof obj.code === "string") return obj.code;
  if (typeof obj.status === "number") return String(obj.status);
  return undefined;
}

/**
 * Formats a normalized error for display in a toast.
 * Returns the message with the reference ID appended.
 */
export function toastMessage(normalized: NormalizedError): string {
  return `${normalized.friendlyMessage} (Ref: ${normalized.referenceId})`;
}
