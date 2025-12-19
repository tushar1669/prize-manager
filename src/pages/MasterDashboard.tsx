import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { AppNav } from "@/components/AppNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";
import { EdgeFunctionStatus } from "@/components/EdgeFunctionStatus";

export default function MasterDashboard() {
  const navigate = useNavigate();
  const { secret } = useParams();
  const { user } = useAuth();
  const { isMaster, loading: roleLoading } = useUserRole();
  const queryClient = useQueryClient();

  const correctSecret = import.meta.env.VITE_MASTER_DASHBOARD_SECRET_PATH;

  useEffect(() => {
    if (!roleLoading && (!isMaster || secret !== correctSecret)) {
      toast.error("Access denied");
      navigate('/dashboard');
    }
  }, [isMaster, roleLoading, secret, correctSecret, navigate]);

  const { data: users, isLoading } = useQuery({
    queryKey: ['master-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, user_id, role, is_verified, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!isMaster && secret === correctSecret,
  });

  const toggleVerifiedMutation = useMutation({
    mutationFn: async ({ userId, newValue }: { userId: string; newValue: boolean }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ is_verified: newValue })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['master-users'] });
      toast.success('Verification status updated');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update');
    },
  });

  if (roleLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav />
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!isMaster || secret !== correctSecret) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Master Dashboard</h1>
          <p className="text-muted-foreground">Manage user verification status</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>User Roles</CardTitle>
            <CardDescription>Toggle verification status for organizers</CardDescription>
          </CardHeader>
          <CardContent>
            {users && users.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Verified</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs">{u.user_id.slice(0, 8)}...</TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'master' ? 'default' : 'secondary'}>
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.is_verified ? (
                          <Badge className="bg-green-600">Verified</Badge>
                        ) : (
                          <Badge variant="outline">Unverified</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {u.role !== 'master' && (
                          <Switch
                            checked={u.is_verified}
                            onCheckedChange={(checked) => {
                              toggleVerifiedMutation.mutate({
                                userId: u.user_id,
                                newValue: checked,
                              });
                            }}
                            disabled={toggleVerifiedMutation.isPending}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No users found</p>
              </div>
            )}
          </CardContent>
        </Card>

        <EdgeFunctionStatus />
      </div>
    </div>
  );
}
