import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type EligibleRole = "organizer" | "master";
type AuthzStatus = "loading" | "ready" | "error";

interface UseIssueWelcomeOnboardingRewardArgs {
  userId: string | null | undefined;
  authzStatus: AuthzStatus;
  role: string | null | undefined;
}

const isEligibleRole = (value: string): value is EligibleRole => {
  return value === "organizer" || value === "master";
};

/**
 * Fire-and-forget bootstrap for welcome onboarding reward.
 * 1) Issues the coupon (idempotent server-side).
 * 2) Triggers the email-sender edge function (idempotent via outbox row).
 * Never blocks app navigation; runs once per authenticated user per tab session.
 */
export function useIssueWelcomeOnboardingReward({
  userId,
  authzStatus,
  role,
}: UseIssueWelcomeOnboardingRewardArgs) {
  const calledForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (authzStatus !== "ready") return;
    if (!role || !isEligibleRole(role)) return;

    if (calledForUserRef.current === userId) return;
    calledForUserRef.current = userId;

    (async () => {
      try {
        const { error } = await supabase.rpc("issue_welcome_onboarding_reward");
        if (error) {
          console.warn("[welcome-reward] bootstrap RPC failed", {
            code: error.code,
            message: error.message,
          });
          return;
        }
        const { error: fnError } = await supabase.functions.invoke(
          "sendWelcomeOnboardingEmail",
          { body: {} },
        );
        if (fnError) {
          console.warn("[welcome-reward] email send failed", {
            message: fnError.message,
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "unknown";
        console.warn("[welcome-reward] bootstrap failed", { message });
      }
    })();
  }, [userId, authzStatus, role]);
}
