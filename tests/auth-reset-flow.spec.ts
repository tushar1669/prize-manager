import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";

const {
  mockNavigate,
  mockResetPasswordForEmail,
  mockUpdateUser,
  mockGetSession,
  mockOnAuthStateChange,
  mockToastSuccess,
  mockToastError,
  authState,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockResetPasswordForEmail: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  authState: {
    user: null as unknown,
    signIn: vi.fn(),
    signUp: vi.fn(),
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
    signIn: authState.signIn,
    signUp: authState.signUp,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: mockResetPasswordForEmail,
      updateUser: mockUpdateUser,
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

vi.mock("@/components/public/PublicHeader", () => ({
  PublicHeader: () => React.createElement("div", null, "header"),
}));

import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";

describe("auth reset flow", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockResetPasswordForEmail.mockReset();
    mockUpdateUser.mockReset();
    mockGetSession.mockReset();
    mockOnAuthStateChange.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    authState.user = null;
    authState.signIn.mockResolvedValue({ error: null });
    authState.signUp.mockResolvedValue({ data: null, error: null });

    mockResetPasswordForEmail.mockResolvedValue({ error: null });
    mockUpdateUser.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });
    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends forgot-password reset once and applies 60s cooldown", async () => {
    vi.useFakeTimers();

    render(React.createElement(MemoryRouter, null, React.createElement(Auth)));

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "organizer@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: /forgot password\?/i }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockResetPasswordForEmail).toHaveBeenCalledTimes(1);

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith("organizer@example.com", {
      redirectTo: "http://localhost:3000/reset-password",
    });

    expect(screen.getByRole("button", { name: /resend in 60s/i })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: /resend in 60s/i }));
    expect(mockResetPasswordForEmail).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByRole("button", { name: /resend in 59s/i })).toHaveProperty("disabled", true);
  });

  it("calls updateUser when reset passwords match", async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(ResetPassword)));

    await screen.findByRole("button", { name: /update password/i });

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "newsecurepassword" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "newsecurepassword" },
    });

    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "newsecurepassword" });
  });

  it("does not call updateUser when reset passwords mismatch", async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(ResetPassword)));

    await screen.findByRole("button", { name: /update password/i });

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "newsecurepassword" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "differentpassword" },
    });

    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith("Passwords do not match.");
  });
});
