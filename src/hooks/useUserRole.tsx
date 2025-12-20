import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { isEmailAllowedMaster } from "@/lib/masterAllowlist";

export function useUserRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<'master' | 'organizer' | 'user' | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setIsVerified(false);
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, is_verified')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user role:', error);
        setRole('organizer'); // Default fallback
        setIsVerified(false);
      } else {
        setRole(data?.role || 'organizer');
        setIsVerified(data?.is_verified ?? false);
      }
      setLoading(false);
    };

    fetchRole();
  }, [user]);

  // CRITICAL: Master access requires BOTH role=master AND email in allowlist
  const isMaster = role === 'master' && isEmailAllowedMaster(user?.email);

  return { role, loading, isMaster, isVerified };
}
