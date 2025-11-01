import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Trash2, Eye } from "lucide-react";
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

export default function Dashboard() {
  const { user } = useAuth();
  const { role, loading: roleLoading, isMaster, isVerified } = useUserRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; tournamentId: string | null; title: string }>(
    { open: false, tournamentId: null, title: "" }
  );

  // Check if master exists for bootstrap link
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
  });

  // Helper to detect ownership column (owner_id vs created_by)
  async function detectOwnerColumn(): Promise<'owner_id' | 'created_by'> {
    try {
      // probe with a harmless limited select
      const { error } = await supabase.from('tournaments')
        .select('owner_id')
        .limit(1);
      if (!error) return 'owner_id';
      if (String(error.message).toLowerCase().includes('owner_id')) return 'created_by';
    } catch {}
    return 'owner_id';
  }

  // Fetch tournaments
  const { data: tournaments, isLoading, error } = useQuery({
    queryKey: ['tournaments', user?.id, role],
    queryFn: async () => {
      console.log('[dashboard] Fetching tournaments for user:', user?.id, 'role:', role);
      
      const ownerCol = await detectOwnerColumn();
      console.log('[dashboard] Using owner column:', ownerCol);
      
      // Organizers see only their own; Masters see all
      const { data, error } = role !== 'master'
        ? await supabase
            .from('tournaments')
            .select('id, title, status, start_date, end_date, venue, city, owner_id, created_at, is_published')
            .eq(ownerCol as 'owner_id', user!.id)
            .order('created_at', { ascending: false })
        : await supabase
            .from('tournaments')
            .select('id, title, status, start_date, end_date, venue, city, owner_id, created_at, is_published')
            .order('created_at', { ascending: false });

      if (error) {
        console.error('[dashboard] Query error:', error);
        throw error;
      }
      
      console.log('[dashboard] Fetched', data?.length || 0, 'tournaments');
      return data;
    },
    enabled: !!user && !roleLoading
  });

  // Create tournament mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const ownerCol = await detectOwnerColumn();
      const today = new Date().toISOString().split('T')[0];
      const payload: any = {
        title: 'Untitled Tournament',
        start_date: today,
        end_date: today,
        status: 'draft'
      };
      payload[ownerCol] = user!.id;

      const { data, error } = await supabase
        .from('tournaments')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
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
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
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

  const filteredTournaments = tournaments?.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
          {(isMaster || isVerified) && (
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="gap-2">
              <Plus className="h-4 w-4" />
              {createMutation.isPending ? 'Creating...' : 'Create Tournament'}
            </Button>
          )}
        </div>

        {/* Creator gate banner */}
        {!isMaster && !isVerified && (
          <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Your account is awaiting master verification before you can create tournaments.
            </p>
          </div>
        )}

        {/* Bootstrap link if no master exists */}
        {!masterExists && (
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
