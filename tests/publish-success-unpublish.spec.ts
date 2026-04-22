import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockNavigate = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
  },
}));

vi.mock("@/components/AppNav", () => ({
  AppNav: () => React.createElement("div", { "data-testid": "app-nav" }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ id: "t-1" }),
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: { slug: "summer-open" } }),
  };
});

describe("PublishSuccess unpublish flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it("uses atomic unpublish RPC (single call path)", async () => {
    const { default: PublishSuccess } = await import("@/pages/PublishSuccess");
    const queryClient = new QueryClient();

    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(PublishSuccess)
        )
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Unpublish Tournament" }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith("unpublish_tournament", {
        tournament_id: "t-1",
      });
    });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Tournament unpublished — public page is no longer accessible"
    );
  });
});
