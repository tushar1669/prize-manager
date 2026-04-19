import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { useRef } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If true, this route requires master access */
  requireMaster?: boolean;
}

/**
 * Protected route wrapper that handles:
 * 1. Unauthenticated users → redirect to /auth
 * 2. Master-only routes require master access
 * 3. Authenticated users can access normal organizer routes
 */
export function ProtectedRoute({ children, requireMaster = false }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { authzStatus, is_master } = useUserRole();
  const hasNotifiedAccessDeniedRef = useRef(false);

  const isLoading = authLoading || authzStatus === 'loading';

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Not logged in → auth page
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Masters bypass all checks
  if (authzStatus === 'ready' && is_master) {
    return <>{children}</>;
  }

  // Master-only routes: non-masters get redirected
  if (requireMaster && authzStatus === 'ready' && !is_master) {
    if (!hasNotifiedAccessDeniedRef.current) {
      hasNotifiedAccessDeniedRef.current = true;
      toast.error("Master access required. Redirected to dashboard.");
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
