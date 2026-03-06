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
  note?: string | null;
  config: GroupConfig;
  prizes: PrizeWithWinner[];
  eligible_institutions: number;
  ineligible_institutions: number;
  ineligible_reasons: string[];
  scored_institutions?: WinnerInstitution[];
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


  if (allocationVersion !== undefined && allocationVersion !== null) {
    const version = Number(allocationVersion);
    const [{ data: groups }, { data: prizes }, { data: allocations }, { data: notes }] = await Promise.all([
      supabase.from('institution_prize_groups').select('*').eq('tournament_id', tournamentId).eq('is_active', true).order('name'),
      supabase.from('institution_prizes').select('*').eq('is_active', true),
      supabase.from('team_allocations').select('*').eq('tournament_id', tournamentId).eq('version', version),
      supabase.from('team_allocation_notes').select('group_id, note').eq('tournament_id', tournamentId).eq('version', version),
    ]);

    if ((groups ?? []).length > 0 && (allocations ?? []).length > 0) {
      const noteByGroup = new Map((notes ?? []).map((n: { group_id: string; note: string }) => [n.group_id, n.note]));
      const byGroup = new Map<string, Array<Record<string, unknown>>>();
      for (const row of (allocations ?? []) as Array<Record<string, unknown>>) {
        const key = String(row.group_id);
        byGroup.set(key, [...(byGroup.get(key) ?? []), row]);
      }
      const response: TeamPrizeResultsResponse = {
        groups: (groups as Array<Record<string, unknown>>).map((g) => {
          const groupRows = byGroup.get(String(g.id)) ?? [];
          const rowByPlace = new Map(groupRows.map((r) => [Number(r.place), r]));
          const groupPrizes = ((prizes ?? []) as Array<Record<string, unknown>>).filter((p) => String(p.group_id) === String(g.id));
          return {
            group_id: String(g.id),
            name: String(g.name ?? ''),
            note: noteByGroup.get(String(g.id)) ?? null,
            config: {
              group_by: String(g.group_by ?? 'club'),
              team_size: Number(g.team_size ?? 0),
              female_slots: Number(g.female_slots ?? 0),
              male_slots: Number(g.male_slots ?? 0),
              scoring_mode: String(g.scoring_mode ?? ''),
            },
            prizes: groupPrizes.map((p) => {
              const winner = rowByPlace.get(Number(p.place));
              // Derive display-only values from player_snapshot (real DB columns only)
              const snapshot = winner ? (Array.isArray(winner.player_snapshot) ? (winner.player_snapshot as TeamPlayerInfo[]) : []) : [];
              const rankSum = snapshot.reduce((sum, pl) => sum + (pl.rank ?? 0), 0);
              const bestRank = snapshot.length > 0 ? Math.min(...snapshot.map((pl) => pl.rank ?? Infinity)) : 0;

              return {
                id: String(p.id),
                place: Number(p.place),
                cash_amount: Number(p.cash_amount ?? 0),
                has_trophy: Boolean(p.has_trophy),
                has_medal: Boolean(p.has_medal),
                is_active: true,
                winner_institution: winner
                  ? {
                      key: String(winner.institution_key ?? ''),
                      label: String(winner.institution_key ?? ''),
                      total_points: Number(winner.total_points ?? 0),
                      rank_sum: rankSum,
                      best_individual_rank: bestRank,
                      players: snapshot,
                    }
                  : null,
              };
            }),
            eligible_institutions: groupRows.length,
            ineligible_institutions: 0,
            ineligible_reasons: [],
          };
        }),
        players_loaded: 0,
        max_rank: 0,
      };

      teamPrizeResultCache.set(cacheKey, { data: response, expiresAt: now + TEAM_PRIZE_RESULT_TTL_MS });
      return response;
    }
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
