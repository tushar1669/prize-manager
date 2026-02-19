import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { normalizeError, toastMessage } from "@/lib/errors/normalizeError";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";
import type { ProfileData } from "@/utils/profileCompletion";
import { isProfileComplete } from "@/utils/profileCompletion";

const PROFILE_FIELDS_SELECT =
  "display_name, phone, city, org_name, fide_arbiter_id, profile_completed_at, profile_reward_claimed";

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

      // Check if this save completes the profile for the first time
      const willComplete =
        isProfileComplete(updates) &&
        !profile?.profile_completed_at;

      const payload: Record<string, unknown> = { ...updates };
      if (willComplete) {
        payload.profile_completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", user.id);

      if (error) throw error;
      return { justCompleted: willComplete };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["organizer-profile", user?.id] });
      if (result.justCompleted) {
        toast.success("Profile complete! You earned 1 free tournament.");
      } else {
        toast.success("Profile saved.");
      }
    },
    onError: (err) => {
      const normalized = normalizeError(err);
      toast.error(toastMessage(normalized));
      logAuditEvent({
        eventType: "profile_save_error",
        message: err instanceof Error ? err.message : String(err),
        friendlyMessage: normalized.friendlyMessage,
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
  };
}
