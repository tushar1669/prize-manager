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

  // Fail-safe: if role resolution failed after all retries on a master-only
  // route, hold rather than fall through to children (which would grant
  // access without a confirmed role). The user can reload to retry.
  // Guardrail M2: auth must fail SAFE, never fail open.
  if (requireMaster && authzStatus === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-sm text-muted-foreground">Verifying access…</p>
          <button
            className="text-xs text-primary underline"
            onClick={() => window.location.reload()}
          >
            Reload if this persists
          </button>
        </div>
      </div>
    );
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
