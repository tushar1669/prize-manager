import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TournamentAccessState {
  hasFullAccess: boolean;
  isFreeSmall: boolean;
  playersCount: number;
  previewMainLimit: number;
  isLoading: boolean;
}

interface AccessRow {
  has_full_access: boolean;
  is_free_small_tournament: boolean;
  players_count: number;
  preview_main_limit: number;
}

export function useTournamentAccess(tournamentId?: string): TournamentAccessState {
  const { data, isLoading } = useQuery({
    queryKey: ['tournament-access', tournamentId],
    enabled: !!tournamentId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as Function)(
        'get_tournament_access_state',
        { tournament_id: tournamentId }
      );

      if (error) throw error;

      // RPC returns a single row or array with one row
      const row: AccessRow | null = Array.isArray(data) ? data[0] ?? null : data;
      return row;
    },
  });

  return {
    hasFullAccess: data?.has_full_access ?? true, // default true until loaded
    isFreeSmall: data?.is_free_small_tournament ?? false,
    playersCount: data?.players_count ?? 0,
    previewMainLimit: data?.preview_main_limit ?? 8,
    isLoading,
  };
}
