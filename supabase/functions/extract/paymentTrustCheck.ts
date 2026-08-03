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
 * Derives expected price from player count — mirrors get_tournament_pro_price
 * logic without the auth dependency (this runs with the service-role client).
 * Checks for an active coupon redemption that may have lowered the price.
 */
async function getExpectedAmountInr(
  tournamentId: string,
  userId: string,
  admin: SupabaseClient,
): Promise<number | null> {
  const { count: playerCount, error } = await admin
    .from("players")
    .select("*", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);
  if (error) return null;

  const n = playerCount ?? 0;
  let expected = n <= 150 ? 0 : n <= 500 ? 500 : 1000;

  // Coupon-aware: use amount_after if the user applied a coupon to this tournament
  const { data: redemption } = await admin
    .from("coupon_redemptions")
    .select("amount_after")
    .eq("tournament_id", tournamentId)
    .eq("redeemed_by_user_id", userId)
    .order("redeemed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    redemption &&
    typeof redemption.amount_after === "number" &&
    Number.isFinite(redemption.amount_after)
  ) {
    expected = redemption.amount_after;
  }

  return expected;
}

export async function runPaymentTrustChecks(
  payload: Record<string, unknown>,
  tournamentId: string | null,
  userId: string | null,
  admin: SupabaseClient,
  ocrText: string,
): Promise<FieldFlag[]> {
  const flags: FieldFlag[] = [];

  // ── 1. UTR format ─────────────────────────────────────────────────────────
  const rawUtr = payload.utr;
  if (typeof rawUtr === "string" && rawUtr.trim()) {
    const utrClean = rawUtr.replace(/\s+/g, "");
    if (!UTR_PATTERN.test(utrClean)) {
      flags.push({ field: "utr", reason: "utr_format", severity: "high" });
    } else {
      // ── 2. UTR duplicate (only run if format is valid) ───────────────────
      const { data: dupes } = await admin
        .from("tournament_payments")
        .select("id")
        .eq("utr", utrClean)
        .neq("status", "rejected")
        .limit(1);
      if (dupes && dupes.length > 0) {
        flags.push({ field: "utr", reason: "utr_duplicate", severity: "high" });
      }
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
