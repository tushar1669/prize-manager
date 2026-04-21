import { supabase } from "@/integrations/supabase/client";

export const REFERRAL_STORAGE_KEY = "pm_referral_code";
export const REFERRAL_SIGNUP_INTENT_KEY = "pm_referral_signup_intent";

export type ResendErrorCode =
  | "missing_email"
  | "invalid_email"
  | "rate_limited"
  | "not_found"
  | "already_confirmed"
  | "unknown";

export type ResendConfirmationResult =
  | { ok: true; email: string; redirectUrl: string; referralCode?: string }
  | { ok: false; code: ResendErrorCode; message: string; email?: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeReferralCode = (value: string | null | undefined) =>
  value?.trim().toUpperCase() || "";

export const buildAuthCallbackRedirect = (referralCode?: string) => {
  const ref = normalizeReferralCode(referralCode);
  return ref
    ? `${window.location.origin}/auth/callback?ref=${encodeURIComponent(ref)}`
    : `${window.location.origin}/auth/callback`;
};

const isRateLimitError = (error: { message?: string; status?: number } | null | undefined): boolean => {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 429 ||
    msg.includes("rate limit") ||
    msg.includes("too many") ||
    msg.includes("for security purposes")
  );
};

interface ResendConfirmationParams {
  resendEmail: string;
  fallbackEmail?: string;
  referralCode?: string;
  referralParam?: string | null;
}

export async function resendConfirmationEmail({
  resendEmail,
  fallbackEmail,
  referralCode,
  referralParam,
}: ResendConfirmationParams): Promise<ResendConfirmationResult> {
  const email = resendEmail.trim() || fallbackEmail?.trim() || "";

  if (!email) {
    return { ok: false, code: "missing_email", message: "Please enter your email address" };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { ok: false, code: "invalid_email", message: "Please enter a valid email address" };
  }

  const resolvedReferral =
    normalizeReferralCode(referralCode) ||
    normalizeReferralCode(referralParam) ||
    normalizeReferralCode(localStorage.getItem(REFERRAL_STORAGE_KEY));

  if (resolvedReferral) {
    localStorage.setItem(REFERRAL_SIGNUP_INTENT_KEY, "1");
  }

  const redirectUrl = buildAuthCallbackRedirect(resolvedReferral);

  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (!error) {
      return { ok: true, email, redirectUrl, referralCode: resolvedReferral || undefined };
    }

    const message = error.message.toLowerCase();
    if (isRateLimitError(error)) {
      return { ok: false, code: "rate_limited", message: "Too many requests. Please wait a minute before resending.", email };
    }
    if (message.includes("not found") || message.includes("does not exist")) {
      return { ok: false, code: "not_found", message: "No account found with this email. Please sign up first.", email };
    }
    if (message.includes("already confirmed")) {
      return { ok: false, code: "already_confirmed", message: "Your email is already confirmed. You can sign in now.", email };
    }

    return { ok: false, code: "unknown", message: error.message, email };
  } catch {
    return { ok: false, code: "unknown", message: "Failed to resend confirmation email", email };
  }
}
