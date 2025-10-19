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

export default function Dashboard() {
  const { user } = useAuth();
  const { role, isMaster } = useUserRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

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
      const ownerCol = await detectOwnerColumn();
      
      // Organizers see only their own; Masters see all
      const { data, error } = role !== 'master'
        ? await supabase
            .from('tournaments')
            .select('*')
            .eq(ownerCol as 'owner_id', user!.id)
            .order('created_at', { ascending: false })
        : await supabase
            .from('tournaments')
            .select('*')
            .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user
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
        .select()
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
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="gap-2">
            <Plus className="h-4 w-4" />
            {createMutation.isPending ? 'Creating...' : 'Create Tournament'}
          </Button>
        </div>

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
                        {isMaster && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteMutation.mutate(tournament.id)}
                            disabled={deleteMutation.isPending}
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
    </div>
  );
}
