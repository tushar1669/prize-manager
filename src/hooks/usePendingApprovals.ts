import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "./useUserRole";

interface PendingUser {
  user_id: string;
  role: string;
  is_verified: boolean;
  created_at: string;
  email: string;
}

/**
 * Hook for master to manage pending organizer approvals.
 * Fetches pending users by joining user_roles with profiles.
 */
export function usePendingApprovals() {
  const { isMaster } = useUserRole();
  const queryClient = useQueryClient();

  // Fetch pending organizers with their emails
  const { data: pendingUsers, isLoading, error } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: async (): Promise<PendingUser[]> => {
      // First get pending user_roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role, is_verified, created_at')
        .eq('role', 'organizer')
        .eq('is_verified', false)
        .order('created_at', { ascending: false });

      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];

      // Get profiles for these users
      const userIds = roles.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Join the data
      const profileMap = new Map((profiles || []).map(p => [p.id, p.email]));
      
      return roles.map(r => ({
        user_id: r.user_id,
        role: r.role,
        is_verified: r.is_verified,
        created_at: r.created_at,
        email: profileMap.get(r.user_id) || 'Unknown email'
      }));
    },
    enabled: isMaster,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ is_verified: true })
        .eq('user_id', userId)
        .eq('role', 'organizer');
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['master-users'] });
      toast.success('Organizer approved');
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to approve';
      toast.error(message);
    },
  });

  // Reject mutation (keeps row but marks as rejected via setting a note or just not approving)
  // For now, we keep them unverified (soft reject)
  const rejectMutation = useMutation({
    mutationFn: async (userId: string) => {
      // For now, we just delete the role row (hard reject)
      // User would need to re-register
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', 'organizer');
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['master-users'] });
      toast.success('Organizer rejected');
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to reject';
      toast.error(message);
    },
  });

  return {
    pendingUsers: pendingUsers || [],
    pendingCount: pendingUsers?.length || 0,
    isLoading,
    error,
    approve: approveMutation.mutate,
    reject: rejectMutation.mutate,
    isApproving: approveMutation.isPending,
    isRejecting: rejectMutation.isPending,
  };
}
