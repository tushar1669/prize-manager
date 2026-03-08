import type { GroupResponse, WinnerInstitution } from '@/components/team-prizes/useTeamPrizeResults';

export interface TieInfo {
  groupId: string;
  groupName: string;
  /** The prize places involved in the tie cluster */
  affectedPlaces: number[];
  /** All institutions in the tie cluster (including runner-up if applicable) */
  tiedInstitutions: WinnerInstitution[];
  /** Whether a note already exists (tie resolved) */
  hasNote: boolean;
}

function scoresEqual(a: WinnerInstitution, b: WinnerInstitution): boolean {
  return (
    a.total_points === b.total_points &&
    a.rank_sum === b.rank_sum &&
    a.best_individual_rank === b.best_individual_rank
  );
}

/**
 * Detect true ties at prize boundaries within a team prize group.
 *
 * A "true tie" means two or more institutions share identical
 * total_points, rank_sum, AND best_individual_rank, and at least one
 * of them sits at the boundary between "gets a prize" and "doesn't".
 *
 * Uses `scored_institutions` (from edge function) when available to
 * also detect ties with the first runner-up beyond the last prize.
 */
export function detectTeamTiesAtBoundary(group: GroupResponse): TieInfo | null {
  const filledPrizes = group.prizes.filter((p) => p.winner_institution !== null);
  if (filledPrizes.length === 0) return null;

  // Sort by place to ensure order
  const sorted = [...filledPrizes].sort((a, b) => a.place - b.place);
  const lastWinner = sorted[sorted.length - 1].winner_institution!;

  // Build a cluster of all institutions matching the boundary score
  const clusterInstitutions: WinnerInstitution[] = [];
  const affectedPlaces: number[] = [];

  // Check winners from the end backwards for matching scores
  for (let i = sorted.length - 1; i >= 0; i--) {
    const w = sorted[i].winner_institution!;
    if (scoresEqual(w, lastWinner)) {
      clusterInstitutions.unshift(w);
      affectedPlaces.unshift(sorted[i].place);
    } else {
      break;
    }
  }

  // Check runner-up from scored_institutions
  const scoredList = (group as GroupResponse & { scored_institutions?: WinnerInstitution[] }).scored_institutions;
  let hasRunnerUpTie = false;

  // Use max awarded prize place (gap-safe: handles non-contiguous places like 1, 3)
  const maxPrizePlace = sorted[sorted.length - 1].place;
  if (scoredList && scoredList.length > maxPrizePlace) {
    // scored_institutions is 0-indexed by rank position; first non-winner is at index maxPrizePlace
    const runnerUp = scoredList[maxPrizePlace];
    if (runnerUp && scoresEqual(runnerUp, lastWinner)) {
      hasRunnerUpTie = true;
      // Add runner-up to cluster (it doesn't have a prize place)
      clusterInstitutions.push(runnerUp);
    }
  }

  // Only report a tie if there are 2+ institutions in the cluster
  // AND at least one boundary crossing (adjacent winners tied, or winner tied with runner-up)
  if (clusterInstitutions.length < 2) return null;
  if (!hasRunnerUpTie && affectedPlaces.length < 2) return null;

  return {
    groupId: group.group_id,
    groupName: group.name,
    affectedPlaces,
    tiedInstitutions: clusterInstitutions,
    hasNote: !!group.note,
  };
}

/**
 * Check if any group has an unresolved tie.
 */
export function hasUnresolvedTeamTies(groups: GroupResponse[]): boolean {
  return groups.some((g) => {
    const tie = detectTeamTiesAtBoundary(g);
    return tie !== null && !tie.hasNote;
  });
}
