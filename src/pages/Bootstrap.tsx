import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { isEmailAllowedMaster } from "@/lib/masterAllowlist";

export default function Bootstrap() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Check if current user's email is in master allowlist
  const isAllowed = isEmailAllowedMaster(user?.email);

  const { data: masterExists, isLoading } = useQuery({
    queryKey: ['master-exists'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'master');
      
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });

  const bootstrapMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('bootstrap_master');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const message = typeof data === 'object' && data && 'message' in data ? String(data.message) : 'You are now the master organizer';
      toast.success(message);
      navigate('/dashboard');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to bootstrap master');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Block non-allowlisted users from accessing bootstrap
  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldX className="h-5 w-5 text-destructive" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You are not authorized to access the master bootstrap page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Only designated administrators can claim the master role.
            </p>
            <Button onClick={() => navigate('/dashboard')} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {masterExists ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-500" />
            )}
            Master Organizer Setup
          </CardTitle>
          <CardDescription>
            {masterExists
              ? 'A master organizer already exists for this system.'
              : 'No master organizer has been assigned yet. You can claim this role.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {masterExists ? (
            <>
              <p className="text-sm text-muted-foreground">
                Contact the existing master organizer to grant you access or verify your account.
              </p>
              <Button onClick={() => navigate('/dashboard')} className="w-full">
                Go to Dashboard
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                As the first master organizer, you will have full access to manage tournaments and verify other users.
              </p>
              <Button
                onClick={() => bootstrapMutation.mutate()}
                disabled={bootstrapMutation.isPending}
                className="w-full"
              >
                {bootstrapMutation.isPending ? 'Setting up...' : 'Make Me Master'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
