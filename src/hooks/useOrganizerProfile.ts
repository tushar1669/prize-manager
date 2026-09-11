import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { normalizeError, toastMessage } from "@/lib/errors/normalizeError";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";
import type { ProfileData } from "@/utils/profileCompletion";

const PROFILE_FIELDS_SELECT =
  "display_name, phone, city, org_name, fide_arbiter_id, profile_completed_at, profile_reward_claimed";

/**
 * F1-B1: update_my_profile rejects a phone it cannot normalise to +91 followed by
 * 10 digits starting 6-9, raising INVALID_PHONE. It is a correctable input mistake,
 * not a fault, so it gets its own copy instead of normalizeError's generic fallback
 * ("Something went wrong") — and no reference ID, which would imply support is needed.
 */
export const INVALID_PHONE_CODE = "INVALID_PHONE";
export const INVALID_PHONE_MESSAGE =
  "Enter a valid Indian mobile number (10 digits starting 6-9).";

/** True when a save rejection is the server's phone-format block. */
export function isInvalidPhoneError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error) return error.message.includes(INVALID_PHONE_CODE);
  if (typeof error === "string") return error.includes(INVALID_PHONE_CODE);
  if (typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "").includes(INVALID_PHONE_CODE);
  }
  return false;
}

/**
 * F2-B1: the save toast used to be chosen from the profile_completed_at null -> set
 * TRANSITION, which stopped matching reality when migration 20260909130000 made
 * update_my_profile issue the reward on ANY save of a complete, unclaimed profile.
 * An organiser already past that transition was handed a coupon and told only
 * "Profile saved.". The message is now driven by what the server reports it did.
 *
 * update_my_profile returns its `reward` key as the verbatim result of
 * claim_profile_completion_reward(), or JSON null when the reward was not
 * attempted (profile incomplete, or already claimed before this save):
 *   { ok: true,  already_claimed: false, coupon_code, coupon_id }  -> just issued
 *   { ok: true,  already_claimed: true,  coupon_code }             -> none issued
 *   { ok: false, reason }                                          -> none issued
 *   null / absent                                                  -> not attempted
 * Only the first case may claim a coupon was earned, so this reads positively:
 * anything that is not an explicit ok/already_claimed=false pair — an older cached
 * response without the key, a malformed body, a non-object — falls through to the
 * plain message rather than promising money the user did not get.
 */
export const PROFILE_SAVED_MESSAGE = "Profile saved.";
export const PROFILE_REWARD_MESSAGE =
  "Profile saved. You earned 1 free tournament upgrade.";

/** True only when this save is the one that minted the coupon. Never throws. */
export function couponWasJustIssued(rpcResult: unknown): boolean {
  if (typeof rpcResult !== "object" || rpcResult === null) return false;
  const { reward } = rpcResult as { reward?: unknown };
  if (typeof reward !== "object" || reward === null) return false;
  const { ok, already_claimed } = reward as {
    ok?: unknown;
    already_claimed?: unknown;
  };
  return ok === true && already_claimed === false;
}

/** The success toast for a save, decided by the server's reported outcome. */
export function saveSuccessMessage(rpcResult: unknown): string {
  return couponWasJustIssued(rpcResult) ? PROFILE_REWARD_MESSAGE : PROFILE_SAVED_MESSAGE;
}

export function useOrganizerProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["organizer-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_FIELDS_SELECT)
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as ProfileData;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<ProfileData>) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("update_my_profile", {
        p_display_name:    updates.display_name    ?? null,
        p_phone:           updates.phone           ?? null,
        p_city:            updates.city            ?? null,
        p_org_name:        updates.org_name        ?? null,
        p_fide_arbiter_id: updates.fide_arbiter_id ?? null,
      });
      if (error) throw new Error(error.message);

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["organizer-profile", user?.id] });
      toast.success(saveSuccessMessage(data));
    },
    onError: (err) => {
      const normalized = normalizeError(err);
      const invalidPhone = isInvalidPhoneError(err);
      toast.error(invalidPhone ? INVALID_PHONE_MESSAGE : toastMessage(normalized));
      logAuditEvent({
        eventType: "profile_save_error",
        message: err instanceof Error ? err.message : String(err),
        friendlyMessage: invalidPhone ? INVALID_PHONE_MESSAGE : normalized.friendlyMessage,
        referenceId: normalized.referenceId,
      });
    },
  });

  return {
    profile: profile ?? null,
    isLoading,
    error,
    save: saveMutation.mutate,
    isSaving: saveMutation.isPending,
    // Exposed so the form can put the message next to the field that caused it;
    // the toast alone leaves the offending input unmarked once it fades.
    saveError: saveMutation.error,
  };
}
