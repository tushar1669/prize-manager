import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";

const {
  mockNavigate,
  mockResetPasswordForEmail,
  mockResend,
  mockSupabaseSignUp,
  mockUpdateUser,
  mockGetSession,
  mockOnAuthStateChange,
  mockVerifyOtp,
  mockExchangeCodeForSession,
  mockSetSession,
  mockGetUser,
  mockFromSelectEqSingle,
  mockToastSuccess,
  mockToastError,
  mockToastInfo,
  mockToastMessage,
  authState,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockResetPasswordForEmail: vi.fn(),
  mockResend: vi.fn(),
  mockSupabaseSignUp: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockVerifyOtp: vi.fn(),
  mockExchangeCodeForSession: vi.fn(),
  mockSetSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockFromSelectEqSingle: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockToastInfo: vi.fn(),
  mockToastMessage: vi.fn(),
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
      resend: mockResend,
      signUp: mockSupabaseSignUp,
      updateUser: mockUpdateUser,
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      verifyOtp: mockVerifyOtp,
      exchangeCodeForSession: mockExchangeCodeForSession,
      setSession: mockSetSession,
      getUser: mockGetUser,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mockFromSelectEqSingle,
        }),
      }),
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
    info: mockToastInfo,
    message: mockToastMessage,
  },
}));

vi.mock("@/components/public/PublicHeader", () => ({
  PublicHeader: () => React.createElement("div", null, "header"),
}));

import Auth from "@/pages/Auth";
import AuthCallback from "@/pages/AuthCallback";
import ResetPassword from "@/pages/ResetPassword";

describe("auth reset flow", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockResetPasswordForEmail.mockReset();
    mockResend.mockReset();
    mockSupabaseSignUp.mockReset();
    mockUpdateUser.mockReset();
    mockGetSession.mockReset();
    mockOnAuthStateChange.mockReset();
    mockVerifyOtp.mockReset();
    mockExchangeCodeForSession.mockReset();
    mockSetSession.mockReset();
    mockGetUser.mockReset();
    mockFromSelectEqSingle.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mockToastInfo.mockReset();
    mockToastMessage.mockReset();
    authState.user = null;
    authState.signIn.mockResolvedValue({ error: null });
    authState.signUp.mockResolvedValue({ data: null, error: null });

    mockResetPasswordForEmail.mockResolvedValue({ error: null });
    mockResend.mockResolvedValue({ error: null });
    mockSupabaseSignUp.mockResolvedValue({ data: { user: { identities: [{ id: "identity-1" }] } }, error: null });
    mockUpdateUser.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });
    mockVerifyOtp.mockResolvedValue({ data: null, error: null });
    mockExchangeCodeForSession.mockResolvedValue({ data: null, error: null });
    mockSetSession.mockResolvedValue({ data: null, error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFromSelectEqSingle.mockResolvedValue({ data: { role: "organizer", is_verified: true } });
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

    expect(screen.getByRole("button", { name: /try again in 60s/i })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: /try again in 60s/i }));
    expect(mockResetPasswordForEmail).toHaveBeenCalledTimes(1);

  });

  it("applies resend confirmation cooldown copy consistently", async () => {
    vi.useFakeTimers();

    render(React.createElement(MemoryRouter, { initialEntries: ["/auth?mode=signup"] }, React.createElement(Auth)));

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "organizer@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockResend).toHaveBeenCalledTimes(0);
    expect(screen.getByRole("button", { name: /try again in 60s/i })).toHaveProperty("disabled", true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("button", { name: /try again in 59s/i })).toHaveProperty("disabled", true);
  });


  it("reuses resend helper behavior in callback recovery UI with cooldown", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    render(React.createElement(MemoryRouter, { initialEntries: ["/auth/callback?ref=ref-abc"] }, React.createElement(AuthCallback)));

    await screen.findByText(/confirmation required/i);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "organizer@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: /resend confirmation email/i }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockResend).toHaveBeenCalledWith({
      type: "signup",
      email: "organizer@example.com",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback?ref=REF-ABC" },
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("Confirmation email sent. Check your inbox (and spam folder).");

    expect(screen.getByRole("button", { name: /try again in 60s/i })).toHaveProperty("disabled", true);
  });

  it("applies shared resend rate-limit handling on auth page", async () => {
    vi.useFakeTimers();
    mockResend.mockResolvedValue({ error: { message: "Too many requests", status: 429 } });

    render(React.createElement(MemoryRouter, null, React.createElement(Auth)));

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "organizer@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /need to confirm your email\? resend link/i }));
    fireEvent.click(screen.getByRole("button", { name: /resend confirmation email/i }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockResend).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledWith("Too many requests. Please wait a minute before resending.");
    expect(screen.getByRole("button", { name: /try again in 60s/i })).toHaveProperty("disabled", true);
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
