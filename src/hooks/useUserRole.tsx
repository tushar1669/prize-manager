import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { isEmailAllowedMaster } from "@/lib/masterAllowlist";

type UserRole = 'master' | 'organizer' | 'user';
type AuthzStatus = 'loading' | 'ready' | 'error';

interface UserRoleData {
  role: UserRole;
  is_verified: boolean;
}

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();

  const roleQuery = useQuery({
    queryKey: ['user-role', user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<UserRoleData> => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, is_verified')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return {
        role: data?.role ?? 'organizer',
        is_verified: data?.is_verified ?? false,
      };
    },
  });

  const authzStatus: AuthzStatus = authLoading || (!!user && roleQuery.isPending)
    ? 'loading'
    : roleQuery.isError
      ? 'error'
      : 'ready';

  const role: UserRole | null = user ? (roleQuery.data?.role ?? 'organizer') : null;
  const isVerified = roleQuery.data?.is_verified ?? false;

  // CRITICAL: Master access requires BOTH:
  // 1. role === 'master' in DB
  // 2. email in allowlist (client-side check, backed by server-side RLS)
  // Server-side is_master() function provides the real protection
  const isMaster = role === 'master' && isEmailAllowedMaster(user?.email);

  return {
    authzStatus,
    role,
    is_verified: isVerified,
    is_master: isMaster,
    // Backward-compatible aliases
    loading: authzStatus === 'loading',
    isVerified,
    isMaster,
    error: roleQuery.error,
  };
}
