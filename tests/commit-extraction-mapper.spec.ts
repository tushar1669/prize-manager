import { describe, expect, it } from "vitest";
import {
  expandPrize,
  mapCriteria,
  mapPayloadToTables,
  MappingError,
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

describe("criteria vocabulary translation", () => {
  it("maps city and state to the allocation engine's allowed_* lists", () => {
    expect(mapCriteria({ city: "Jaipur" })).toEqual({ allowed_cities: ["Jaipur"] });
    expect(mapCriteria({ state: "Rajasthan" })).toEqual({ allowed_states: ["Rajasthan"] });
  });

  it("maps age and rating bounds to min_/max_ keys", () => {
    expect(mapCriteria({ age_min: 55 })).toEqual({ min_age: 55 });
    expect(mapCriteria({ age_max: 16 })).toEqual({ max_age: 16 });
    expect(mapCriteria({ rating_min: 1401, rating_max: 1650 })).toEqual({ min_rating: 1401, max_rating: 1650 });
  });

  it("maps gender female/male to F/M and omits the neutral any", () => {
    expect(mapCriteria({ gender: "female" })).toEqual({ gender: "F" });
    expect(mapCriteria({ gender: "male" })).toEqual({ gender: "M" });
    expect(mapCriteria({ gender: "any" })).toEqual({});
    expect(mapCriteria(null)).toEqual({});
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
  });
});
