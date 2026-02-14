import { Navigate, useLocation } from "react-router-dom";
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
 * 2. Unverified organizers → redirect to /pending-approval (except on that page)
 * 3. Non-masters trying to access master routes → redirect to /dashboard
 * 4. Masters and verified organizers → allow through
 */
export function ProtectedRoute({ children, requireMaster = false }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { isMaster, isVerified, loading: roleLoading, role } = useUserRole();
  const location = useLocation();
  const hasNotifiedAccessDeniedRef = useRef(false);

  const isLoading = authLoading || roleLoading;

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

  // Check if on pending-approval page to avoid redirect loop
  const isOnPendingApproval = location.pathname === '/pending-approval';
  
  // Masters bypass all checks
  if (isMaster) {
    return <>{children}</>;
  }

  // Unverified organizers get redirected to pending-approval
  // (unless they're already on that page)
  if (role === 'organizer' && !isVerified && !isOnPendingApproval) {
    return <Navigate to="/pending-approval" replace />;
  }

  // Master-only routes: non-masters get redirected
  if (requireMaster && !isMaster) {
    if (!hasNotifiedAccessDeniedRef.current) {
      hasNotifiedAccessDeniedRef.current = true;
      toast.error("Master access required. Redirected to dashboard.");
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
