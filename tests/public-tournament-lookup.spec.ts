import { describe, expect, it, vi } from "vitest";
import { fetchPublishedTournamentBySlug } from "@/utils/publicTournamentLookup";

describe("fetchPublishedTournamentBySlug", () => {
  it("returns published tournament (with brochure) from indexed slug lookup", async () => {
    const select = vi.fn();
    const or = vi.fn();
    const eq = vi.fn();
    const maybeSingle = vi.fn();
    const chain = { select, or, eq, maybeSingle };

    select.mockReturnValue(chain);
    or.mockReturnValue(chain);
    maybeSingle.mockResolvedValueOnce({
      data: {
        id: "1",
        title: "Summer Open",
        slug: "summer-open",
        brochure_url: "123/171111_brochure.pdf",
      },
      error: null,
    });

    const supabaseClient = { from: vi.fn(() => chain) };
    const result = await fetchPublishedTournamentBySlug(
      supabaseClient as unknown as Parameters<typeof fetchPublishedTournamentBySlug>[0],
      "summer-open"
    );

    expect(result?.title).toBe("Summer Open");
    expect(result?.brochure_url).toBe("123/171111_brochure.pdf");
    expect(or).toHaveBeenCalledWith("publication_slug.eq.summer-open,public_slug.eq.summer-open");
    expect(eq).not.toHaveBeenCalled();
  });

  it("falls back to computed slug lookup when indexed lookup misses", async () => {
    const indexedChain = {
      select: vi.fn(),
      or: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    indexedChain.select.mockReturnValue(indexedChain);
    indexedChain.or.mockReturnValue(indexedChain);
    indexedChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const fallbackChain = {
      select: vi.fn(),
      or: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    fallbackChain.select.mockReturnValue(fallbackChain);
    fallbackChain.eq.mockReturnValue(fallbackChain);
    fallbackChain.maybeSingle.mockResolvedValueOnce({
      data: { id: "2", title: "Legacy Open", slug: "legacy-open", brochure_url: null },
      error: null,
    });

    const supabaseClient = {
      from: vi.fn().mockImplementationOnce(() => indexedChain).mockImplementationOnce(() => fallbackChain),
    };

    const result = await fetchPublishedTournamentBySlug(
      supabaseClient as unknown as Parameters<typeof fetchPublishedTournamentBySlug>[0],
      "legacy-open"
    );

    expect(result?.id).toBe("2");
    expect(fallbackChain.eq).toHaveBeenCalledWith("slug", "legacy-open");
  });

  it("returns null when slug is unpublished or missing from public surfaces", async () => {
    const indexedChain = {
      select: vi.fn(),
      or: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    indexedChain.select.mockReturnValue(indexedChain);
    indexedChain.or.mockReturnValue(indexedChain);
    indexedChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const fallbackChain = {
      select: vi.fn(),
      or: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    fallbackChain.select.mockReturnValue(fallbackChain);
    fallbackChain.eq.mockReturnValue(fallbackChain);
    fallbackChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const supabaseClient = {
      from: vi.fn().mockImplementationOnce(() => indexedChain).mockImplementationOnce(() => fallbackChain),
    };

    const result = await fetchPublishedTournamentBySlug(
      supabaseClient as unknown as Parameters<typeof fetchPublishedTournamentBySlug>[0],
      "draft-open"
    );

    expect(result).toBeNull();
  });
});
