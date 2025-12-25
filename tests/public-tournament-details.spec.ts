import { describe, expect, it, vi } from "vitest";
import { fetchPublicTournamentDetails } from "@/utils/publicTournamentDetails";

describe("fetchPublicTournamentDetails", () => {
  it("retries with legacy select when event_code column is missing", async () => {
    const select = vi.fn();
    const eq = vi.fn();
    const maybeSingle = vi.fn();
    const chain = { select, eq, maybeSingle };

    select.mockReturnValue(chain);
    eq.mockReturnValue(chain);
    maybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: "column published_tournaments.event_code does not exist",
          details: null,
          hint: null,
          code: "42703",
        },
        status: 400,
      })
      .mockResolvedValueOnce({
        data: {
          id: "11111111-1111-1111-1111-111111111111",
          title: "Legacy Open",
          start_date: null,
          end_date: null,
        },
        error: null,
        status: 200,
      });

    const supabaseClient = {
      from: vi.fn(() => chain),
    };

    const result = await fetchPublicTournamentDetails(
      supabaseClient as unknown as Parameters<typeof fetchPublicTournamentDetails>[0],
      "legacy-open"
    );

    expect(result).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      title: "Legacy Open",
      start_date: null,
      end_date: null,
    });
    expect(supabaseClient.from).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenCalledTimes(2);
    expect(select.mock.calls[0][0]).toContain("event_code");
    expect(select.mock.calls[1][0]).not.toContain("event_code");
  });
});
