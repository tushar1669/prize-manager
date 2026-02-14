import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";
import { AppNav } from "@/components/AppNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, UserCheck, UserX, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { EdgeFunctionStatus } from "@/components/EdgeFunctionStatus";

// Access controlled by ProtectedRoute requireMaster prop
interface MasterDashboardProps {
  embeddedInAdmin?: boolean;
}

export default function MasterDashboard({ embeddedInAdmin = false }: MasterDashboardProps) {
  const { isMaster, loading: roleLoading } = useUserRole();
  const queryClient = useQueryClient();

  // Pending approvals hook
  const {
    pendingUsers,
    pendingCount,
    isLoading: pendingLoading,
    approve,
    reject,
    isApproving,
    isRejecting,
    refetch: refetchPending,
  } = usePendingApprovals();

  // All users query (existing)
  const { data: users, isLoading } = useQuery({
    queryKey: ['master-users'],
    queryFn: async () => {
      // Get user_roles with profiles for email
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('id, user_id, role, is_verified, created_at')
        .order('created_at', { ascending: false });
      
      if (rolesError) throw rolesError;
      if (!roles) return [];

      // Get profiles for emails
      const userIds = roles.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds);

      if (profilesError) {
        console.warn('Could not fetch profiles:', profilesError);
        return roles.map(r => ({ ...r, email: null }));
      }

      const profileMap = new Map((profiles || []).map(p => [p.id, p.email]));
      return roles.map(r => ({ ...r, email: profileMap.get(r.user_id) || null }));
    },
    enabled: !!isMaster,
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
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      toast.success('Verification status updated');
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to update';
      toast.error(message);
    },
  });

  if (roleLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {!embeddedInAdmin && <AppNav />}
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </div>
      </div>
    );
  }

  // Access is enforced by ProtectedRoute requireMaster; extra guard for safety
  if (!isMaster) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {!embeddedInAdmin && <AppNav />}
      
      <div className={embeddedInAdmin ? "px-0 py-0 max-w-6xl" : "container mx-auto px-6 py-8 max-w-6xl"}>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Master Dashboard</h1>
            <p className="text-muted-foreground">Manage user verification and approvals</p>
            {embeddedInAdmin && (
              <Link to="/dashboard" className="text-sm text-primary hover:underline">
                Back to Dashboard
              </Link>
            )}
          </div>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-sm px-3 py-1">
              {pendingCount} pending approval{pendingCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Pending Approvals Card - PRIORITY */}
        <Card className="mb-6 border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <CardTitle>Organizer Approvals</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {pendingCount > 0 && (
                  <Badge variant="outline" className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700">
                    {pendingCount} pending
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchPending()}
                  disabled={pendingLoading}
                  title="Refresh pending approvals"
                >
                  <RefreshCw className={`h-4 w-4 ${pendingLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
            <CardDescription>Review and approve new organizer registrations</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingLoading ? (
              <div className="py-4 flex justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : pendingUsers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingUsers.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()} {new Date(u.created_at).toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/30"
                            onClick={() => approve(u.user_id)}
                            disabled={isApproving || isRejecting}
                          >
                            <UserCheck className="h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/30"
                            onClick={() => reject(u.user_id)}
                            disabled={isApproving || isRejecting}
                          >
                            <UserX className="h-4 w-4" />
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-6 text-center text-muted-foreground">
                <UserCheck className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No pending approvals</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* All Users Card */}
        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
            <CardDescription>View and manage all user roles</CardDescription>
          </CardHeader>
          <CardContent>
            {users && users.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
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
                      <TableCell className="font-medium">
                        {u.email || <span className="text-muted-foreground italic">No email</span>}
                      </TableCell>
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
