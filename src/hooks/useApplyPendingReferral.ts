import { useEffect, useRef } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { REFERRAL_SIGNUP_INTENT_KEY, REFERRAL_STORAGE_KEY } from "@/lib/auth/referralStorageKeys";

/**
 * Check if we're in dev/preview environment or debug mode is active.
 */
function isDebugReferrals(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug_referrals") === "1") return true;
  const origin = window.location.origin;
  return (
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.includes("preview")
  );
}

function redact(code: string): string {
  if (code.length <= 4) return "****";
  return "…" + code.slice(-4);
}

/**
 * Global hook that applies a pending referral code exactly once per
 * authenticated session. Checks three sources in priority order:
 *   1) user_metadata.pending_referral_code (durable cross-device)
 *   2) URL/localStorage, but only when signup intent is present
 *
 * Must be mounted in a component that has access to the authenticated user.
 * Never blocks navigation or login flow.
 */
export function useApplyPendingReferral(user: User | null) {
  const appliedRef = useRef(false);
  const applyingRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    if (appliedRef.current || applyingRef.current) return;

    const apply = async () => {
      applyingRef.current = true;
      const debug = isDebugReferrals();

      try {
        // Never apply referral during password-recovery flow
        if (window.location.pathname === "/reset-password") {
          appliedRef.current = true;
          return;
        }

        // 1) user_metadata
        let refFromMeta = "";
        try {
          const {
            data: { user: freshUser },
          } = await supabase.auth.getUser();
          refFromMeta =
            (
              (freshUser?.user_metadata?.pending_referral_code as string) || ""
            )
              .trim()
              .toUpperCase();
        } catch {
          /* ignore */
        }

        const hasSignupIntent =
          localStorage.getItem(REFERRAL_SIGNUP_INTENT_KEY) === "1";

        // 2) URL/localStorage fallbacks are allowed only when signup intent exists
        const params = new URLSearchParams(window.location.search);
        const refFromUrl = hasSignupIntent
          ? params.get("ref")?.trim().toUpperCase() || ""
          : "";

        const refFromStorage = hasSignupIntent
          ? localStorage.getItem(REFERRAL_STORAGE_KEY)?.trim().toUpperCase() || ""
          : "";

        const refCode = refFromMeta || refFromUrl || refFromStorage;
        const source = refFromMeta
          ? "user_metadata"
          : refFromUrl
            ? "url"
            : refFromStorage
              ? "localStorage"
              : "none";

        if (debug) {
          console.log("[referral-hook] sources:", {
            url: refFromUrl ? redact(refFromUrl) : "(none)",
            meta: refFromMeta ? redact(refFromMeta) : "(none)",
            storage: refFromStorage ? redact(refFromStorage) : "(none)",
            signupIntent: hasSignupIntent,
            chosen: refCode ? redact(refCode) : "(none)",
            source,
          });
        }

        if (!refCode) {
          appliedRef.current = true;
          return;
        }

        // Call RPC
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          "apply_referral_code" as never,
          { referral_code: refCode } as never,
        );

        if (debug) {
          console.log("[referral-hook] RPC result:", rpcResult, "error:", rpcError);
        }

        // Cleanup localStorage
        localStorage.removeItem(REFERRAL_STORAGE_KEY);
        localStorage.removeItem(REFERRAL_SIGNUP_INTENT_KEY);

        // Cleanup user_metadata
        if (refFromMeta) {
          try {
            await supabase.auth.updateUser({
              data: { pending_referral_code: null },
            });
          } catch {
            /* non-blocking */
          }
        }

        appliedRef.current = true;
      } catch (err) {
        if (debug) {
          console.warn("[referral-hook] error (non-blocking):", err);
        }
        // Still mark as applied to avoid retry loops
        appliedRef.current = true;
      } finally {
        applyingRef.current = false;
      }
    };

    apply();
  }, [user?.id]);
}
