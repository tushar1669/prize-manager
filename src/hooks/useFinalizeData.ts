/**
 * Hook to load finalize data from location state OR DB fallback.
 * Ensures /finalize works after navigation from /final/v1 or hard refresh.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLatestAllocations } from '@/utils/getLatestAllocations';

export interface FinalizeWinner {
  prizeId: string;
  playerId: string;
  reasons: string[];
  isManual: boolean;
}

export interface FinalizeUnfilled {
  prizeId: string;
  reasonCodes: string[];
}

export interface FinalizeDataResult {
  winners: FinalizeWinner[];
  unfilled: FinalizeUnfilled[];
  version: number | null;
  source: 'state' | 'db' | 'none';
}

interface LocationStateInput {
  winners?: FinalizeWinner[];
  unfilled?: FinalizeUnfilled[];
  finalizeResult?: { version: number };
}

/**
 * Fetches finalized allocation data from DB when location state is missing.
 */
async function fetchFinalizeDataFromDB(tournamentId: string): Promise<FinalizeDataResult> {
  console.log('[useFinalizeData] Fetching from DB for tournament', tournamentId);
  
  const { allocations, version } = await getLatestAllocations(tournamentId);
  
  if (!allocations || allocations.length === 0) {
    console.log('[useFinalizeData] No allocations found in DB');
    return { winners: [], unfilled: [], version: null, source: 'none' };
  }

  // Fetch reason_codes for each allocation to populate reasons
  const { data: allocationsWithReasons, error } = await supabase
    .from('allocations')
    .select('player_id, prize_id, reason_codes, is_manual')
    .eq('tournament_id', tournamentId)
    .eq('version', version);

  if (error) {
    console.error('[useFinalizeData] Error fetching allocation details', error);
    throw error;
  }

  const winners: FinalizeWinner[] = (allocationsWithReasons || [])
    .filter(a => a.player_id && a.prize_id)
    .map(a => ({
      prizeId: a.prize_id!,
      playerId: a.player_id!,
      reasons: a.reason_codes || [],
      isManual: a.is_manual ?? false,
    }));

  // Unfilled = allocations with prize_id but no player_id
  const unfilled: FinalizeUnfilled[] = (allocationsWithReasons || [])
    .filter(a => a.prize_id && !a.player_id)
    .map(a => ({
      prizeId: a.prize_id!,
      reasonCodes: a.reason_codes || [],
    }));

  console.log('[useFinalizeData] Loaded from DB', { 
    source: 'db', 
    version, 
    winnersCount: winners.length,
    unfilledCount: unfilled.length 
  });

  return { winners, unfilled, version, source: 'db' };
}

export function useFinalizeData(
  tournamentId: string | undefined,
  locationState: LocationStateInput | undefined
) {
  // Check if we have valid data in location state
  const stateWinners = locationState?.winners || [];
  const stateUnfilled = locationState?.unfilled || [];
  const stateVersion = locationState?.finalizeResult?.version ?? null;
  const hasStateData = stateWinners.length > 0;

  // Query DB only when state is missing
  const dbQuery = useQuery({
    queryKey: ['finalize-data-db', tournamentId],
    queryFn: () => fetchFinalizeDataFromDB(tournamentId!),
    enabled: !!tournamentId && !hasStateData,
    staleTime: 60_000, // Cache for 1 minute
    refetchOnWindowFocus: false,
  });

  // Determine final data source
  if (hasStateData) {
    console.log('[useFinalizeData] Using location state', { 
      source: 'state', 
      version: stateVersion, 
      winnersCount: stateWinners.length 
    });
    return {
      winners: stateWinners,
      unfilled: stateUnfilled,
      version: stateVersion,
      source: 'state' as const,
      isLoading: false,
      error: null,
    };
  }

  return {
    winners: dbQuery.data?.winners || [],
    unfilled: dbQuery.data?.unfilled || [],
    version: dbQuery.data?.version ?? null,
    source: dbQuery.data?.source || 'none' as const,
    isLoading: dbQuery.isLoading,
    error: dbQuery.error,
  };
}
