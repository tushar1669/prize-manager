import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Root "/" redirect: sends authenticated users to /dashboard,
 * unauthenticated users to /auth.
 * Prevents the empty "No published tournaments" page from showing
 * in the Lovable preview or fresh deploys.
 */
export default function RootRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return <Navigate to={user ? "/dashboard" : "/auth"} replace />;
}
