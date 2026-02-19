import { describe, it, expect, vi } from "vitest";

// Mock supabase before importing the component
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          range: () => ({
            gte: () => ({
              lte: () => ({
                eq: () => ({
                  or: () => Promise.resolve({ data: [], error: null, count: 0 }),
                }),
              }),
            }),
          }),
        }),
        limit: () => Promise.resolve({ data: [], error: null }),
        eq: () => ({
          or: () => Promise.resolve({ data: [], error: null, count: 0 }),
        }),
        or: () => Promise.resolve({ data: [], error: null, count: 0 }),
      }),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "master-user" }, signIn: vi.fn(), signUp: vi.fn() }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ role: "master", isMaster: true, loading: false }),
}));

describe("AdminAuditLogs", () => {
  it("module exports default component", async () => {
    const mod = await import("@/pages/admin/AdminAuditLogs");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
