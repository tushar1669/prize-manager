/**
 * Parity fixtures for UTR normalization.
 *
 * Every `expected` value below was CAPTURED FROM THE LIVE POSTGRES
 * `public.normalize_utr` function — they are observations, not predictions.
 * Do not recompute or "correct" them: if the TypeScript mirror
 * (`normalizeUtr` in supabase/functions/extract/paymentTrustCheck.ts)
 * disagrees with one of these, the mirror is wrong, not the fixture.
 *
 * The same table is the intended input for a future SQL-side harness, so both
 * sides can be proven against one list.
 */
export type UtrNormalizationFixture = {
  readonly label: string;
  readonly input: unknown;
  readonly expected: string;
};

export const UTR_NORMALIZATION_FIXTURES: readonly UtrNormalizationFixture[] = [
  { label: "already_canonical", input: "028862663052", expected: "028862663052" },
  { label: "lowercase", input: "sbin1234abcd", expected: "SBIN1234ABCD" },
  { label: "internal_spaces", input: "1234 5678 9012", expected: "123456789012" },
  { label: "hyphens", input: "1234-5678-9012", expected: "123456789012" },
  { label: "statement_line", input: "UPI/DR/123456789012/Name", expected: "UPIDR123456789012NAME" },
  { label: "leading_trailing_space", input: "  028862663052  ", expected: "028862663052" },
  { label: "empty_string", input: "", expected: "" },
  { label: "null_input", input: null, expected: "" },
  // \u00DF = 'sharp s', \u0131 = 'dotless i'. Both are dropped by the strip, so they
  // never reach toUpperCase(). Escapes, not literals, so the bytes are unambiguous.
  { label: "non_ascii", input: "utr\u00DF1234\u0131", expected: "UTR1234" },
  { label: "txn_id_shape_lower", input: "t2607250000123456789", expected: "T2607250000123456789" },
  { label: "whitespace_control", input: "0288\n6266\t3052", expected: "028862663052" },
] as const;
