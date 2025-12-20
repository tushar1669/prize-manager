import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Trash2, Eye, Shield, UserCheck } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isEmailAllowedMaster } from "@/lib/masterAllowlist";

export default function Dashboard() {
  const { user } = useAuth();
  const { role, loading: roleLoading, isMaster, isVerified } = useUserRole();
  const { pendingCount } = usePendingApprovals();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; tournamentId: string | null; title: string }>(
    { open: false, tournamentId: null, title: "" }
  );
  const hasShownPendingToast = useRef(false);

  // Show toast notification for masters when there are pending approvals
  useEffect(() => {
    if (isMaster && pendingCount > 0 && !hasShownPendingToast.current) {
      hasShownPendingToast.current = true;
      toast.info(
        `${pendingCount} organizer${pendingCount > 1 ? 's' : ''} awaiting approval`,
        { 
          action: { label: "Review", onClick: () => navigate("/master-dashboard") },
          duration: 6000 
        }
      );
    }
  }, [isMaster, pendingCount, navigate]);

  // Only show bootstrap link if no master exists AND current user is in allowlist
  const canShowBootstrap = isEmailAllowedMaster(user?.email);
  
  const { data: masterExists } = useQuery({
    queryKey: ['master-exists'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'master');
      
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: canShowBootstrap, // Only check if user could possibly bootstrap
  });

  // CRITICAL: Non-masters only see their own tournaments (include_all=false)
  // Master status requires BOTH role=master AND email in allowlist (enforced in useUserRole)
  const { data: tournaments, isLoading, error } = useQuery({
    queryKey: ['tournaments', user?.id, isMaster],
    queryFn: async () => {
      // Only masters (role + allowlist) can see all tournaments
      const includeAll = isMaster;
      console.log('[dashboard] fetching via RPC include_all=', includeAll);

      try {
        const { data, error } = await supabase.rpc('list_my_tournaments' as any, { include_all: includeAll });

        if (error) {
          const msg = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
          const rpcMissing =
            error.code === 'PGRST202' ||
            error.code === '404' ||
            /could not find function|no function matches|schema cache/i.test(msg);

          if (rpcMissing) {
            console.warn('[dashboard] RPC missing; falling back to SELECT');

            const { data: fbData, error: fbError } = await supabase
              .from('tournaments')
              .select('*')
              .order('start_date', { ascending: false, nullsFirst: false })
              .order('created_at', { ascending: false })
              .limit(includeAll ? 1000 : 100);

            if (fbError) {
              console.error('[dashboard] fallback error', fbError);
              throw fbError;
            }

            console.log('[dashboard] fallback fetched=', Array.isArray(fbData) ? fbData.length : 0);
            return Array.isArray(fbData) ? fbData : [];
          }

          console.error('[dashboard] rpc error', error);
          throw error;
        }

        console.log('[dashboard] list_my_tournaments fetched=', Array.isArray(data) ? data.length : 0);
        return Array.isArray(data) ? data : [];
      } catch (err) {
        console.error('[dashboard] query error', err);
        throw err;
      }
    },
    enabled: !!user && !roleLoading
  });

  // Create tournament mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const payload: any = {
        title: 'Untitled Tournament',
        start_date: today,
        end_date: today,
        status: 'draft'
      };
      payload.owner_id = user!.id;

      const { data, error } = await supabase
        .from('tournaments')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tournaments', user?.id, role] });
      console.log('[dashboard] query invalidated after mutation');
      navigate(`/t/${data.id}/setup?tab=details`);
    },
    onError: (error: any) => {
      if (error.message?.includes('row-level security')) {
        toast.error('You do not have permission to create tournaments');
      } else {
        toast.error('Failed to create tournament: ' + error.message);
      }
    }
  });

  // Delete mutation (master only)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('tournaments')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments', user?.id, role] });
      console.log('[dashboard] query invalidated after mutation');
      toast.success('Tournament deleted');
    },
    onError: (error: any) => {
      if (error.message?.includes('row-level security')) {
        toast.error('You do not have permission to delete this tournament');
      } else {
        toast.error('Failed to delete tournament: ' + error.message);
      }
    }
  });

  const filteredTournaments = (tournaments || []).filter((t: any) => 
    t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.venue?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleResume = (id: string, status: string) => {
    if (status === 'draft') {
      navigate(`/t/${id}/setup?tab=details`);
    } else if (status === 'finalized') {
      navigate(`/t/${id}/finalize`);
    } else {
      navigate(`/t/${id}/publish`);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      draft: "secondary",
      finalized: "default",
      published: "default"
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || "secondary"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (isLoading) {
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

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav />
        <div className="container mx-auto px-6 py-8">
          <div className="text-center py-12">
            <p className="text-destructive">Error loading tournaments. Please try again.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Tournament Dashboard</h1>
            <p className="text-muted-foreground">Manage your chess tournament prize allocations</p>
          </div>
          <div className="flex items-center gap-3">
            {isMaster && (
              <>
                <Button variant="outline" onClick={() => navigate("/master-dashboard")} className="gap-2 relative">
                  <UserCheck className="h-4 w-4" />
                  Approvals
                  {pendingCount > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-2 -right-2 h-5 min-w-5 px-1.5 text-xs font-semibold"
                    >
                      {pendingCount}
                    </Badge>
                  )}
                </Button>
                <Button variant="outline" onClick={() => navigate("/admin/tournaments")} className="gap-2">
                  <Shield className="h-4 w-4" />
                  Admin
                </Button>
              </>
            )}
            {(isMaster || isVerified) && (
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="gap-2">
                <Plus className="h-4 w-4" />
                {createMutation.isPending ? 'Creating...' : 'Create Tournament'}
              </Button>
            )}
          </div>
        </div>

        {/* Creator gate banner */}
        {!isMaster && !isVerified && (
          <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Your account is awaiting master verification before you can create tournaments.
            </p>
          </div>
        )}

        {/* Bootstrap link - only shown to allowlisted users when no master exists */}
        {canShowBootstrap && !masterExists && (
          <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              No master organizer has been assigned yet.{' '}
              <Button variant="link" className="p-0 h-auto text-blue-600 dark:text-blue-400" onClick={() => navigate('/auth/bootstrap')}>
                Claim master role
              </Button>
            </p>
          </div>
        )}

        <div className="mb-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tournaments..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {filteredTournaments && filteredTournaments.length > 0 ? (
          <div className="bg-card rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead>Tournament</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTournaments.map((tournament) => (
                  <TableRow key={tournament.id} className="border-border">
                    <TableCell className="font-medium text-foreground">{tournament.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(tournament.start_date).toLocaleDateString()} - {new Date(tournament.end_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tournament.venue ? `${tournament.venue}, ${tournament.city || ''}` : '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(tournament.status)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {tournament.status === 'published' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/t/${tournament.id}/public`)}
                            className="gap-2"
                          >
                            <Eye className="h-4 w-4" />
                            View Public
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResume(tournament.id, tournament.status)}
                        >
                          Resume
                        </Button>
                        {isMaster && tournament.status === 'draft' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteDialog({ open: true, tournamentId: tournament.id, title: tournament.title })}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border p-12 text-center">
            <p className="text-muted-foreground mb-4">
              {searchQuery ? 'No tournaments match your search' : 'No tournaments yet'}
            </p>
            {!searchQuery && (
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Your First Tournament
              </Button>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog(s => ({ ...s, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft "{deleteDialog.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the draft tournament and its data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialog({ open: false, tournamentId: null, title: "" })}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteDialog.tournamentId) return;
                deleteMutation.mutate(deleteDialog.tournamentId, {
                  onSettled: () => setDeleteDialog({ open: false, tournamentId: null, title: "" }),
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
