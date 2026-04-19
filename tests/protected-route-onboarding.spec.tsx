import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";

const { authState, roleState, mockToastError } = vi.hoisted(() => ({
  authState: {
    user: null as { id: string; email?: string } | null,
    loading: false,
  },
  roleState: {
    authzStatus: "ready" as "loading" | "ready",
    is_master: false,
    is_verified: false,
    role: "organizer" as "organizer" | "master" | "user" | null,
  },
  mockToastError: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
  }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => roleState,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
  },
}));

import { ProtectedRoute } from "@/components/ProtectedRoute";

describe("ProtectedRoute onboarding behavior", () => {
  beforeEach(() => {
    authState.user = { id: "user-1", email: "organizer@example.com" };
    authState.loading = false;
    roleState.authzStatus = "ready";
    roleState.is_master = false;
    roleState.is_verified = false;
    roleState.role = "organizer";
    mockToastError.mockReset();
  });

  it("allows unverified organizer to access organizer routes (fresh signup/signin)", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Dashboard home</div>
              </ProtectedRoute>
            }
          />
          <Route path="/pending-approval" element={<div>Pending approval</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Dashboard home")).toBeTruthy();
    expect(screen.queryByText("Pending approval")).toBeNull();
  });

  it("still blocks non-master users from master-only routes", async () => {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireMaster>
                <div>Admin panel</div>
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard" element={<div>Dashboard home</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Dashboard home")).toBeTruthy();
    expect(screen.queryByText("Admin panel")).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith("Master access required. Redirected to dashboard.");
  });

  it("allows master users through master-only routes", async () => {
    roleState.is_master = true;
    roleState.role = "master";

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireMaster>
                <div>Admin panel</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Admin panel")).toBeTruthy();
  });
});
