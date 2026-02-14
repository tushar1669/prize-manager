import { describe, expect, it } from "vitest";
import { buildMartechMetrics, withinDateRange } from "@/hooks/useMartechMetrics";

describe("withinDateRange", () => {
  it("returns true for all rows when no range is selected", () => {
    expect(withinDateRange(null, { from: null, to: null })).toBe(true);
    expect(withinDateRange("2025-01-01T00:00:00.000Z", { from: null, to: null })).toBe(true);
  });

  it("honors inclusive day boundaries", () => {
    expect(
      withinDateRange("2025-01-15T23:59:59.999Z", {
        from: new Date("2025-01-15T00:00:00.000Z"),
        to: new Date("2025-01-15T00:00:00.000Z"),
      }),
    ).toBe(true);
  });
});

describe("buildMartechMetrics", () => {
  it("builds expected funnels and import health summaries", () => {
    const result = buildMartechMetrics({
      organizers: [
        { user_id: "u1", is_verified: true, created_at: "2025-01-01T00:00:00.000Z" },
        { user_id: "u2", is_verified: false, created_at: "2025-01-01T00:00:00.000Z" },
      ],
      tournaments: [
        { id: "t1", owner_id: "u1", created_at: "2025-01-02T00:00:00.000Z", is_published: false },
        { id: "t2", owner_id: "u1", created_at: "2025-01-03T00:00:00.000Z", is_published: true },
      ],
      publishedTournaments: [{ id: "t2", published_at: "2025-01-04T00:00:00.000Z" }],
      imports: [
        {
          id: "i1",
          tournament_id: "t1",
          imported_at: "2025-01-05T00:00:00.000Z",
          accepted_rows: 8,
          skipped_rows: 2,
          total_rows: 10,
          duration_ms: 2000,
          top_reasons: { duplicate: 2, invalid: 1 },
        },
      ],
      allocations: [{ id: "a1", tournament_id: "t1", created_at: "2025-01-06T00:00:00.000Z" }],
      players: [{ id: "p1", created_at: "2025-01-07T00:00:00.000Z" }],
      entitlements: [{ id: "e1", source: "coupon", starts_at: null, ends_at: null, created_at: null }],
    });

    expect(result.kpis.totalOrganizers).toBe(2);
    expect(result.kpis.verifiedOrganizers).toBe(1);
    expect(result.organizerFunnel[2]).toMatchObject({ label: "Created ≥1 tournament", value: 1 });
    expect(result.tournamentFunnel[1]).toMatchObject({ label: "With import logs", value: 1 });
    expect(result.importHealth.avgAcceptanceRate).toBeCloseTo(0.8);
    expect(result.importHealth.topReasons[0]).toMatchObject({ reason: "duplicate", count: 2 });
    expect(result.revenueProxy.bySource[0]).toMatchObject({ source: "coupon", count: 1 });
  });
});
