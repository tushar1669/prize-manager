import { describe, expect, it } from "vitest";
import { fetchImportQualitySummary, parseImportSummary } from "../src/components/import/ImportQualityNotes";

const buildTournamentClient = (summary: unknown, calls: string[]) => ({
  from: (table: string) => {
    calls.push(table);
    if (table === "tournaments") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { latest_import_quality: summary },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "import_logs") {
      return {
        select: () => ({
          eq: () => ({
            filter: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  },
});

describe("ImportQualityNotes helpers", () => {
  it("parses tie rank rows without optional excelRowNumber", () => {
    const summary = parseImportSummary({
      tieRanks: {
        totalImputed: 1,
        rows: [{ rowIndex: 0, tieAnchorRank: 1, imputedRank: 2, nextPrintedRank: 3 }],
        warnings: [],
      },
      dob: { totalImputed: 0, rows: [] },
    });

    expect(summary?.tieRanks.rows).toHaveLength(1);
    expect(summary?.tieRanks.rows[0].excelRowNumber).toBeUndefined();
  });

  it("loads persisted summaries even when import logs are disabled", async () => {
    const calls: string[] = [];
    const summary = {
      tieRanks: { totalImputed: 1, rows: [], warnings: [] },
      dob: { totalImputed: 0, rows: [] },
    };
    const client = buildTournamentClient(summary, calls);

    const result = await fetchImportQualitySummary({
      tournamentId: "t-123",
      importLogsEnabled: false,
      client: client as never,
    });

    expect(result?.summary.tieRanks.totalImputed).toBe(1);
    expect(calls).toContain("tournaments");
    expect(calls).not.toContain("import_logs");
  });
});
