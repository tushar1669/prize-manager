/**
 * Payment-specific business rule checks (Phase 2A).
 *
 * Generic grounding (is the value in the OCR text?) runs in trustCheck.ts.
 * This file adds the business invariants that cannot be checked by
 * grounding alone:
 *   1. UTR format — 8–22 alphanumeric characters (NPCI spec)
 *   2. UTR duplicate — same UTR cannot be reused across non-rejected payments
 *   3. Amount match — extracted amount must equal expected price ±₹1
 *   4. Payee VPA — must be present, and must be the platform's own UPI ID
 *   5. Date freshness — transaction date must be within the last 30 days
 *   6. Direction — the receipt must prove money left the payer, not arrived
 *   7. Required fields — a screenshot with no amount, UTR or date is unreadable
 *
 * The caller (index.ts) MUST force status = 'needs_review' for
 * payment_screenshot regardless of how many flags this returns.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { FieldFlag } from "./trustCheck.ts";

const UTR_PATTERN = /^[A-Za-z0-9]{8,22}$/;
const AMOUNT_TOLERANCE_INR = 1;   // OCR rounding: ₹499.9 is close enough to ₹500
const MAX_AGE_DAYS = 30;          // Screenshots older than this are flagged
const ALLOWED_VPA_SECRET = "PLATFORM_PAYEE_VPA"; // Supabase Edge Function secret

/**
 * Direction markers, read off the OCR text of the receipt itself.
 * Schema v3 dropped `direction_label`, so the model no longer gets a say in which way
 * the money moved — the labels the PSP printed decide it. Whitespace is flexible because
 * OCR reflows these across lines; matching is case-insensitive.
 */
const OUTGOING_MARKERS = ["debited from", "debit amount", "paid to", "money sent", "sent to"];
const INCOMING_MARKERS = ["credited to", "received from", "money received", "credit amount"];

const toMarkerPattern = (phrase: string) => new RegExp(phrase.split(" ").join("\\s+"), "i");
const OUTGOING_PATTERNS = OUTGOING_MARKERS.map(toMarkerPattern);
const INCOMING_PATTERNS = INCOMING_MARKERS.map(toMarkerPattern);

/** Null, undefined, or a string with nothing but whitespace in it. */
function isAbsent(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && !value.trim());
}

/**
 * TypeScript mirror of the SQL `public.normalize_utr`:
 *   upper(regexp_replace(coalesce(p_utr, ''), '[^A-Za-z0-9]', '', 'g'))
 *
 * The strip-then-upper ORDER IS LOAD-BEARING. After stripping every character
 * outside [A-Za-z0-9], only ASCII remains, so JS `toUpperCase()` and Postgres
 * `upper()` cannot diverge. Reversed (upper first, then strip) the two differ:
 * JS uppercases 'ß' to 'SS' and 'ı' to 'I', which survive the strip as letters,
 * while Postgres `upper()` leaves them alone and the strip then deletes them.
 *
 * This mirror is FROZEN alongside the SQL function. The entries in
 * `uq_tournament_payments_utr_active` were built with `normalize_utr` as of
 * index creation, so changing either side silently invalidates the index —
 * neither this function nor the SQL one may be "improved" independently.
 */
export function normalizeUtr(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * The expected amount is NOT computed here. `public.expected_payment_amount_inr`
 * is the single implementation of "what should this person pay for this
 * tournament" — the very same function `submit_tournament_payment_claim`
 * validates the claimed amount against (PF1-B).
 *
 * This file used to carry a third copy of the rule: its own player count, its
 * own 0/500/1000 ladder and its own coupon query. That copy counted players
 * LIVE, so it disagreed with the billing basis the moment anyone deleted a
 * player — exactly the E2 scenario the watermark closed. Do not reintroduce it.
 *
 * Returning null on failure preserves today's behaviour: no `amount_mismatch`
 * flag is raised. That is a fail-open and it is deliberate — turning "check
 * skipped" into a blocking condition is F2's job, not this file's.
 */
async function getExpectedAmountInr(
  tournamentId: string,
  userId: string,
  admin: SupabaseClient,
): Promise<number | null> {
  const { data, error } = await admin.rpc("expected_payment_amount_inr", {
    p_tournament_id: tournamentId,
    p_user_id: userId,
  });
  if (error) {
    console.warn("expected_payment_amount_inr failed; skipping amount check", error);
    return null;
  }

  // RETURNS TABLE, so PostgREST delivers an array holding a single row.
  const row = Array.isArray(data) ? data[0] : data;
  const expected = (row as { expected_amount_inr?: unknown } | null)?.expected_amount_inr;
  return typeof expected === "number" && Number.isFinite(expected) ? expected : null;
}

export async function runPaymentTrustChecks(
  payload: Record<string, unknown>,
  tournamentId: string | null,
  userId: string | null,
  admin: SupabaseClient,
  ocrText: string,
): Promise<FieldFlag[]> {
  const flags: FieldFlag[] = [];

  // A UTR that is present at all gets BOTH checks below. They are independent:
  // a malformed UTR can still be a re-use of one we have already seen, so the
  // duplicate lookup must not hide behind a passing format check.
  const rawUtr = payload.utr;
  const utrTrimmed = typeof rawUtr === "string" ? rawUtr.trim() : "";

  // ── 1. UTR format ─────────────────────────────────────────────────────────
  if (utrTrimmed) {
    const utrClean = utrTrimmed.replace(/\s+/g, "");
    if (!UTR_PATTERN.test(utrClean)) {
      flags.push({ field: "utr", reason: "utr_format", severity: "high" });
    }
  }

  // ── 2. UTR duplicate ──────────────────────────────────────────────────────
  // Runs independently of the format check — both flags may fire on `utr`.
  if (utrTrimmed) {
    try {
      // Pass the RAW trimmed string, never normalizeUtr() output. The SQL
      // function normalizes both sides itself, so if the TS mirror above ever
      // drifts from the SQL definition, that drift cannot turn into a false
      // negative here (which would let a duplicate through unflagged).
      const { data, error } = await admin.rpc("utr_active_duplicate_exists", {
        p_utr: utrTrimmed,
      });
      if (error) {
        // Advisory only — no flag on failure. The hard block is
        // submit_tournament_payment_claim plus the
        // uq_tournament_payments_utr_active unique index, so a failed advisory
        // call can never let a duplicate actually be inserted. Flagging on
        // error would instead punish the honest payer for our outage.
        console.warn("utr_active_duplicate_exists failed; skipping duplicate flag", error);
      } else if (data === true) {
        flags.push({ field: "utr", reason: "utr_duplicate", severity: "high" });
      }
    } catch (err) {
      // Same reasoning as above: a thrown call is still just a missing advisory.
      console.warn("utr_active_duplicate_exists threw; skipping duplicate flag", err);
    }
  }

  // ── 3. Amount match ───────────────────────────────────────────────────────
  const extractedAmount = payload.amount_inr;
  if (
    typeof extractedAmount === "number" &&
    Number.isFinite(extractedAmount) &&
    tournamentId &&
    userId
  ) {
    const expected = await getExpectedAmountInr(tournamentId, userId, admin);
    if (expected !== null && Math.abs(extractedAmount - expected) > AMOUNT_TOLERANCE_INR) {
      flags.push({
        field: "amount_inr",
        reason: "amount_mismatch",
        severity: "high",
        expected,
        stated: extractedAmount,
      });
    }
  }

  // ── 4. Payee VPA — presence, then allow-list ──────────────────────────────
  // PLATFORM_PAYEE_VPA must be configured as a Supabase Edge Function secret.
  // If the secret is not set, the allow-list comparison is skipped (fail open, not
  // fail closed) — but a missing VPA is flagged either way, because otherwise a
  // screenshot that simply never shows a payee sails past the mismatch check.
  const allowedVpa = Deno.env.get(ALLOWED_VPA_SECRET)?.toLowerCase().trim();
  const payeeVpa =
    typeof payload.payee_vpa === "string" && payload.payee_vpa.trim()
      ? payload.payee_vpa.toLowerCase().trim()
      : null;
  const payeeVpaIsPlatform = Boolean(payeeVpa && allowedVpa && payeeVpa === allowedVpa);
  if (!payeeVpa) {
    flags.push({ field: "payee_vpa", reason: "payee_vpa_missing", severity: "high" });
  } else if (allowedVpa && payeeVpa !== allowedVpa) {
    flags.push({ field: "payee_vpa", reason: "payee_vpa_mismatch", severity: "high" });
  }

  // ── 5. Date freshness ─────────────────────────────────────────────────────
  const txnDate = payload.txn_date;
  if (typeof txnDate === "string" && txnDate.trim()) {
    const date = new Date(txnDate);
    if (Number.isFinite(date.getTime())) {
      const daysDiff = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > MAX_AGE_DAYS) {
        flags.push({ field: "txn_date", reason: "date_stale", severity: "high" });
      }
    }
  }

  // ── 6. Direction — money must have left the payer ─────────────────────────
  // The attack this closes: screenshotting a payment *received* (or any unrelated
  // credit) and passing it off as a payment made to us. Outgoing has to be proven,
  // either by the payee being our own VPA or by the receipt's own wording.
  // "Neither marker present" is deliberately not an automatic flag — GPay receipts
  // print no direction phrase at all and clear on the VPA match instead.
  const hasOutgoingMarker = OUTGOING_PATTERNS.some((pattern) => pattern.test(ocrText));
  const hasIncomingMarker = INCOMING_PATTERNS.some((pattern) => pattern.test(ocrText));
  const outgoingProven = payeeVpaIsPlatform || (hasOutgoingMarker && !hasIncomingMarker);
  if (!outgoingProven) {
    flags.push({ field: "direction", reason: "direction_not_outgoing", severity: "high" });
  }

  // ── 7. Required fields ────────────────────────────────────────────────────
  // Nothing readable came off the image: a cropped, blurred or blank upload.
  if (isAbsent(payload.amount_inr) && isAbsent(payload.utr) && isAbsent(payload.txn_date)) {
    flags.push({ field: "payload", reason: "required_fields_missing", severity: "high" });
  }

  return flags;
}
