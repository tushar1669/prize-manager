import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TeamPrizeResultsResponse } from '@/components/team-prizes/useTeamPrizeResults';

interface PublicTeamPrizesResponse extends TeamPrizeResultsResponse {
  hasTeamPrizes: boolean;
}

/**
 * Hook for fetching team prize results on PUBLIC pages.
 * Uses the publicTeamPrizes edge function (no auth required).
 * Only works for published tournaments.
 */
export function usePublicTeamPrizes(tournamentId: string | undefined, slug?: string) {
  return useQuery<PublicTeamPrizesResponse | null>({
    queryKey: ['public-team-prizes', tournamentId, slug],
    queryFn: async () => {
      if (!tournamentId && !slug) return null;

      const { data, error } = await supabase.functions.invoke('publicTeamPrizes', {
        body: { tournament_id: tournamentId, slug },
      });

      if (error) {
        console.error('[usePublicTeamPrizes] Error:', error);
        throw error;
      }

      return data as PublicTeamPrizesResponse;
    },
    enabled: !!(tournamentId || slug),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
