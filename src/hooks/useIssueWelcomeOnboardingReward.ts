import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type EligibleRole = "organizer" | "master";
type AuthzStatus = "loading" | "ready" | "error";

interface UseIssueWelcomeOnboardingRewardArgs {
  userId: string | null | undefined;
  authzStatus: AuthzStatus;
  role: string | null | undefined;
}

/**
 * Fire-and-forget bootstrap call for welcome onboarding reward.
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

    const eligibleRoles: EligibleRole[] = ["organizer", "master"];
    const currentRole = (role ?? "organizer") as EligibleRole;
    if (!eligibleRoles.includes(currentRole)) return;

    if (calledForUserRef.current === userId) return;
    calledForUserRef.current = userId;

    void (supabase.rpc as unknown as (fn: string) => Promise<{ error: { code?: string; message: string } | null }>)(
      "issue_welcome_onboarding_reward"
    )
      .then(({ error }) => {
        if (error) {
          console.warn("[welcome-reward] bootstrap RPC failed", {
            code: error.code,
            message: error.message,
          });
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "unknown";
        console.warn("[welcome-reward] bootstrap RPC failed", { message });
      });
  }, [userId, authzStatus, role]);
}
