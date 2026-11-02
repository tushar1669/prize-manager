import type { GroupResponse, WinnerInstitution } from '@/components/team-prizes/useTeamPrizeResults';

export interface TieInfo {
  groupId: string;
  groupName: string;
  /** Prize places the tied teams compete for */
  affectedPlaces: number[];
  /** Teams in contention, in the scorer's order (may include runners-up) */
  tiedInstitutions: WinnerInstitution[];
  /** Why the tie-break steps could not decide */
  reason: string;
  /** True once every affected place has a winner (the organizer chose the order) */
  hasNote: boolean;
}

/**
 * The team tie the organizer still has to settle in this group, or else the
 * last one already settled (so it can be edited). Ties come from the scorer's
 * `ranking_ties`: places its tie-break steps could not decide. A tie counts as
 * settled when all of its places have winners in the data shown.
 */
export function detectTeamTiesAtBoundary(group: GroupResponse): TieInfo | null {
  const ties = group.ranking_ties ?? [];
  if (ties.length === 0) return null;
  const filled = new Set(
    group.prizes.filter((p) => p.winner_institution !== null).map((p) => p.place),
  );
  const toInfo = (index: number): TieInfo => ({
    groupId: group.group_id,
    groupName: group.name,
    affectedPlaces: ties[index].affected_places,
    tiedInstitutions: ties[index].teams,
    reason: ties[index].reason,
    hasNote: ties[index].affected_places.every((place) => filled.has(place)),
  });
  const open = ties.findIndex((tie) => !tie.affected_places.every((place) => filled.has(place)));
  return toInfo(open >= 0 ? open : ties.length - 1);
}
