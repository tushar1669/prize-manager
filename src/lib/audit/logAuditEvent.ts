/**
 * Logs structured error events to the audit_events table.
 * 
 * Sanitizes context to strip tokens, auth headers, cookies.
 * Hashes email to avoid storing PII.
 */

import { supabase } from "@/integrations/supabase/client";

interface AuditEventInput {
  eventType: string;
  severity?: string;
  message: string;
  friendlyMessage?: string;
  suggestedAction?: string;
  referenceId: string;
  route?: string;
  context?: Record<string, unknown>;
}

const SENSITIVE_KEYS = new Set([
  "authorization",
  "access_token",
  "refresh_token",
  "token",
  "cookie",
  "set-cookie",
  "apikey",
  "password",
  "secret",
  "session",
  "x-api-key",
]);

/**
 * Recursively sanitize a context object, redacting sensitive keys.
 */
function sanitizeContext(obj: unknown, depth = 0): unknown {
  if (depth > 5) return "[max depth]";
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    // Redact JWT-like strings
    if (/^eyJ[A-Za-z0-9_-]+\./.test(obj)) return "[REDACTED_JWT]";
    // Redact long base64 strings that look like tokens
    if (obj.length > 100 && /^[A-Za-z0-9+/=_-]+$/.test(obj)) return "[REDACTED_TOKEN]";
    return obj;
  }
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.slice(0, 20).map((item) => sanitizeContext(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = sanitizeContext(value, depth + 1);
    }
  }
  return sanitized;
}

/**
 * Simple SHA-256 hash for emails (returns hex string).
 * Returns null if crypto is unavailable.
 */
async function hashEmail(email: string): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const encoder = new TextEncoder();
    const data = encoder.encode(email.toLowerCase().trim());
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

/**
 * Log an audit event to the audit_events table.
 * Fire-and-forget — never throws.
 */
export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    const userId = session?.user?.id ?? null;
    const email = session?.user?.email ?? null;
    const emailHash = email ? await hashEmail(email) : null;

    const route = input.route ?? (typeof window !== "undefined" ? window.location.pathname : null);
    const sanitizedContext = sanitizeContext(input.context ?? {}) as Record<string, unknown>;

    // Truncate message to prevent oversized inserts
    const message = (input.message || "").slice(0, 2000);

    const { error } = await supabase.from("audit_events").insert([{
      event_type: input.eventType,
      severity: input.severity ?? "error",
      reference_id: input.referenceId,
      message,
      friendly_message: input.friendlyMessage?.slice(0, 500) ?? null,
      suggested_action: input.suggestedAction?.slice(0, 500) ?? null,
      route,
      user_id: userId,
      user_email_hash: emailHash,
      context: sanitizedContext as unknown as Record<string, never>,
    }]);

    if (error) {
      // Silent fail — don't let audit logging break the app
      console.warn("[audit] Failed to log event:", error.message);
    }
  } catch (err) {
    console.warn("[audit] Unexpected error logging event:", err);
  }
}
