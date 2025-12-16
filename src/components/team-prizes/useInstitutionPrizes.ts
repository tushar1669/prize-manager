import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { InstitutionPrizeGroup, InstitutionPrize, InstitutionPrizeDelta } from './types';

/**
 * Hook to fetch institution prize groups for a tournament
 */
export function useInstitutionPrizeGroups(tournamentId: string | undefined) {
  return useQuery({
    queryKey: ['institution_prize_groups', tournamentId],
    queryFn: async () => {
      if (!tournamentId) return [];
      
      const { data, error } = await supabase
        .from('institution_prize_groups')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('name');
      
      if (error) throw error;
      return (data || []) as InstitutionPrizeGroup[];
    },
    enabled: !!tournamentId,
  });
}

/**
 * Hook to fetch institution prizes for specific groups
 */
export function useInstitutionPrizes(tournamentId: string | undefined, groupIds: string[]) {
  return useQuery({
    queryKey: ['institution_prizes', tournamentId, groupIds],
    queryFn: async () => {
      if (!groupIds.length) return [];
      
      const { data, error } = await supabase
        .from('institution_prizes')
        .select('*')
        .in('group_id', groupIds)
        .order('place');
      
      if (error) throw error;
      return (data || []) as InstitutionPrize[];
    },
    enabled: !!tournamentId && groupIds.length > 0,
  });
}

/**
 * Hook to create a new institution prize group
 */
export function useCreateInstitutionGroup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (group: Omit<InstitutionPrizeGroup, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('institution_prize_groups')
        .insert(group)
        .select()
        .single();
      
      if (error) throw error;
      return data as InstitutionPrizeGroup;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['institution_prize_groups', data.tournament_id] });
    },
  });
}

/**
 * Hook to update an institution prize group
 */
export function useUpdateInstitutionGroup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<InstitutionPrizeGroup> & { id: string }) => {
      const { data, error } = await supabase
        .from('institution_prize_groups')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as InstitutionPrizeGroup;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['institution_prize_groups', data.tournament_id] });
    },
  });
}

/**
 * Hook to delete an institution prize group (cascades to prizes)
 */
export function useDeleteInstitutionGroup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, tournamentId }: { id: string; tournamentId: string }) => {
      const { error } = await supabase
        .from('institution_prize_groups')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return { id, tournamentId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['institution_prize_groups', data.tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['institution_prizes'] });
    },
  });
}

/**
 * Hook to save institution prizes (insert/update/delete)
 */
export function useSaveInstitutionPrizes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      groupId,
      tournamentId,
      delta,
    }: { groupId: string; tournamentId: string; delta: InstitutionPrizeDelta }) => {
      // Deletes first to free up place constraints
      if (delta.deletes.length > 0) {
        const { error } = await supabase
          .from('institution_prizes')
          .delete()
          .in('id', delta.deletes);
        if (error) {
          throw new Error(`Delete failed: ${error.message}`);
        }
      }

      // Inserts
      if (delta.inserts.length > 0) {
        const insertRows = delta.inserts.map(p => ({
          group_id: groupId,
          place: p.place,
          cash_amount: p.cash_amount,
          has_trophy: p.has_trophy,
          has_medal: p.has_medal,
          is_active: p.is_active,
        }));

        const { data, error } = await supabase
          .from('institution_prizes')
          .insert(insertRows)
          .select();

        if (error) {
          // Include key identifiers for RCA/debugging
          throw new Error(
            `Insert failed (status=${(error as any).status ?? 'n/a'} code=${(error as any).code ?? 'n/a'}): ${error.message} (tournamentId=${tournamentId} group_id=${groupId})`
          );
        }

        if (!data || data.length === 0) {
          throw new Error(
            `Insert succeeded but returned no rows. This usually indicates missing SELECT permission on institution_prizes (tournamentId=${tournamentId} group_id=${groupId}).`
          );
        }
      }

      // Updates
      if (delta.updates.length > 0) {
        for (const update of delta.updates) {
          const { error } = await supabase
            .from('institution_prizes')
            .update({
              place: update.place,
              cash_amount: update.cash_amount,
              has_trophy: update.has_trophy,
              has_medal: update.has_medal,
              is_active: update.is_active,
            })
            .eq('id', update.id);

          if (error) {
            throw new Error(
              `Update failed (status=${(error as any).status ?? 'n/a'} code=${(error as any).code ?? 'n/a'}): ${error.message} (tournamentId=${tournamentId} group_id=${groupId} id=${update.id})`
            );
          }
        }
      }

      return { groupId, tournamentId };
    },
    onSuccess: (_data, variables) => {
      // Invalidate all institution_prizes queries for this tournament
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'institution_prizes' &&
          query.queryKey[1] === variables.tournamentId,
      });
      // Also invalidate groups to refresh prize counts
      queryClient.invalidateQueries({ queryKey: ['institution_prize_groups', variables.tournamentId] });
    },
    onError: (error: any) => {
      const message = error?.message || 'Failed to save institution prizes';
      toast.error(message);
    },
  });
}
