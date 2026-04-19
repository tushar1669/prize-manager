import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useApplyPendingReferral } from "@/hooks/useApplyPendingReferral";

const {
  mockRpc,
  mockGetUser,
  mockUpdateUser,
} = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockGetUser: vi.fn(),
  mockUpdateUser: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mockRpc,
    auth: {
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
    },
  },
}));

function Harness({ userId }: { userId: string | null }) {
  const user = userId ? ({ id: userId } as never) : null;
  useApplyPendingReferral(user);
  return null;
}

describe("useApplyPendingReferral", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockGetUser.mockReset();
    mockUpdateUser.mockReset();
    localStorage.clear();
    window.history.replaceState({}, "", "/dashboard");

    mockRpc.mockResolvedValue({ data: { ok: true, reason: "applied" }, error: null });
    mockGetUser.mockResolvedValue({
      data: { user: { user_metadata: {} } },
    });
    mockUpdateUser.mockResolvedValue({ error: null });
  });

  it("applies referral for newly signed up user using metadata", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { user_metadata: { pending_referral_code: "ref-abcd1234" } } },
    });

    render(React.createElement(Harness, { userId: "user-1" }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith("apply_referral_code", {
        referral_code: "REF-ABCD1234",
      });
    });

    expect(mockUpdateUser).toHaveBeenCalledWith({ data: { pending_referral_code: null } });
  });

  it("does not apply referral on existing-account sign in with only URL referral code", async () => {
    window.history.replaceState({}, "", "/auth/callback?ref=REF-ONLYURL");

    render(React.createElement(Harness, { userId: "user-2" }));

    await waitFor(() => {
      expect(mockGetUser).toHaveBeenCalledTimes(1);
    });

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("does not apply referral during reset-password flow", async () => {
    window.history.replaceState({}, "", "/reset-password?ref=REF-ABCD");
    localStorage.setItem("pm_referral_signup_intent", "1");
    localStorage.setItem("pm_referral_code", "REF-ABCD");

    render(React.createElement(Harness, { userId: "user-3" }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("is idempotent when referral is already applied", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { user_metadata: { pending_referral_code: "REF-DUPL1CAT" } } },
    });
    mockRpc.mockResolvedValue({ data: { ok: true, reason: "already_applied" }, error: null });

    const { rerender } = render(React.createElement(Harness, { userId: "user-4" }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    rerender(React.createElement(Harness, { userId: "user-4" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
