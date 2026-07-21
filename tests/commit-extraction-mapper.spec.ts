import { describe, expect, it } from "vitest";
import {
  expandPrize,
  mapPayloadToTables,
  MappingError,
  resolveGeneralEntryFee,
  type ExtractionPayload,
} from "../supabase/functions/commit-extraction/mapper";

const OWNER = "00000000-0000-4000-8000-000000000001";

const basePayload = (overrides: Partial<ExtractionPayload> = {}): ExtractionPayload => ({
  tournament_name: "Test Open 2026",
  start_date: "2026-04-23",
  end_date: "2026-04-27",
  ...overrides,
});

describe("rank range expansion", () => {
  it("expands 11-15 into five rows at the per-place amount", () => {
    const warnings: string[] = [];
    const rows = expandPrize({ rank_from: 11, rank_to: 15, cash_amount: 6500 }, "General", warnings);
    expect(rows.map((r) => r.place)).toEqual([11, 12, 13, 14, 15]);
    expect(rows.every((r) => r.cash_amount === 6500)).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("keeps a single place as one row", () => {
    const rows = expandPrize({ place: 3, cash_amount: 50000 }, "General", []);
    expect(rows).toEqual([
      { place: 3, cash_amount: 50000, has_trophy: false, has_medal: false, gift_items: [] },
    ]);
  });

  it("skips an inverted range with a warning instead of guessing", () => {
    const warnings: string[] = [];
    expect(expandPrize({ rank_from: 15, rank_to: 11, cash_amount: 6500 }, "General", warnings)).toEqual([]);
    expect(warnings[0]).toMatch(/inverted/);
  });

  it("refuses absurd spans that would explode the prizes table", () => {
    const warnings: string[] = [];
    expect(expandPrize({ rank_from: 1, rank_to: 5000, cash_amount: 10 }, "General", warnings)).toEqual([]);
    expect(warnings[0]).toMatch(/exceeds/);
  });
});

describe("trophy-only and blank prizes", () => {
  it("keeps a trophy-only prize as a real row with zero cash", () => {
    const rows = expandPrize({ place: 1, cash_amount: 0, has_trophy: true }, "Academy", []);
    expect(rows).toEqual([
      { place: 1, cash_amount: 0, has_trophy: true, has_medal: false, gift_items: [] },
    ]);
  });

  it("skips a row that awards nothing at all", () => {
    const warnings: string[] = [];
    expect(expandPrize({ place: 4 }, "School", warnings)).toEqual([]);
    expect(warnings[0]).toMatch(/no cash, trophy, medal or gift/);
  });

  it("converts gift_description to the app's gift_items shape", () => {
    const rows = expandPrize({ place: 2, gift_description: "Chess clock" }, "Special", []);
    expect(rows[0].gift_items).toEqual([{ name: "Chess clock", qty: 1 }]);
  });
});

describe("committed categories are structure only", () => {
  // Eligibility rules are the organizer's to configure in the app; a brochure import must leave
  // criteria_json exactly as the manual creation flow does — empty.
  it("emits empty criteria_json even when the payload carries rich criteria", () => {
    const result = mapPayloadToTables(
      basePayload({
        prize_categories: [
          { name: "Best Jaipur", criteria: { city: "Jaipur" }, prizes: [{ place: 1, cash_amount: 8000 }] },
          { name: "Best Rajasthan", criteria: { state: "Rajasthan" }, prizes: [{ place: 1, cash_amount: 8000 }] },
          { name: "Best Female", criteria: { gender: "female" }, prizes: [{ place: 1, cash_amount: 8000 }] },
          {
            name: "Rating 1401-1650",
            criteria: { rating_min: 1401, rating_max: 1650, age_min: 10, age_max: 60 },
            prizes: [{ place: 1, cash_amount: 8000 }],
          },
        ],
      }),
      OWNER,
    );
    expect(result.categories).toHaveLength(4);
    for (const category of result.categories) {
      expect(category.criteria_json).toEqual({});
    }
    // The structure itself survives untouched.
    expect(result.categories.map((c) => c.name)).toEqual([
      "Best Jaipur",
      "Best Rajasthan",
      "Best Female",
      "Rating 1401-1650",
    ]);
    expect(result.categories.every((c) => c.prizes[0].cash_amount === 8000)).toBe(true);
  });
});

describe("tournament mapping", () => {
  it("requires tournament_name and start_date", () => {
    expect(() => mapPayloadToTables(basePayload({ tournament_name: null }), OWNER)).toThrow(MappingError);
    expect(() => mapPayloadToTables(basePayload({ start_date: "not-a-date" }), OWNER)).toThrow(MappingError);
  });

  it("defaults a missing end_date to start_date with a warning", () => {
    const result = mapPayloadToTables(basePayload({ end_date: null }), OWNER);
    expect(result.tournament.end_date).toBe("2026-04-23");
    expect(result.warnings.some((w) => w.includes("end_date"))).toBe(true);
  });

  it("fills tournament columns from the payload", () => {
    const result = mapPayloadToTables(
      basePayload({
        venue: "Jaipur Club",
        city: "Jaipur",
        event_code: "412442/RJ/2025",
        chief_arbiter: "IA Someone",
        tournament_director: "Someone Else",
        total_prize_fund: 1150000,
        entry_fees: [{ category: "General", amount_inr: 5000 }, { category: "Jaipur", amount_inr: 4750 }],
        time_control: { category: "classical", base_minutes: 90, increment_seconds: 30 },
      }),
      OWNER,
    );
    expect(result.tournament).toMatchObject({
      owner_id: OWNER,
      event_code: "412442/RJ/2025",
      entry_fee_amount: 5000,
      cash_prize_total: 1150000,
      time_control_base_minutes: 90,
      time_control_increment_seconds: 30,
      time_control_category: "classical",
    });
  });
});

describe("entry fee resolution", () => {
  it("picks the general tier regardless of array order", () => {
    // Production Jaipur order: the local rate is listed before the general rate.
    expect(resolveGeneralEntryFee([
      { category: "Jaipur players", amount_inr: 4750 },
      { category: "General", amount_inr: 5000 },
    ])).toBe(5000);
  });

  it("matches general-equivalent labels", () => {
    expect(resolveGeneralEntryFee([
      { category: "Rated players", amount_inr: 800 },
      { category: "All other players", amount_inr: 1000 },
    ])).toBe(1000);
  });

  it("falls back to the highest non-late base rate when no tier is general", () => {
    expect(resolveGeneralEntryFee([
      { category: "Under-15", amount_inr: 600 },
      { category: "Women", amount_inr: 700 },
      { category: "Open", amount_inr: 900 },
    ])).toBe(900);
  });

  it("never picks a late/on-the-spot rate while a base rate exists", () => {
    expect(resolveGeneralEntryFee([
      { category: "Standard", amount_inr: 1000 },
      { category: "Late entry", amount_inr: 1500 },
      { category: "On the spot", amount_inr: 2000 },
    ])).toBe(1000);
  });

  it("uses the highest base rate even when a late fee is larger and no tier is general", () => {
    expect(resolveGeneralEntryFee([
      { category: "Local", amount_inr: 900 },
      { category: "Rated", amount_inr: 1100 },
      { category: "Spot registration", amount_inr: 1600 },
    ])).toBe(1100);
  });

  it("returns null for no fees or unusable amounts", () => {
    expect(resolveGeneralEntryFee([])).toBeNull();
    expect(resolveGeneralEntryFee(null)).toBeNull();
    expect(resolveGeneralEntryFee([{ category: "General", amount_inr: null }])).toBeNull();
  });

  it("flows the resolved general fee into the mapped tournament", () => {
    const result = mapPayloadToTables(
      basePayload({
        entry_fees: [
          { category: "Jaipur players", amount_inr: 4750 },
          { category: "General", amount_inr: 5000 },
        ],
      }),
      OWNER,
    );
    expect(result.tournament.entry_fee_amount).toBe(5000);
  });
});

describe("category mapping", () => {
  it("assigns order_idx by payload order and skips unnamed categories", () => {
    const result = mapPayloadToTables(
      basePayload({
        prize_categories: [
          { name: "General", is_main: true, prizes: [{ place: 1, cash_amount: 100 }] },
          { name: null, prizes: [{ place: 1, cash_amount: 100 }] },
          { name: "Under 8", prizes: [{ place: 1, cash_amount: 100 }] },
        ],
      }),
      OWNER,
    );
    expect(result.categories.map((c) => [c.name, c.order_idx, c.is_main])).toEqual([
      ["General", 0, true],
      ["Under 8", 1, false],
    ]);
    expect(result.warnings.some((w) => w.includes("no name"))).toBe(true);
  });

  it("drops duplicate places inside one category with a warning", () => {
    const result = mapPayloadToTables(
      basePayload({
        prize_categories: [
          { name: "General", prizes: [{ place: 1, cash_amount: 100 }, { place: 1, cash_amount: 200 }] },
        ],
      }),
      OWNER,
    );
    expect(result.categories[0].prizes).toHaveLength(1);
    expect(result.categories[0].prizes[0].cash_amount).toBe(100);
    expect(result.warnings.some((w) => w.includes("duplicate place"))).toBe(true);
  });
});

describe("main-prize guarantee (exactly one is_main)", () => {
  it("marks the highest 1st-prize category when the payload marks none", () => {
    const result = mapPayloadToTables(
      basePayload({
        prize_categories: [
          { name: "Under 8", prizes: [{ place: 1, cash_amount: 2000 }] },
          { name: "General", prizes: [{ place: 1, cash_amount: 50000 }] },
          { name: "Women", prizes: [{ place: 1, cash_amount: 8000 }] },
        ],
      }),
      OWNER,
    );
    expect(result.categories.filter((c) => c.is_main).map((c) => c.name)).toEqual(["General"]);
    expect(result.warnings.some((w) => w.includes("no main category marked"))).toBe(true);
  });

  it("keeps the highest 1st-prize category when the payload marks several", () => {
    const result = mapPayloadToTables(
      basePayload({
        prize_categories: [
          { name: "General", is_main: true, prizes: [{ place: 1, cash_amount: 30000 }] },
          { name: "Blitz", is_main: true, prizes: [{ place: 1, cash_amount: 45000 }] },
          { name: "Rapid", is_main: true, prizes: [{ place: 1, cash_amount: 20000 }] },
        ],
      }),
      OWNER,
    );
    expect(result.categories.filter((c) => c.is_main).map((c) => c.name)).toEqual(["Blitz"]);
    expect(result.warnings.some((w) => w.includes("multiple main categories marked"))).toBe(true);
  });

  it("breaks a 1st-prize tie toward the earliest category by order", () => {
    const result = mapPayloadToTables(
      basePayload({
        prize_categories: [
          { name: "Section A", prizes: [{ place: 1, cash_amount: 25000 }] },
          { name: "Section B", prizes: [{ place: 1, cash_amount: 25000 }] },
        ],
      }),
      OWNER,
    );
    const mains = result.categories.filter((c) => c.is_main).map((c) => c.name);
    expect(mains).toEqual(["Section A"]);
  });

  it("leaves a single marked main untouched", () => {
    const result = mapPayloadToTables(
      basePayload({
        prize_categories: [
          { name: "General", is_main: true, prizes: [{ place: 1, cash_amount: 10000 }] },
          { name: "Under 8", prizes: [{ place: 1, cash_amount: 50000 }] },
        ],
      }),
      OWNER,
    );
    expect(result.categories.filter((c) => c.is_main).map((c) => c.name)).toEqual(["General"]);
    expect(result.warnings.some((w) => w.includes("main categor"))).toBe(false);
  });
});

describe("cash_prize_total stated-fund rule", () => {
  it("uses the stated total_prize_fund as-is when present, even if it differs from the itemised sum", () => {
    const result = mapPayloadToTables(
      basePayload({
        total_prize_fund: 600001,
        prize_categories: [
          { name: "General", is_main: true, prizes: [{ place: 1, cash_amount: 100000 }, { place: 2, cash_amount: 50000 }] },
        ],
      }),
      OWNER,
    );
    expect(result.tournament.cash_prize_total).toBe(600001);
  });

  it("falls back to the expanded itemised sum when no fund is stated (Kurnool case)", () => {
    const result = mapPayloadToTables(
      basePayload({
        total_prize_fund: null,
        prize_categories: [
          { name: "General", is_main: true, prizes: [{ rank_from: 1, rank_to: 3, cash_amount: 10000 }] },
          { name: "Women", prizes: [{ place: 1, cash_amount: 5000 }] },
        ],
      }),
      OWNER,
    );
    // 3 × 10000 (expanded range) + 5000 = 35000
    expect(result.tournament.cash_prize_total).toBe(35000);
  });
});

describe("notes fallback for columnless fields (QA #1)", () => {
  it("folds registration deadline, contacts, website and rating status into notes", () => {
    const result = mapPayloadToTables(
      basePayload({
        registration_deadline: "2025-11-15",
        contact_email: "organizer@example.com",
        contact_phone: "+91 90000 00000",
        website: "www.apchess.org",
        fide_rated: true,
        aicf_rated: false,
      }),
      OWNER,
    );
    expect(result.tournament.notes).toBe(
      [
        "Registration deadline: 2025-11-15",
        "Contact email: organizer@example.com",
        "Contact phone: +91 90000 00000",
        "Website: www.apchess.org",
        "FIDE rated: Yes",
        "AICF rated: No",
      ].join("\n"),
    );
  });

  it("emits only the fields that are present and null when none are", () => {
    const partial = mapPayloadToTables(basePayload({ website: "www.example.com" }), OWNER);
    expect(partial.tournament.notes).toBe("Website: www.example.com");

    const none = mapPayloadToTables(basePayload(), OWNER);
    expect(none.tournament.notes).toBeNull();
  });

  it("does not treat a null rating flag as 'No'", () => {
    const result = mapPayloadToTables(basePayload({ fide_rated: null, aicf_rated: null }), OWNER);
    expect(result.tournament.notes).toBeNull();
  });
});

describe("mapping is deterministic and non-mutating", () => {
  // True commit idempotency is enforced by the FOR UPDATE lock on extractions.linked_tournament_id
  // in commit_extraction_transaction; what the mapper owes is that running it twice over the same
  // payload proposes the identical rows, so a retry cannot produce a different tournament.
  it("returns identical output for identical input and leaves the payload untouched", () => {
    const payload = basePayload({
      prize_categories: [
        {
          name: "General",
          is_main: true,
          criteria: { gender: "any" },
          prizes: [{ rank_from: 11, rank_to: 15, cash_amount: 6500 }],
        },
      ],
    });
    const snapshot = JSON.parse(JSON.stringify(payload));
    const first = mapPayloadToTables(payload, OWNER);
    const second = mapPayloadToTables(payload, OWNER);
    expect(second).toEqual(first);
    expect(payload).toEqual(snapshot);
  });
});

describe("Jaipur-shaped end-to-end mapping", () => {
  it("produces 100 prize rows summing to the stated fund", () => {
    // Shape mirrors the reference brochure: 14 categories, grouped ranks 11-15 and 16-20 in the
    // main column. Amounts are the real ones; the assertion is the same invariant the trust
    // layer checks (sum == stated fund) applied to the *expanded* rows.
    const general = [100000, 75000, 50000, 30000, 20000, 15000, 10000, 9000, 8000, 7000]
      .map((cash, i) => ({ place: i + 1, cash_amount: cash }));
    const ratingBand = [50000, 25000, 20000, 15000, 10000, 8500, 8000, 7500, 7000, 6000]
      .map((cash, i) => ({ place: i + 1, cash_amount: cash }));
    const unrated = [20000, 15000, 12000, 9000, 8500, 8000, 7500, 7000, 6500, 6000]
      .map((cash, i) => ({ place: i + 1, cash_amount: cash }));
    const fiveRow = [8000, 7500, 7000, 6500, 6000].map((cash, i) => ({ place: i + 1, cash_amount: cash }));

    const payload = basePayload({
      total_prize_fund: 1150000,
      prize_categories: [
        {
          name: "General",
          is_main: true,
          prizes: [
            ...general,
            { rank_from: 11, rank_to: 15, cash_amount: 6500 },
            { rank_from: 16, rank_to: 20, cash_amount: 6000 },
          ],
        },
        { name: "Rating 1401-1650", criteria: { rating_min: 1401, rating_max: 1650 }, prizes: ratingBand },
        { name: "Rating 1651-1900", criteria: { rating_min: 1651, rating_max: 1900 }, prizes: ratingBand },
        { name: "Unrated", prizes: unrated },
        { name: "Best Veteran + 55", criteria: { age_min: 55 }, prizes: fiveRow },
        { name: "Best Female", criteria: { gender: "female" }, prizes: fiveRow },
        { name: "Best Rajasthan", criteria: { state: "Rajasthan" }, prizes: fiveRow },
        { name: "Best Jaipur", criteria: { city: "Jaipur" }, prizes: fiveRow },
        { name: "Divyang", prizes: fiveRow },
        { name: "Under 16", criteria: { age_max: 16 }, prizes: fiveRow },
        { name: "Under 14", criteria: { age_max: 14 }, prizes: fiveRow },
        { name: "Under 12", criteria: { age_max: 12 }, prizes: fiveRow },
        { name: "Under 10", criteria: { age_max: 10 }, prizes: fiveRow },
        { name: "Under 8", criteria: { age_max: 8 }, prizes: fiveRow },
      ],
    });

    const result = mapPayloadToTables(payload, OWNER);
    const rows = result.categories.flatMap((c) => c.prizes);
    expect(result.categories).toHaveLength(14);
    expect(rows).toHaveLength(100);
    expect(rows.reduce((sum, row) => sum + row.cash_amount, 0)).toBe(1150000);
    expect(result.categories[0].prizes.map((p) => p.place).slice(-10)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(result.categories.every((c) => Object.keys(c.criteria_json).length === 0)).toBe(true);
  });
});
