import { useEffect, useState } from "react";
import { toast } from "sonner";
import { resendConfirmationEmail } from "@/lib/auth/resendConfirmation";

const RESEND_COOLDOWN_SECONDS = 60;
const RESEND_SUCCESS_MESSAGE = "Confirmation email sent. Check your inbox (and spam folder).";

interface UseResendConfirmationOptions {
  onAlreadyConfirmed?: () => void;
}

interface TriggerResendParams {
  resendEmail: string;
  fallbackEmail?: string;
  referralCode?: string;
  referralParam?: string | null;
}

export function useResendConfirmation({ onAlreadyConfirmed }: UseResendConfirmationOptions = {}) {
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const triggerResendConfirmation = async ({
    resendEmail,
    fallbackEmail,
    referralCode,
    referralParam,
  }: TriggerResendParams) => {
    if (resendLoading || resendCooldown > 0) return;

    setResendLoading(true);
    const result = await resendConfirmationEmail({
      resendEmail,
      fallbackEmail,
      referralCode,
      referralParam,
    });

    if (result.ok === true) {
      toast.success(RESEND_SUCCESS_MESSAGE);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setResendLoading(false);
      return;
    }

    toast.error(result.message);

    if (result.code === "rate_limited") {
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } else if (result.code === "already_confirmed") {
      onAlreadyConfirmed?.();
    }

    setResendLoading(false);
  };

  return {
    resendLoading,
    resendCooldown,
    setResendCooldown,
    triggerResendConfirmation,
  };
}
