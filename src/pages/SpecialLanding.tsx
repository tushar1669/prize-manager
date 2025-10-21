import { useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import { toast } from "sonner";

export default function SpecialLanding() {
  const navigate = useNavigate();
  const { secret } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { isMaster, loading: roleLoading } = useUserRole();

  const correctSecret = import.meta.env.VITE_MASTER_DASHBOARD_SECRET_PATH;

  useEffect(() => {
    if (!authLoading && !roleLoading && (!user || !isMaster || secret !== correctSecret)) {
      toast.error("Access denied");
      navigate('/');
    }
  }, [user, isMaster, authLoading, roleLoading, secret, correctSecret, navigate]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || !isMaster || secret !== correctSecret) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Master Access
          </CardTitle>
          <CardDescription>
            You have master-level access to administrative functions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use the Master Dashboard to manage user verification and access control.
          </p>
          <Button
            onClick={() => navigate(`/master/${secret}`)}
            className="w-full"
          >
            Open Master Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
