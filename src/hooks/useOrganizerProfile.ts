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
      if (error) throw error;

      // profile_completed_at is derived server-side; the client never sends it.
      const justCompleted =
        !profile?.profile_completed_at &&
        !!(data as any)?.profile_completed_at;

      return { justCompleted };
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
