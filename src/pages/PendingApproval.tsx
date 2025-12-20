import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, RefreshCw, LogOut } from "lucide-react";

/**
 * Pending approval page for unverified organizers.
 * Shows when role=organizer and is_verified=false.
 * Masters bypass this entirely.
 */
export default function PendingApproval() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isMaster, isVerified, loading, role } = useUserRole();

  // Redirect to dashboard if approved or master
  useEffect(() => {
    if (loading) return;
    
    // Masters never see this page
    if (isMaster) {
      navigate('/dashboard', { replace: true });
      return;
    }
    
    // Verified organizers go to dashboard
    if (role === 'organizer' && isVerified) {
      navigate('/dashboard', { replace: true });
      return;
    }
  }, [isMaster, isVerified, loading, role, navigate]);

  const handleRefresh = () => {
    // Force a page reload to re-check status
    window.location.reload();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle className="text-xl">Account Pending Approval</CardTitle>
          <CardDescription>
            Your account is waiting for admin verification
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Signed in as</p>
            <p className="font-medium text-foreground">{user?.email}</p>
          </div>
          
          <p className="text-sm text-muted-foreground text-center">
            An administrator will review your account shortly. Once approved, you'll be able to create and manage tournaments.
          </p>
          
          <div className="flex flex-col gap-2">
            <Button onClick={handleRefresh} variant="outline" className="w-full gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh Status
            </Button>
            <Button onClick={handleSignOut} variant="ghost" className="w-full gap-2 text-muted-foreground">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
