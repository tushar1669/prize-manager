import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  extractDateTokens,
  extractNumericTokens,
  groundDigits,
  groundNumber,
} from "../supabase/functions/extract/grounding";
import {
  decideStatus,
  runArithmeticCheck,
  runTrustCheck,
} from "../supabase/functions/extract/trustCheck";
import { toGeminiResponseSchema } from "../supabase/functions/extract/responseSchema";
import { extractionPrompt } from "../supabase/functions/extract/extractionPrompt";

const groundedIn = (text: string, value: number) =>
  groundNumber(value, text, extractNumericTokens(text)).grounded;

describe("numeric normalization", () => {
  it("treats Indian and western grouping as the same number", () => {
    expect(groundedIn("Total prize fund: ₹1,00,000", 100000)).toBe(true);
    expect(groundedIn("Total prize fund: ₹100,000", 100000)).toBe(true);
    expect(groundedIn("Total prize fund: 100000", 100000)).toBe(true);
  });

  it("expands magnitude words used in Indian brochures", () => {
    expect(groundedIn("Prize fund of 1 lakh", 100000)).toBe(true);
    expect(groundedIn("Prize fund of 1.5 lakhs", 150000)).toBe(true);
    expect(groundedIn("Prize fund of 2 crore", 20000000)).toBe(true);
    expect(groundedIn("First prize 50k", 50000)).toBe(true);
  });

  it("does not let a number ground itself inside a longer number", () => {
    // The whole point of token-set matching: a substring check would pass both of these.
    expect(groundedIn("First prize 1000", 100)).toBe(false);
    expect(groundedIn("Contact 9876543210", 987)).toBe(false);
  });

  it("grounds numbers embedded in category names", () => {
    const text = "Under-16 Boys, Rating 1401-1650, Veteran +55";
    expect(groundedIn(text, 16)).toBe(true);
    expect(groundedIn(text, 1401)).toBe(true);
    expect(groundedIn(text, 1650)).toBe(true);
    expect(groundedIn(text, 55)).toBe(true);
  });
});

describe("date normalization", () => {
  it("canonicalizes the formats brochures actually use", () => {
    const has = (text: string, iso: string) => extractDateTokens(text).has(iso);
    expect(has("Starts 2026-08-15", "2026-08-15")).toBe(true);
    expect(has("Starts 15/08/2026", "2026-08-15")).toBe(true);
    expect(has("Starts 15-08-2026", "2026-08-15")).toBe(true);
    expect(has("Starts 15.08.2026", "2026-08-15")).toBe(true);
    expect(has("Starts 15th August 2026", "2026-08-15")).toBe(true);
    expect(has("Starts 15 Aug 2026", "2026-08-15")).toBe(true);
    expect(has("Starts August 15, 2026", "2026-08-15")).toBe(true);
  });

  it("reads both endpoints of a date range", () => {
    const tokens = extractDateTokens("Tournament 15th - 17th August 2026");
    expect(tokens.has("2026-08-15")).toBe(true);
    expect(tokens.has("2026-08-17")).toBe(true);
  });

  it("does not invent dates the brochure never states", () => {
    expect(extractDateTokens("Starts 15th August 2026").has("2026-09-01")).toBe(false);
  });
});

describe("trust check", () => {
  const transcription = "Jaipur Open 2026. Starts 15th August 2026 at Birla Auditorium. Prize fund ₹1,00,000.";

  it("keeps grounded values and blanks invented ones", () => {
    const { payload, flags } = runTrustCheck(
      {
        tournament_name: "Jaipur Open 2026",
        venue: "Birla Auditorium",
        start_date: "2026-08-15",
        total_prize_fund: 100000,
        chief_arbiter: "Ramesh Kumar", // never appears in the transcription
      },
      transcription,
    );

    expect(payload.tournament_name).toBe("Jaipur Open 2026");
    expect(payload.total_prize_fund).toBe(100000);
    expect(payload.start_date).toBe("2026-08-15");
    expect(payload.chief_arbiter).toBeNull();
    expect(flags).toEqual([{ field: "chief_arbiter", reason: "ungrounded", severity: "high" }]);
  });

  it("distinguishes absent from ungrounded", () => {
    const { payload, flags } = runTrustCheck(
      { tournament_name: "Jaipur Open 2026", chief_arbiter: null },
      transcription,
    );
    // Absent: the brochure did not say. Null, but no accusation of invention.
    expect(payload.chief_arbiter).toBeNull();
    expect(flags).toHaveLength(0);
  });

  it("exempts structural values that assert nothing about the document", () => {
    const { flags } = runTrustCheck(
      {
        prize_categories: [
          { name: "Open", is_main: true, criteria: { gender: "any" }, prizes: [{ has_trophy: false }] },
        ],
      },
      "Open category prizes",
    );
    expect(flags).toHaveLength(0);
  });

  it("grounds criteria derived from category names", () => {
    const text = "Under-16 Boys prize. Best Rajasthan player. Best Female. Veteran +55. Rating 1401-1650.";
    const { flags } = runTrustCheck(
      {
        prize_categories: [
          { name: "Under-16 Boys", criteria: { age_max: 16 } },
          { name: "Best Rajasthan", criteria: { state: "Rajasthan" } },
          { name: "Best Female", criteria: { gender: "female" } },
          { name: "Veteran +55", criteria: { age_min: 55 } },
          { name: "Rating 1401-1650", criteria: { rating_min: 1401, rating_max: 1650 } },
        ],
      },
      text,
    );
    expect(flags).toHaveLength(0);
  });

  it("downgrades an unfounded rated boolean to null without a flag (owner rule from batch eval)", () => {
    // No false data (blanked) and no false flag: an inferred rated=true from logos/aegis text is
    // an inference, not a document value, and flagging it on every brochure made auto_ok unreachable.
    const { payload, flags } = runTrustCheck({ fide_rated: true }, "A friendly club tournament.");
    expect(payload.fide_rated).toBeNull();
    expect(flags).toHaveLength(0);
  });

  it("still grounds a rated boolean when the document actually claims it", () => {
    const { payload, flags } = runTrustCheck({ fide_rated: true }, "A FIDE Rated open tournament.");
    expect(payload.fide_rated).toBe(true);
    expect(flags).toHaveLength(0);
  });

  it("grounds a normalized label word-wise but still fails an absent one", () => {
    const text = "ENTRY FEE FOR OPEN PLAYERS: Rs 1300. Time control 90 minutes + 30 seconds.";
    const ok = runTrustCheck({ entry_fees: [{ category: "Open Players", amount_inr: 1300 }] }, text);
    expect(ok.flags).toHaveLength(0);
    const absent = runTrustCheck({ entry_fees: [{ category: "Veterans Discount", amount_inr: 1300 }] }, text);
    expect(absent.flags.some((flag) => flag.field.endsWith("category"))).toBe(true);
  });

  it("grounds time_control.category via classification of the stated base time", () => {
    const text = "Time control 90 minutes + 30 seconds increment.";
    const classical = runTrustCheck({ time_control: { category: "classical", base_minutes: 90 } }, text);
    expect(classical.payload.time_control).toMatchObject({ category: "classical" });
    expect(classical.flags).toHaveLength(0);
    // A classification that contradicts the stated base time still fails.
    const wrong = runTrustCheck({ time_control: { category: "blitz", base_minutes: 90 } }, text);
    expect((wrong.payload.time_control as Record<string, unknown>).category).toBeNull();
    expect(wrong.flags.some((flag) => flag.field.endsWith("category"))).toBe(true);
  });

  it("reports confidence as the grounded share of checked values", () => {
    const { confidence } = runTrustCheck(
      { tournament_name: "Jaipur Open 2026", chief_arbiter: "Ramesh Kumar" },
      transcription,
    );
    expect(confidence).toBe(0.5);
  });

  it("flags institutional/team prize categories and sets has_team_prizes (FIX 1)", () => {
    const text = "Best Academy trophy. Best School medals. Open prizes ₹5000.";
    const { payload, flags } = runTrustCheck(
      {
        prize_categories: [
          { name: "Best Academy", prizes: [{ has_trophy: true }] },
          { name: "Best School", prizes: [{ has_medal: true }] },
          { name: "Open", prizes: [{ place: 1, cash_amount: 5000 }] },
        ],
      },
      text,
    );
    expect(payload.has_team_prizes).toBe(true);
    const teamFlags = flags.filter((f) => f.reason === "team_prize_detected");
    expect(teamFlags).toEqual([
      { field: "prize_categories[0].name", reason: "team_prize_detected", severity: "info", value: "Best Academy" },
      { field: "prize_categories[1].name", reason: "team_prize_detected", severity: "info", value: "Best School" },
    ]);
  });

  it("does not set has_team_prizes when no category is institutional", () => {
    const { payload, flags } = runTrustCheck(
      { prize_categories: [{ name: "Open", prizes: [{ place: 1, cash_amount: 5000 }] }] },
      "Open prizes ₹5000.",
    );
    expect(payload.has_team_prizes).toBeUndefined();
    expect(flags.some((f) => f.reason === "team_prize_detected")).toBe(false);
  });

  it("exempts the multiple_tournaments_detected meta signal from grounding (FIX 3)", () => {
    // A boolean the model reports about the brochure's structure is not a quotation, so it must
    // survive the grounding walk rather than being blanked and flagged.
    const { payload, flags } = runTrustCheck(
      { tournament_name: "Kurnool Rapid & Blitz", multiple_tournaments_detected: true },
      "Kurnool Rapid & Blitz open tournament.",
    );
    expect(payload.multiple_tournaments_detected).toBe(true);
    expect(flags).toHaveLength(0);
  });

  it("exempts detected_tournament_names from grounding (Phase G)", () => {
    // The model-generated event names are metadata, not quotations to verify against the OCR text —
    // they must survive the grounding walk intact and never be flagged, even when the exact strings
    // do not appear verbatim in the transcription.
    const { payload, flags } = runTrustCheck(
      {
        tournament_name: "Kurnool Rapid & Blitz",
        multiple_tournaments_detected: true,
        detected_tournament_names: [
          "International Fide Rating Open Rapid Chess Tournament",
          "International Fide Rating Open Blitz Chess Tournament",
        ],
      },
      // The tournament_name is present so it grounds; the two event names deliberately are not.
      "Kurnool Rapid & Blitz — a two-event brochure. The individual event names are not repeated here.",
    );
    expect(payload.detected_tournament_names).toEqual([
      "International Fide Rating Open Rapid Chess Tournament",
      "International Fide Rating Open Blitz Chess Tournament",
    ]);
    expect(flags).toHaveLength(0);
  });
});

describe("arithmetic check", () => {
  const payloadWith = (fund: number | null) => ({
    total_prize_fund: fund,
    prize_categories: [
      { prizes: [{ cash_amount: 50000 }, { cash_amount: 30000 }] },
      { prizes: [{ cash_amount: 20000 }] },
    ],
  });

  it("passes when the stated fund matches the sum", () => {
    const result = runArithmeticCheck(payloadWith(100000));
    expect(result.sum).toBe(100000);
    expect(result.within).toBe(true);
    expect(result.flag).toBeNull();
  });

  it("tolerates rounding within ₹100 but flags beyond it", () => {
    expect(runArithmeticCheck(payloadWith(100100)).flag).toBeNull();
    expect(runArithmeticCheck(payloadWith(100101)).flag).toMatchObject({
      field: "total_prize_fund",
      reason: "sum_mismatch",
      severity: "high",
      expected: 100000,
      stated: 100101,
    });
  });

  it("makes no claim when the fund is absent", () => {
    const result = runArithmeticCheck(payloadWith(null));
    expect(result.within).toBe(true);
    expect(result.flag).toBeNull();
  });
});

describe("status routing", () => {
  const required = ["tournament_name", "start_date"];
  const payload = { tournament_name: "Jaipur Open 2026", start_date: "2026-08-15" };
  const grounding = {
    tournament_name: { grounded: true, method: "string" as const, evidence: null },
    start_date: { grounded: true, method: "date" as const, evidence: null },
  };

  it("auto-commits only when everything holds", () => {
    expect(decideStatus(payload, grounding, [], required, true)).toBe("auto_ok");
  });

  it("routes to review on any flag, mismatch, or missing required field", () => {
    const flag = { field: "venue", reason: "ungrounded" as const, severity: "high" as const };
    expect(decideStatus(payload, grounding, [flag], required, true)).toBe("needs_review");
    expect(decideStatus(payload, grounding, [], required, false)).toBe("needs_review");
    expect(decideStatus({ ...payload, start_date: null }, grounding, [], required, true)).toBe("needs_review");
  });

  it("routes to review when a required field is present but ungrounded", () => {
    const ungrounded = { ...grounding, start_date: { grounded: false, method: "date" as const, evidence: null } };
    expect(decideStatus(payload, ungrounded, [], required, true)).toBe("needs_review");
  });
});

describe("Gemini response schema conversion", () => {
  const source = {
    type: "object",
    required: ["tournament_name"],
    properties: {
      tournament_name: { type: "string", description: "Full tournament title" },
      start_date: { type: "string", format: "date", description: "YYYY-MM-DD" },
      registration_deadline: { type: "string", format: "date" },
      currency: { type: "string", default: "INR" },
      time_control: {
        type: "object",
        properties: { category: { type: "string", enum: ["classical", "rapid"] } },
      },
      prize_categories: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
    },
  };

  it("makes properties nullable and required so absence is expressible", () => {
    const converted = toGeminiResponseSchema(source);
    expect(converted.properties?.tournament_name.type).toEqual(["string", "null"]);
    expect(converted.required).toEqual(Object.keys(source.properties));
    expect(converted.additionalProperties).toBe(false);
  });

  it("strips keywords Gemini rejects but preserves the date format as an instruction", () => {
    const converted = toGeminiResponseSchema(source);
    expect(converted.properties?.currency.default).toBeUndefined();
    expect(converted.properties?.start_date.format).toBeUndefined();
    expect(converted.properties?.registration_deadline.format).toBeUndefined();
    // Dropping `format: "date"` must not lose the YYYY-MM-DD requirement.
    expect(converted.properties?.registration_deadline.description).toContain("YYYY-MM-DD");
  });

  it("does not repeat the date hint when the description already states the format", () => {
    const converted = toGeminiResponseSchema(source);
    expect(converted.properties?.start_date.description).toBe("YYYY-MM-DD");
  });

  it("admits null into enums it makes nullable", () => {
    const converted = toGeminiResponseSchema(source);
    expect(converted.properties?.time_control.properties?.category.enum).toContain(null);
  });

  it("leaves array items non-nullable", () => {
    const converted = toGeminiResponseSchema(source);
    expect(converted.properties?.prize_categories.items?.type).toBe("object");
  });
});

describe("targeted extraction prompt (Phase G)", () => {
  const schema = { type: "object", properties: { tournament_name: { type: "string" } } };

  it("puts the IMPORTANT targeting directive first when target_event is supplied", () => {
    const prompt = extractionPrompt(schema, "some transcription", "3rd Open Blitz Tournament 2025");
    // The directive must frame the whole task, so it comes before the schema and every rule.
    expect(prompt.startsWith("IMPORTANT")).toBe(true);
    expect(prompt).toContain("3rd Open Blitz Tournament 2025");
    // It also instructs the model to clear the multi-event signals for the scoped run.
    expect(prompt).toContain("Set multiple_tournaments_detected to false and detected_tournament_names to []");
  });

  it("emits no targeting preamble for an ordinary (untargeted) extraction", () => {
    const prompt = extractionPrompt(schema, "some transcription");
    expect(prompt.startsWith("IMPORTANT")).toBe(false);
    expect(prompt.startsWith("You extract structured data")).toBe(true);
  });
});

describe("Phase 2A — payment grounding and invariants", () => {
  const UTR_PATTERN = /^[A-Za-z0-9]{8,22}$/;

  it("grounds a UTR the screenshot spaced out but the text runs together", () => {
    expect(groundDigits("123 456 789 012", "UTR: 123456789012 completed").grounded).toBe(true);
  });

  it("grounds a plain UTR quoted verbatim in the text", () => {
    expect(groundDigits("123456789012", "ref 123456789012 paid").grounded).toBe(true);
  });

  it("refuses a UTR the text never states", () => {
    expect(groundDigits("123456789012", "no digits here").grounded).toBe(false);
  });

  it("rejects a UTR shorter than the 8-character floor", () => {
    expect(UTR_PATTERN.test("AB12")).toBe(false);
  });

  it("rejects a UTR longer than the 22-character ceiling", () => {
    expect(UTR_PATTERN.test("ABCD1234ABCD1234ABCD123")).toBe(false);
  });

  it("accepts the 12-digit UTR Indian banks actually issue", () => {
    expect(UTR_PATTERN.test("123456789012")).toBe(true);
  });

  it("flags an amount that does not match what was owed", () => {
    expect(Math.abs(999 - 1499) > 1).toBe(true);
  });

  it("does not flag an exact amount match", () => {
    expect(Math.abs(1499 - 1499) > 1).toBe(false);
  });

  it("absorbs a ₹1 rounding difference without flagging", () => {
    expect(Math.abs(1499 - 1500) > 1).toBe(false);
  });

  it("treats a payment dated 31 days ago as stale", () => {
    const old = new Date();
    old.setDate(old.getDate() - 31);
    const diff = (Date.now() - old.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff > 30).toBe(true);
  });
});

describe("payment_screenshot schema v2 — txn_id and direction_label grounding", () => {
  it("grounds a txn_id quoted verbatim in the receipt text", () => {
    const { payload, grounding, flags } = runTrustCheck(
      { txn_id: "T2607241530" },
      "Transaction ID T2607241530 · UPI",
    );
    expect(payload.txn_id).toBe("T2607241530");
    expect(grounding.txn_id.method).toBe("digits");
    expect(flags).toHaveLength(0);
  });

  it("grounds a txn_id the OCR broke into spaced runs", () => {
    // Digits survive the spacing and the dropped "T"; groundString would not.
    const { payload, grounding, flags } = runTrustCheck(
      { txn_id: "T2607241530" },
      "Transaction ID T 2607 241530 · UPI",
    );
    expect(payload.txn_id).toBe("T2607241530");
    expect(grounding.txn_id.method).toBe("digits");
    expect(flags).toHaveLength(0);
  });

  it("refuses a txn_id whose digits the receipt never states", () => {
    const { payload, grounding, flags } = runTrustCheck(
      { txn_id: "T2607241530" },
      "Transaction ID T9999999999 · UPI",
    );
    expect(payload.txn_id).toBeNull();
    expect(grounding.txn_id.grounded).toBe(false);
    expect(flags).toEqual([{ field: "txn_id", reason: "ungrounded", severity: "high" }]);
  });

  it("grounds direction_label as a literal string, not by digits", () => {
    const { payload, grounding, flags } = runTrustCheck(
      { direction_label: "Paid to" },
      "Paid to Prize Manager · ₹1499",
    );
    expect(payload.direction_label).toBe("Paid to");
    expect(grounding.direction_label.method).toBe("string");
    expect(flags).toHaveLength(0);
  });

  it("blanks and flags a direction_label the receipt never printed", () => {
    const { payload, grounding, flags } = runTrustCheck(
      { direction_label: "Paid to" },
      "Received from Prize Manager · ₹1499",
    );
    expect(payload.direction_label).toBeNull();
    expect(grounding.direction_label.grounded).toBe(false);
    expect(flags).toEqual([{ field: "direction_label", reason: "ungrounded", severity: "high" }]);
  });

  it("grounds payee_name as a literal string, not by digits", () => {
    const { payload, grounding } = runTrustCheck(
      { payee_name: "Prize Manager" },
      "Paid to Prize Manager · ₹1499",
    );
    expect(payload.payee_name).toBe("Prize Manager");
    expect(grounding.payee_name.method).toBe("string");
  });
});

describe("payment_screenshot schema v3 — txn_id grounding routes by digit count", () => {
  it("grounds a mostly-alphabetic GPay txn_id as a string, not by digits", () => {
    // "CICAgLii79OjJA" strips to "79" — digit grounding would match nearly any receipt.
    const { payload, grounding, flags } = runTrustCheck(
      { txn_id: "CICAgLii79OjJA" },
      "Google transaction ID: CICAgLii79OjJA",
    );
    expect(payload.txn_id).toBe("CICAgLii79OjJA");
    expect(grounding.txn_id.method).toBe("string");
    expect(flags).toHaveLength(0);
  });

  it("refuses a short-digit txn_id whose literal string the receipt never states", () => {
    // The vacuous-grounding case: "79" appears, the id itself does not.
    const { payload, grounding } = runTrustCheck(
      { txn_id: "CICAgLii79OjJA" },
      "UPI transaction ID: 127287042392 · debited 79 rupees",
    );
    expect(payload.txn_id).toBeNull();
    expect(grounding.txn_id.grounded).toBe(false);
  });

  it("still grounds a long PhonePe txn_id by digits", () => {
    const { payload, grounding, flags } = runTrustCheck(
      { txn_id: "T2607281109445608536045" },
      "PhonePe Transaction ID: T2607281109445608536045",
    );
    expect(payload.txn_id).toBe("T2607281109445608536045");
    expect(grounding.txn_id.method).toBe("digits");
    expect(flags).toHaveLength(0);
  });
});

describe("payment invariants — direction, payee VPA presence, required fields", () => {
  const PLATFORM_VPA = "9559161414-5@ybl";

  // Verbatim production OCR text for the three receipt shapes we have to separate.
  const PHONEPE_OUTGOING =
    "Transaction Header\n   Status: Transaction Successful\n   Timestamp: 11:09 am on 28 Jul 2026\nPayee Details\n   Name: NEW PRASHAANT ENTERPRISES\n   UPI ID: Q016383450@ybl\n   Amount: ₹43\nPayment Details\n   PhonePe Transaction ID: T2607281109445608536045\n   Debited from: XXXXXX4944\n   Debit Amount: ₹43\n   UTR: 530869563988";
  const GPAY_OUTGOING =
    "Transaction Details\n   Recipient Name: TUSHAR SARASWAT\n   Amount: ₹1\n   Status: Completed\nTransaction Identifiers\n   UPI transaction ID: 127287042392\n   Google transaction ID: CICAgLii79OjJA\nRecipient Information\n   Recipient Name: TUSHAR SARASWAT\n   Recipient UPI ID: 9559161414-5@ybl\n   Recipient Platform: PhonePe\nSender Information\n   Sender Name: TUSHAR SARASWAT\n   Sender UPI ID: tusharsaraswat68-5@okhdfcbank";
  const PHONEPE_INCOMING =
    "Transaction Header\n   Status: Transaction Successful\n   Timestamp: 08:50 am on 03 Aug 2026\nSender Details\n   Name: TUSHAR SARASWAT\n   Identifier: tusharsaraswat68-5@okhdfcbank\n   Amount: ₹1\nTransfer Details\n   PhonePe Transaction ID: T2608030850117559380892\nRecipient Details\n   Credited to: 3561XXXXXXX3993\n   Amount: ₹1\n   UTR: 127287042392";

  // Minimal chainable stand-in for the service-role client: every payment invariant that
  // touches the database (UTR duplicate, expected amount) resolves to "nothing found".
  const admin = {
    from: () => {
      const result = Promise.resolve({ data: [], error: null, count: 0 });
      const builder = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (...args: Parameters<Promise<unknown>["then"]>) => result.then(...args),
      };
      return builder;
    },
  };

  let runPaymentTrustChecks: typeof import("../supabase/functions/extract/paymentTrustCheck").runPaymentTrustChecks;

  beforeAll(async () => {
    (globalThis as { Deno?: unknown }).Deno = {
      env: { get: vi.fn((key: string) => (key === "PLATFORM_PAYEE_VPA" ? PLATFORM_VPA : undefined)) },
    };
    ({ runPaymentTrustChecks } = await import("../supabase/functions/extract/paymentTrustCheck"));
  });

  const reasons = async (payload: Record<string, unknown>, ocrText: string) => {
    const flags = await runPaymentTrustChecks(payload, null, null, admin as never, ocrText);
    return flags.map((flag) => flag.reason);
  };

  it("clears a PhonePe outgoing receipt on its own wording, not the payee VPA", async () => {
    // payee_vpa here is the merchant, not us — direction has to come from "Debited from".
    expect(
      await reasons({ payee_vpa: "Q016383450@ybl", amount_inr: 43 }, PHONEPE_OUTGOING),
    ).not.toContain("direction_not_outgoing");
  });

  it("clears a GPay receipt on the platform VPA match, which prints no direction word", async () => {
    expect(
      await reasons({ payee_vpa: PLATFORM_VPA, amount_inr: 1 }, GPAY_OUTGOING),
    ).not.toContain("direction_not_outgoing");
  });

  it("flags a PhonePe incoming receipt passed off as a payment made", async () => {
    expect(
      await reasons({ payee_vpa: null, amount_inr: 1 }, PHONEPE_INCOMING),
    ).toContain("direction_not_outgoing");
  });

  it("flags a missing payee VPA instead of skipping the allow-list check", async () => {
    expect(await reasons({ payee_vpa: null, amount_inr: 1 }, PHONEPE_INCOMING)).toContain(
      "payee_vpa_missing",
    );
    expect(await reasons({ payee_vpa: "   ", amount_inr: 1 }, PHONEPE_INCOMING)).toContain(
      "payee_vpa_missing",
    );
  });

  it("leaves the mismatch behaviour untouched when a payee VPA is present", async () => {
    const platform = await reasons({ payee_vpa: PLATFORM_VPA, amount_inr: 1 }, GPAY_OUTGOING);
    expect(platform).not.toContain("payee_vpa_missing");
    expect(platform).not.toContain("payee_vpa_mismatch");

    const stranger = await reasons({ payee_vpa: "Q016383450@ybl", amount_inr: 43 }, PHONEPE_OUTGOING);
    expect(stranger).not.toContain("payee_vpa_missing");
    expect(stranger).toContain("payee_vpa_mismatch");
  });

  it("flags a screenshot that yielded no amount, no UTR and no date", async () => {
    expect(
      await reasons(
        { payee_vpa: PLATFORM_VPA, amount_inr: null, utr: null, txn_date: null },
        GPAY_OUTGOING,
      ),
    ).toContain("required_fields_missing");
  });

  it("does not flag required fields when at least the UTR came through", async () => {
    expect(
      await reasons(
        { payee_vpa: PLATFORM_VPA, amount_inr: null, utr: "530869563988", txn_date: null },
        GPAY_OUTGOING,
      ),
    ).not.toContain("required_fields_missing");
  });
});
