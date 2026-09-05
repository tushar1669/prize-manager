import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * The allocation version pinned by the tournament's active publication.
 *
 * Public surfaces must render exactly the version that was live at publish time,
 * never MAX(version). Returns null when there is no active publication row, or
 * when the tournament was published before it had any allocations.
 *
 * `anon` can read this row via the existing `public_read_active_publications`
 * policy (is_active AND tournaments.is_published) — no policy change needed.
 */
export function usePublishedAllocationVersion(tournamentId?: string) {
  const query = useQuery({
    queryKey: ['published-allocation-version', tournamentId],
    enabled: !!tournamentId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('publications')
        .select('allocation_version')
        .eq('tournament_id', tournamentId as string)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data?.allocation_version ?? null;
    },
  });

  return {
    ...query,
    allocationVersion: query.data ?? null,
    isVersionPending: !!tournamentId && query.isPending,
    // A failed lookup is not evidence the pin is null: callers must keep the
    // selector unresolved and surface an error rather than render "no results".
    isVersionError: !!tournamentId && query.isError,
  };
}
