import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const {
  mockNavigate,
  mockSignOut,
  mockToastSuccess,
  authState,
  roleState,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSignOut: vi.fn().mockResolvedValue({ error: null }),
  mockToastSuccess: vi.fn(),
  authState: {
    user: null as { email?: string } | null,
    loading: false,
  },
  roleState: {
    role: "organizer",
    isMaster: false,
    isVerified: false,
    loading: false,
  },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
    signOut: mockSignOut,
  }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => roleState,
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
  },
}));


vi.mock("@/components/GuardedLink", () => ({
  GuardedLink: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) =>
    React.createElement("a", { href: to, className }, children),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  DropdownMenuItem: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) =>
    React.createElement("button", { type: "button", className, onClick }, children),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  DropdownMenuSeparator: () => React.createElement("hr"),
}));

import RootRedirect from "@/components/RootRedirect";
import PendingApproval from "@/pages/PendingApproval";
import { AppNav } from "@/components/AppNav";

describe("root routing and logout landing", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSignOut.mockClear();
    mockToastSuccess.mockClear();
    authState.user = null;
    authState.loading = false;
    roleState.role = "organizer";
    roleState.isMaster = false;
    roleState.isVerified = false;
    roleState.loading = false;
  });

  it("redirects unauthenticated root visits to /public", async () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/"] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: "/", element: React.createElement(RootRedirect) }),
          React.createElement(Route, { path: "/public", element: React.createElement("div", null, "Public landing") })
        )
      )
    );

    expect(await screen.findByText("Public landing")).toBeTruthy();
  });

  it("redirects authenticated root visits to /dashboard", async () => {
    authState.user = { email: "user@example.com" };

    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/"] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: "/", element: React.createElement(RootRedirect) }),
          React.createElement(Route, { path: "/dashboard", element: React.createElement("div", null, "Dashboard home") })
        )
      )
    );

    expect(await screen.findByText("Dashboard home")).toBeTruthy();
  });

  it("sends AppNav logout to /", async () => {
    authState.user = { email: "user@example.com" };

    render(React.createElement(MemoryRouter, null, React.createElement(AppNav)));

    fireEvent.click(screen.getByRole("button", { name: /logout/i }));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockToastSuccess).toHaveBeenCalledWith("Logged out successfully");
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("sends PendingApproval sign out to /", async () => {
    authState.user = { email: "pending@example.com" };

    render(React.createElement(MemoryRouter, null, React.createElement(PendingApproval)));

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });
  });
});
