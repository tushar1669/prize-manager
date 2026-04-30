import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveFreePlayerThreshold } from '@/constants/tournamentAccess';

export interface TournamentAccessState {
  hasFullAccess: boolean;
  isFreeSmall: boolean;
  playersCount: number;
  previewMainLimit: number;
  freePlayerThreshold: number;
  isLoading: boolean;
  /** Set when the RPC call fails (e.g. missing DB migration) */
  errorCode: string | null;
}

interface AccessRow {
  has_full_access: boolean;
  is_free_small_tournament: boolean;
  players_count: number;
  preview_main_limit: number;
  free_player_threshold?: number | null;
}

const FUNCTION_MISSING_CODES = ['42883', 'PGRST202'];

function parseErrorMeta(err: unknown): { code: string; message: string } {
  if (!err || typeof err !== 'object') return { code: '', message: '' };
  const maybeErr = err as { code?: unknown; message?: unknown };
  return {
    code: typeof maybeErr.code === 'string' ? maybeErr.code : '',
    message: typeof maybeErr.message === 'string' ? maybeErr.message.toLowerCase() : '',
  };
}

export function useTournamentAccess(tournamentId?: string): TournamentAccessState {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tournament-access', tournamentId],
    enabled: !!tournamentId,
    staleTime: 60_000,
    retry: (failureCount, err: unknown) => {
      // Don't retry if the function simply doesn't exist
      const { code, message } = parseErrorMeta(err);
      if (FUNCTION_MISSING_CODES.includes(code)) return false;
      if (message.includes('function') && message.includes('does not exist')) return false;
      return failureCount < 2;
    },
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
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
    const { code: pgCode, message: msg } = parseErrorMeta(error);
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
    freePlayerThreshold: resolveFreePlayerThreshold(data?.free_player_threshold),
    isLoading,
    errorCode,
  };
}
