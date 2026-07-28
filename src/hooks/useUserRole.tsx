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
  const { user, session, loading: authLoading } = useAuth();

  const roleQuery = useQuery({
    queryKey: ['user-role', user?.id],
    enabled: !!user && !!session?.access_token,
    staleTime: 5 * 60 * 1000,
    retry: 2,
    retryDelay: 500,
    queryFn: async (): Promise<UserRoleData> => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, is_verified')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      // Guard: an authenticated user with no visible role row means the session
      // token was transiently unresolved — auth.uid() was null server-side, so
      // the RLS policy matched zero rows and maybeSingle returned { data: null }.
      // Retries twice with a flat 500ms delay. The enabled gate
      // (session?.access_token) ensures the JWT is present before the
      // query fires, so null data is rare and one retry is enough.
      // This is the permanent fix for the 26 Jul 2026 access incident.
      if (!data) {
        throw new Error('ROLE_NOT_RESOLVED');
      }

      return {
        role: data.role,
        is_verified: data.is_verified ?? false,
      };
    },
  });

  const authzStatus: AuthzStatus = authLoading || (!!user && roleQuery.isPending)
    ? 'loading'
    : roleQuery.isError
      ? 'error'
      : 'ready';

  const role: UserRole | null = user ? (roleQuery.data?.role ?? null) : null;
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
