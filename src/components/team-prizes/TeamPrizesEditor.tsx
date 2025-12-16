import React, { useState, useMemo } from 'react';
import { Plus, Settings, Trash2, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { GROUP_BY_OPTIONS, type InstitutionPrizeGroup } from './types';
import { 
  useInstitutionPrizeGroups, 
  useInstitutionPrizes, 
  useCreateInstitutionGroup, 
  useUpdateInstitutionGroup, 
  useDeleteInstitutionGroup,
  useSaveInstitutionPrizes 
} from './useInstitutionPrizes';
import TeamPrizeRulesSheet from './TeamPrizeRulesSheet';
import TeamGroupPrizesTable from './TeamGroupPrizesTable';

interface Props {
  tournamentId: string;
  isOrganizer: boolean;
}

export default function TeamPrizesEditor({ tournamentId, isOrganizer }: Props) {
  const [rulesSheet, setRulesSheet] = useState<{ open: boolean; group: Partial<InstitutionPrizeGroup> | null }>({ open: false, group: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; group?: InstitutionPrizeGroup }>({ open: false });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Fetch groups and prizes
  const { data: groups, isLoading: loadingGroups } = useInstitutionPrizeGroups(tournamentId);
  const groupIds = useMemo(() => (groups || []).map(g => g.id), [groups]);
  const { data: allPrizes, isLoading: loadingPrizes } = useInstitutionPrizes(tournamentId, groupIds);

  // Mutations
  const createGroup = useCreateInstitutionGroup();
  const updateGroup = useUpdateInstitutionGroup();
  const deleteGroup = useDeleteInstitutionGroup();
  const savePrizes = useSaveInstitutionPrizes();

  const toggleExpanded = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleSaveGroup = async (data: Omit<InstitutionPrizeGroup, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => {
    try {
      if (data.id) {
        await updateGroup.mutateAsync({ id: data.id, ...data });
        toast.success('Team group updated');
      } else {
        const newGroup = await createGroup.mutateAsync(data);
        // Expand the new group
        setExpandedGroups(prev => new Set([...prev, newGroup.id]));
        toast.success('Team group created');
      }
      setRulesSheet({ open: false, group: null });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save group');
    }
  };

  const handleDeleteGroup = async () => {
    if (!deleteDialog.group) return;
    try {
      await deleteGroup.mutateAsync({ id: deleteDialog.group.id, tournamentId });
      toast.success('Team group deleted');
      setDeleteDialog({ open: false });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete group');
    }
  };

  const handleToggleActive = async (group: InstitutionPrizeGroup) => {
    try {
      await updateGroup.mutateAsync({ id: group.id, is_active: !group.is_active });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to toggle group');
    }
  };

  const handleSavePrizes = async (groupId: string, delta: any) => {
    await savePrizes.mutateAsync({ groupId, tournamentId, delta });
  };

  const getGroupByLabel = (value: string) => {
    return GROUP_BY_OPTIONS.find(o => o.value === value)?.label || value;
  };

  // RCA fix: Memoize prizes-by-group map so array references are stable across renders.
  // Without this, .filter() inside render creates new array every time, triggering
  // useEffect([initialPrizes]) in TeamGroupPrizesTable and clobbering local draft state.
  const prizesByGroup = useMemo(() => {
    const map = new Map<string, typeof allPrizes>();
    for (const p of allPrizes || []) {
      const list = map.get(p.group_id) || [];
      list.push(p);
      map.set(p.group_id, list);
    }
    return map;
  }, [allPrizes]);

  const isLoading = loadingGroups || loadingPrizes;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team / Institution Prizes
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure team prizes (Best School, Best Academy, Best City Team, etc.)
          </p>
        </div>
        {isOrganizer && (
          <Button onClick={() => setRulesSheet({ open: true, group: null })}>
            <Plus className="h-4 w-4 mr-2" />
            Add Team Prize Group
          </Button>
        )}
      </div>

      {/* Info banner */}
      <div className="rounded-lg border bg-muted/50 p-4 text-sm">
        <p className="font-medium">How team prizes work:</p>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          <li>• Teams are formed by grouping players by their institution (school, club, city, state, etc.)</li>
          <li>• Each team's score is the sum of top-K players' scores</li>
          <li>• Gender requirements ensure mixed teams if needed</li>
          <li>• Players can win both individual AND team prizes (team prizes ignore multi_prize_policy)</li>
        </ul>
      </div>

      {/* Groups list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : !groups || groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No team prize groups configured yet.</p>
            {isOrganizer && (
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setRulesSheet({ open: true, group: null })}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Team Prize Group
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isExpanded = expandedGroups.has(group.id);
            const groupPrizes = prizesByGroup.get(group.id) ?? [];
            const totalCash = groupPrizes.reduce((sum, p) => sum + (p.cash_amount || 0), 0);

            return (
              <Card key={group.id} className={!group.is_active ? 'opacity-60' : ''}>
                <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(group.id)}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={group.is_active}
                          onCheckedChange={() => handleToggleActive(group)}
                          disabled={!isOrganizer}
                        />
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="p-0 h-auto hover:bg-transparent">
                            <CardTitle className="text-base flex items-center gap-2 cursor-pointer">
                              {group.name}
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </CardTitle>
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {isOrganizer && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setRulesSheet({ open: true, group })}
                            >
                              <Settings className="h-4 w-4 mr-1" />
                              Edit Rules
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteDialog({ open: true, group })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Summary chips */}
                    <div className="flex flex-wrap gap-2 mt-2 ml-12">
                      <Badge variant="secondary">{getGroupByLabel(group.group_by)}</Badge>
                      <Badge variant="outline">Top {group.team_size}</Badge>
                      {(group.female_slots > 0 || group.male_slots > 0) && (
                        <Badge variant="outline">
                          {group.female_slots > 0 && `F${group.female_slots}`}
                          {group.female_slots > 0 && group.male_slots > 0 && '/'}
                          {group.male_slots > 0 && `M${group.male_slots}`}
                        </Badge>
                      )}
                      <Badge variant="outline" className="capitalize">
                        {group.scoring_mode.replace(/_/g, ' ')}
                      </Badge>
                      <Badge variant="secondary">
                        {groupPrizes.length} prize{groupPrizes.length !== 1 ? 's' : ''}
                        {totalCash > 0 && ` • ₹${totalCash.toLocaleString('en-IN')}`}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <TeamGroupPrizesTable
                        groupId={group.id}
                        prizes={groupPrizes}
                        onSave={handleSavePrizes}
                        canEdit={isOrganizer}
                      />
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      {/* Rules Sheet */}
      <TeamPrizeRulesSheet
        open={rulesSheet.open}
        onOpenChange={(open) => setRulesSheet({ open, group: rulesSheet.group })}
        group={rulesSheet.group}
        tournamentId={tournamentId}
        onSave={handleSaveGroup}
        saving={createGroup.isPending || updateGroup.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team Prize Group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteDialog.group?.name}" and all its prizes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGroup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
