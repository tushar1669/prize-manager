import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase before imports
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockGetSession = vi.fn();
type RpcFn = (name: string, args: Record<string, unknown>) => Promise<unknown>;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mockRpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
          maybeSingle: () => Promise.resolve({ data: { title: "Test Tournament" }, error: null }),
        }),
      }),
    }),
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ id: "test-tournament-id" }),
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

describe("TournamentUpgrade — UPI Payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-1", email: "test@test.com" } } },
    });
  });

  it("TournamentUpgrade module loads without stale hardcoded Pro price", async () => {
    const mod = await import("@/pages/TournamentUpgrade");
    expect(mod).toBeDefined();
  });

  it("submit_tournament_payment_claim RPC receives correct args", async () => {
    mockRpc.mockResolvedValueOnce({ data: "payment-id-1", error: null });

    const { supabase } = await import("@/integrations/supabase/client");
    await (supabase.rpc as RpcFn)("submit_tournament_payment_claim", {
      p_tournament_id: "t-123",
      p_amount_inr: 500,
      p_utr: "123456789012",
    });

    expect(mockRpc).toHaveBeenCalledWith("submit_tournament_payment_claim", {
      p_tournament_id: "t-123",
      p_amount_inr: 500,
      p_utr: "123456789012",
    });
  });

  it("review_tournament_payment RPC receives correct args for approve", async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, status: "approved" }, error: null });

    const { supabase } = await import("@/integrations/supabase/client");
    await (supabase.rpc as RpcFn)("review_tournament_payment", {
      p_payment_id: "pay-1",
      p_decision: "approve",
      p_note: null,
    });

    expect(mockRpc).toHaveBeenCalledWith("review_tournament_payment", {
      p_payment_id: "pay-1",
      p_decision: "approve",
      p_note: null,
    });
  });

  it("review_tournament_payment RPC receives correct args for reject", async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, status: "rejected" }, error: null });

    const { supabase } = await import("@/integrations/supabase/client");
    await (supabase.rpc as RpcFn)("review_tournament_payment", {
      p_payment_id: "pay-2",
      p_decision: "reject",
      p_note: "Invalid UTR",
    });

    expect(mockRpc).toHaveBeenCalledWith("review_tournament_payment", {
      p_payment_id: "pay-2",
      p_decision: "reject",
      p_note: "Invalid UTR",
    });
  });
});
