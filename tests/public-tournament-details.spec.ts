import { describe, expect, it, vi } from "vitest";
import { fetchPublicTournamentDetails } from "@/utils/publicTournamentDetails";

describe("fetchPublicTournamentDetails", () => {
  it("matches on publication_slug first", async () => {
    const select = vi.fn();
    const or = vi.fn();
    const eq = vi.fn();
    const maybeSingle = vi.fn();
    const chain = { select, or, eq, maybeSingle };

    select.mockReturnValue(chain);
    or.mockReturnValue(chain);
    maybeSingle.mockResolvedValueOnce({
      data: {
        id: "11111111-1111-1111-1111-111111111111",
        title: "Publication Open",
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
      "publication-open"
    );

    expect(result).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      title: "Publication Open",
      start_date: null,
      end_date: null,
    });
    expect(or).toHaveBeenCalledWith("publication_slug.eq.publication-open,public_slug.eq.publication-open");
    expect(eq).not.toHaveBeenCalled();
    expect(supabaseClient.from).toHaveBeenCalledTimes(1);
  });

  it("matches on public_slug first", async () => {
    const select = vi.fn();
    const or = vi.fn();
    const eq = vi.fn();
    const maybeSingle = vi.fn();
    const chain = { select, or, eq, maybeSingle };

    select.mockReturnValue(chain);
    or.mockReturnValue(chain);
    maybeSingle.mockResolvedValueOnce({
      data: {
        id: "22222222-2222-2222-2222-222222222222",
        title: "Public Open",
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
      "public-open"
    );

    expect(result).toEqual({
      id: "22222222-2222-2222-2222-222222222222",
      title: "Public Open",
      start_date: null,
      end_date: null,
    });
    expect(or).toHaveBeenCalledWith("publication_slug.eq.public-open,public_slug.eq.public-open");
    expect(eq).not.toHaveBeenCalled();
    expect(supabaseClient.from).toHaveBeenCalledTimes(1);
  });

  it("falls back to computed slug when indexed lookup returns no rows", async () => {
    const indexedSelect = vi.fn();
    const indexedOr = vi.fn();
    const indexedEq = vi.fn();
    const indexedMaybeSingle = vi.fn();
    const indexedChain = {
      select: indexedSelect,
      or: indexedOr,
      eq: indexedEq,
      maybeSingle: indexedMaybeSingle,
    };

    const fallbackSelect = vi.fn();
    const fallbackOr = vi.fn();
    const fallbackEq = vi.fn();
    const fallbackMaybeSingle = vi.fn();
    const fallbackChain = {
      select: fallbackSelect,
      or: fallbackOr,
      eq: fallbackEq,
      maybeSingle: fallbackMaybeSingle,
    };

    indexedSelect.mockReturnValue(indexedChain);
    indexedOr.mockReturnValue(indexedChain);
    indexedMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
      status: 200,
    });

    fallbackSelect.mockReturnValue(fallbackChain);
    fallbackEq.mockReturnValue(fallbackChain);
    fallbackMaybeSingle.mockResolvedValueOnce({
      data: {
        id: "33333333-3333-3333-3333-333333333333",
        title: "Legacy Slug Open",
        start_date: null,
        end_date: null,
      },
      error: null,
      status: 200,
    });

    const supabaseClient = {
      from: vi.fn().mockImplementationOnce(() => indexedChain).mockImplementationOnce(() => fallbackChain),
    };

    const result = await fetchPublicTournamentDetails(
      supabaseClient as unknown as Parameters<typeof fetchPublicTournamentDetails>[0],
      "legacy-slug-open"
    );

    expect(result).toEqual({
      id: "33333333-3333-3333-3333-333333333333",
      title: "Legacy Slug Open",
      start_date: null,
      end_date: null,
    });
    expect(indexedOr).toHaveBeenCalledWith("publication_slug.eq.legacy-slug-open,public_slug.eq.legacy-slug-open");
    expect(fallbackEq).toHaveBeenCalledWith("slug", "legacy-slug-open");
    expect(supabaseClient.from).toHaveBeenCalledTimes(2);
  });

  it("retries with legacy select when event_code column is missing", async () => {
    const select = vi.fn();
    const or = vi.fn();
    const eq = vi.fn();
    const maybeSingle = vi.fn();
    const chain = { select, or, eq, maybeSingle };

    select.mockReturnValue(chain);
    or.mockReturnValue(chain);
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
    expect(or).toHaveBeenCalledTimes(2);
    expect(eq).not.toHaveBeenCalled();
  });
});
