import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Types matching the edge function response
export interface TeamPlayerInfo {
  player_id: string;
  name: string;
  rank: number;
  points: number;
  gender: string | null;
}

export interface WinnerInstitution {
  key: string;
  label: string;
  total_points: number;
  rank_sum: number;
  best_individual_rank: number;
  players: TeamPlayerInfo[];
}

export interface GroupConfig {
  group_by: string;
  team_size: number;
  female_slots: number;
  male_slots: number;
  scoring_mode: string;
}

export interface PrizeWithWinner {
  id: string;
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  is_active: boolean;
  winner_institution: WinnerInstitution | null;
}

export interface GroupResponse {
  group_id: string;
  name: string;
  config: GroupConfig;
  prizes: PrizeWithWinner[];
  eligible_institutions: number;
  ineligible_institutions: number;
  ineligible_reasons: string[];
}

export interface TeamPrizeResultsResponse {
  groups: GroupResponse[];
  players_loaded: number;
  max_rank: number;
}

export interface UseTeamPrizeResultsOptions {
  /** Whether to trigger the allocation call */
  enabled?: boolean;
  /** Optional allocation version to scope caching */
  allocationVersion?: number | string;
}

const TEAM_PRIZE_RESULT_TTL_MS = 5 * 60 * 1000; // 5 minutes per session

type TeamPrizeCacheEntry = {
  data: TeamPrizeResultsResponse;
  expiresAt: number;
};

const teamPrizeResultCache = new Map<string, TeamPrizeCacheEntry>();

function getCacheKey(tournamentId: string, allocationVersion?: number | string) {
  const versionKey = allocationVersion ?? 'latest';
  return `${tournamentId}:${versionKey}`;
}

export async function fetchTeamPrizeResults(
  tournamentId: string,
  allocationVersion?: number | string
): Promise<TeamPrizeResultsResponse> {
  const cacheKey = getCacheKey(tournamentId, allocationVersion);
  const cached = teamPrizeResultCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const { data: result, error: invokeError } = await supabase.functions.invoke('allocateInstitutionPrizes', {
    body: { tournament_id: tournamentId },
    headers: { Authorization: `Bearer ${session?.access_token}` }
  });

  if (invokeError) throw invokeError;

  const typedResult = result as TeamPrizeResultsResponse;
  teamPrizeResultCache.set(cacheKey, {
    data: typedResult,
    expiresAt: now + TEAM_PRIZE_RESULT_TTL_MS,
  });

  return typedResult;
}

/**
 * Shared hook for fetching team prize allocation results.
 * 
 * Usage:
 * - Pass `tournamentId` and set `enabled: true` when ready (e.g., after preview completes)
 * - Returns `hasTeamPrizes` to check if team prizes are configured
 * - Returns `data` with allocation results when available
 */
export function useTeamPrizeResults(
  tournamentId: string | undefined,
  options: UseTeamPrizeResultsOptions = {}
) {
  const { enabled = true, allocationVersion } = options;

  // Check if team prize groups exist for this tournament
  const { data: hasTeamPrizes, isLoading: checkingTeamPrizes } = useQuery({
    queryKey: ['has-team-prizes', tournamentId],
    queryFn: async () => {
      if (!tournamentId) return false;
      const { count, error } = await supabase
        .from('institution_prize_groups')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('is_active', true);
      if (error) throw error;
      return (count || 0) > 0;
    },
    enabled: !!tournamentId,
  });

  const allocationQueryEnabled = useMemo(
    () => !!tournamentId && !!hasTeamPrizes && enabled,
    [enabled, hasTeamPrizes, tournamentId]
  );

  const {
    data: teamPrizeResults,
    isFetching: teamPrizeLoading,
    error: teamPrizeError,
  } = useQuery({
    queryKey: ['team-prize-results', tournamentId, allocationVersion ?? 'latest'],
    queryFn: async () => {
      if (!tournamentId) throw new Error('Tournament ID missing');
      return fetchTeamPrizeResults(tournamentId, allocationVersion);
    },
    enabled: allocationQueryEnabled,
    staleTime: TEAM_PRIZE_RESULT_TTL_MS,
    gcTime: TEAM_PRIZE_RESULT_TTL_MS * 2,
  });

  return {
    /** Whether active team prize groups exist for this tournament */
    hasTeamPrizes: hasTeamPrizes ?? false,
    /** Whether we're still checking if team prizes exist */
    checkingTeamPrizes,
    /** Team prize allocation results */
    data: allocationQueryEnabled ? (teamPrizeResults ?? null) : null,
    /** Loading state for the allocation call */
    isLoading: allocationQueryEnabled && teamPrizeLoading,
    /** Error message if allocation failed */
    error: allocationQueryEnabled ? (teamPrizeError as Error | null)?.message ?? null : null,
  };
}
