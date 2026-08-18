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
 *
 * F2: this file now returns BOTH the flags and a per-invariant verdict record.
 * The flags are advisory and drive the admin UI. The verdicts are the gate
 * input for conditional auto-approval, and they distinguish "checked and
 * passed" from "never ran". See PaymentVerdicts below.
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

/**
 * F2 — the per-invariant verdict record.
 *
 * A flag says "something is wrong". Its ABSENCE does not say "everything was
 * checked and fine" — five of the eight invariants below have skip paths where
 * no comparison happens at all (PROJECT_STATE §11 finding 2). Auto-approval
 * reading only flags would approve every one of those.
 *
 * So each invariant records pass | fail | skipped, and F2's gate requires all
 * eight to be "pass". Skipped is NOT pass.
 *
 * The eight keys here are the same eight named in D28's allow-list, and the
 * same eight the pivx_verdicts_exact_shape CHECK on payment_invariant_verdicts
 * enforces. Adding a ninth invariant means changing this type, this file's
 * verdict initialiser, that CHECK constraint, and PAYMENT_CHECKER_VERSION
 * below — the constraint is what makes forgetting any of them fail loudly.
 *
 * Deliberately NOT derived from FieldFlag["reason"] in trustCheck.ts: that
 * union is stale (it omits three reasons that are pushed anyway) and compiles
 * only because tsconfig.app.json excludes supabase/functions/.
 */
export type PaymentVerdict = "pass" | "fail" | "skipped";

export type PaymentVerdicts = {
  utr_format: PaymentVerdict;
  utr_duplicate: PaymentVerdict;
  amount_mismatch: PaymentVerdict;
  payee_vpa_mismatch: PaymentVerdict;
  payee_vpa_missing: PaymentVerdict;
  date_stale: PaymentVerdict;
  direction_not_outgoing: PaymentVerdict;
  required_fields_missing: PaymentVerdict;
};

export type PaymentCheckResult = {
  flags: FieldFlag[];
  verdicts: PaymentVerdicts;
};

/**
 * Bump whenever the invariant SET or any invariant's SEMANTICS change.
 *
 * F2's gate requires a stored verdict row to carry the current version, so
 * bumping this instantly invalidates every verdict computed by an older build
 * and sends those payments to manual review until they are re-extracted.
 *
 * This is not hypothetical caution. Image ebba2416fd produced three different
 * named flag sets from byte-identical payloads — not model nondeterminism, but
 * F0c shipping between two of the runs. A verdict is only evidence about the
 * code that produced it.
 */
export const PAYMENT_CHECKER_VERSION = 1;

export async function runPaymentTrustChecks(
  payload: Record<string, unknown>,
  tournamentId: string | null,
  userId: string | null,
  admin: SupabaseClient,
  ocrText: string,
): Promise<PaymentCheckResult> {
  const flags: FieldFlag[] = [];

  // EVERY verdict starts at "skipped". A check that runs overwrites its own
  // entry; a check that does not run leaves it. The default is therefore the
  // conservative one, and forgetting to record a verdict can only ever cost a
  // manual review — never grant a false pass.
  const verdicts: PaymentVerdicts = {
    utr_format: "skipped",
    utr_duplicate: "skipped",
    amount_mismatch: "skipped",
    payee_vpa_mismatch: "skipped",
    payee_vpa_missing: "skipped",
    date_stale: "skipped",
    direction_not_outgoing: "skipped",
    required_fields_missing: "skipped",
  };

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
      verdicts.utr_format = "fail";
    } else {
      verdicts.utr_format = "pass";
    }
  }
  // No UTR at all: nothing was checked. Stays "skipped" — required_fields_missing
  // and the RPC's own UTR handling are what catch that case.

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
        //
        // The verdict stays "skipped", which DOES block auto-approval. That is
        // the intended asymmetry: fail open for the flag (advisory, cosmetic),
        // fail closed for the gate (authoritative, money-bearing).
        console.warn("utr_active_duplicate_exists failed; skipping duplicate flag", error);
      } else if (data === true) {
        flags.push({ field: "utr", reason: "utr_duplicate", severity: "high" });
        verdicts.utr_duplicate = "fail";
      } else {
        verdicts.utr_duplicate = "pass";
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
    if (expected === null) {
      // The price RPC failed. We do not know what this person owes, so we have
      // not checked anything. Verdict stays "skipped".
    } else if (Math.abs(extractedAmount - expected) > AMOUNT_TOLERANCE_INR) {
      flags.push({
        field: "amount_inr",
        reason: "amount_mismatch",
        severity: "high",
        expected,
        stated: extractedAmount,
      });
      verdicts.amount_mismatch = "fail";
    } else {
      verdicts.amount_mismatch = "pass";
    }
  }
  // Non-numeric amount, or no tournament/user context: nothing was compared.
  // This is PROJECT_STATE §11 finding 2 — 122 legacy rows have uploaded_by NULL
  // and silently skip this check. Under F2 they cannot auto-approve.

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
    verdicts.payee_vpa_missing = "fail";
    // payee_vpa_mismatch stays "skipped": there was no value to compare.
  } else {
    verdicts.payee_vpa_missing = "pass";
    if (!allowedVpa) {
      // Secret unset. The comparison did not happen, so it did not pass.
      // Under F2 this disables auto-approval platform-wide until it is set,
      // which is the correct blast radius for a missing payee identity.
    } else if (payeeVpa !== allowedVpa) {
      flags.push({ field: "payee_vpa", reason: "payee_vpa_mismatch", severity: "high" });
      verdicts.payee_vpa_mismatch = "fail";
    } else {
      verdicts.payee_vpa_mismatch = "pass";
    }
  }

  // ── 5. Date freshness ─────────────────────────────────────────────────────
  const txnDate = payload.txn_date;
  if (typeof txnDate === "string" && txnDate.trim()) {
    const date = new Date(txnDate);
    if (Number.isFinite(date.getTime())) {
      const daysDiff = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > MAX_AGE_DAYS) {
        flags.push({ field: "txn_date", reason: "date_stale", severity: "high" });
        verdicts.date_stale = "fail";
      } else {
        verdicts.date_stale = "pass";
      }
    }
    // Unparseable date string: nothing was compared. Stays "skipped".
  }
  // txn_date is NOT in the schema's required list, so an absent date is common
  // and legitimate. It still blocks auto-approval, by design: we cannot certify
  // freshness we never measured.

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
    verdicts.direction_not_outgoing = "fail";
  } else {
    // Always determinate — D27 requires outgoing to be PROVEN, so there is no
    // "did not run" state here. Never "skipped".
    verdicts.direction_not_outgoing = "pass";
  }

  // ── 7. Required fields ────────────────────────────────────────────────────
  // Nothing readable came off the image: a cropped, blurred or blank upload.
  if (isAbsent(payload.amount_inr) && isAbsent(payload.utr) && isAbsent(payload.txn_date)) {
    flags.push({ field: "payload", reason: "required_fields_missing", severity: "high" });
    verdicts.required_fields_missing = "fail";
  } else {
    // Always determinate. Never "skipped".
    verdicts.required_fields_missing = "pass";
  }

  return { flags, verdicts };
}
