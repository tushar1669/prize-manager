import { useState, useEffect } from 'react';
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
  const { enabled = true } = options;

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

  // Team prize allocation state
  const [data, setData] = useState<TeamPrizeResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch team prize allocation when enabled and team prizes exist
  useEffect(() => {
    if (!tournamentId || !hasTeamPrizes || !enabled) {
      // Reset state when disabled
      if (!enabled && data) {
        setData(null);
      }
      return;
    }
    
    const fetchTeamPrizes = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const { data: result, error: invokeError } = await supabase.functions.invoke('allocateInstitutionPrizes', {
          body: { tournament_id: tournamentId },
          headers: { Authorization: `Bearer ${session?.access_token}` }
        });
        if (invokeError) throw invokeError;
        console.log('[useTeamPrizeResults] Team prize results:', result);
        setData(result as TeamPrizeResultsResponse);
      } catch (err: any) {
        console.error('[useTeamPrizeResults] Team prize allocation error:', err);
        setError(err?.message || 'Failed to allocate team prizes');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTeamPrizes();
  }, [tournamentId, hasTeamPrizes, enabled]);

  return {
    /** Whether active team prize groups exist for this tournament */
    hasTeamPrizes: hasTeamPrizes ?? false,
    /** Whether we're still checking if team prizes exist */
    checkingTeamPrizes,
    /** Team prize allocation results */
    data,
    /** Loading state for the allocation call */
    isLoading,
    /** Error message if allocation failed */
    error,
  };
}
