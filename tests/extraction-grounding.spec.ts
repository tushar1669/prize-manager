import { describe, expect, it } from "vitest";
import {
  extractDateTokens,
  extractNumericTokens,
  groundNumber,
} from "../supabase/functions/extract/grounding";
import {
  decideStatus,
  runArithmeticCheck,
  runTrustCheck,
} from "../supabase/functions/extract/trustCheck";
import { toGeminiResponseSchema } from "../supabase/functions/extract/responseSchema";

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
