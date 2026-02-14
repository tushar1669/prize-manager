import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TournamentAccessState {
  hasFullAccess: boolean;
  isFreeSmall: boolean;
  playersCount: number;
  previewMainLimit: number;
  isLoading: boolean;
  /** Set when the RPC call fails (e.g. missing DB migration) */
  errorCode: string | null;
}

interface AccessRow {
  has_full_access: boolean;
  is_free_small_tournament: boolean;
  players_count: number;
  preview_main_limit: number;
}

const FUNCTION_MISSING_CODES = ['42883', 'PGRST202'];

export function useTournamentAccess(tournamentId?: string): TournamentAccessState {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tournament-access', tournamentId],
    enabled: !!tournamentId,
    staleTime: 60_000,
    retry: (failureCount, err: any) => {
      // Don't retry if the function simply doesn't exist
      const code = err?.code ?? '';
      if (FUNCTION_MISSING_CODES.includes(code)) return false;
      const msg = String(err?.message ?? '').toLowerCase();
      if (msg.includes('function') && msg.includes('does not exist')) return false;
      return failureCount < 2;
    },
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

  // Derive errorCode from the query error
  let errorCode: string | null = null;
  if (error) {
    const pgCode = (error as any)?.code ?? '';
    const msg = String((error as any)?.message ?? '').toLowerCase();
    if (
      FUNCTION_MISSING_CODES.includes(pgCode) ||
      (msg.includes('function') && msg.includes('does not exist'))
    ) {
      errorCode = 'backend_migration_missing';
    } else {
      errorCode = pgCode || 'unknown';
    }
  }

  return {
    // FAIL-CLOSED: default to false until RPC succeeds
    hasFullAccess: data?.has_full_access ?? false,
    isFreeSmall: data?.is_free_small_tournament ?? false,
    playersCount: data?.players_count ?? 0,
    previewMainLimit: data?.preview_main_limit ?? 8,
    isLoading,
    errorCode,
  };
}
