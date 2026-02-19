/**
 * Registers global error handlers (window.onerror, unhandledrejection)
 * and logs them to audit_events.
 * 
 * Call once at app startup (main.tsx).
 */

import { logAuditEvent } from "./logAuditEvent";

let installed = false;

export function installGlobalErrorCapture(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  window.onerror = (message, source, lineno, colno, error) => {
    const msg = typeof message === "string" ? message : "Unknown runtime error";
    const referenceId = generateShortId();

    logAuditEvent({
      eventType: "runtime_error",
      severity: "error",
      message: msg,
      referenceId,
      context: {
        source: source ?? null,
        lineno: lineno ?? null,
        colno: colno ?? null,
        stack: error?.stack?.slice(0, 1000) ?? null,
      },
    });

    // Don't suppress — let default handler run
    return false;
  };

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    const referenceId = generateShortId();

    logAuditEvent({
      eventType: "unhandled_rejection",
      severity: "error",
      message: msg.slice(0, 2000),
      referenceId,
      context: {
        stack: reason instanceof Error ? reason.stack?.slice(0, 1000) : null,
        type: typeof reason,
      },
    });
  });
}

function generateShortId(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
