/**
 * Pre-write contract for the versioned Team Prizes preview returned to finalize.
 *
 * A v2 ranking issue means an award may cross a tied or unverified prize
 * boundary. Never insert individual allocations before this check succeeds.
 */
export type FinalizeTeamPlayer = {
  player_id: string;
  name: string;
  rank: number;
  points: number;
  gender: string | null;
};

export type FinalizeTeamWinner = {
  key: string;
  total_points: number;
  players: FinalizeTeamPlayer[];
};

export type FinalizeTeamPrize = {
  id: string;
  place: number;
  winner_institution: FinalizeTeamWinner | null;
};

export type FinalizeTeamGroup = {
  group_id: string;
  prizes: FinalizeTeamPrize[];
  ranking_issues: string[];
};

export type TeamFinalizePreflight =
  | { ok: true; groups: FinalizeTeamGroup[] }
  | { ok: false; reason: 'invalid_preview' | 'unresolved_ranking' };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const validWinner = (raw: unknown): raw is FinalizeTeamWinner =>
  record(raw) &&
  typeof raw.key === 'string' && raw.key.trim().length > 0 &&
  typeof raw.total_points === 'number' && Number.isFinite(raw.total_points) &&
  Array.isArray(raw.players) && raw.players.length > 0 &&
  raw.players.every(player =>
    record(player) &&
    typeof player.player_id === 'string' && player.player_id.length > 0 &&
    typeof player.name === 'string' &&
    typeof player.rank === 'number' && Number.isFinite(player.rank) &&
    typeof player.points === 'number' && Number.isFinite(player.points) &&
    (player.gender === null || typeof player.gender === 'string'),
  );

/** Fails closed on old/malformed allocator responses or any unadjudicated prize hold. */
export function verifyTeamFinalizePreview(raw: unknown, expectedGroupCount: number): TeamFinalizePreflight {
  if (!Number.isSafeInteger(expectedGroupCount) || expectedGroupCount < 1 ||
      !record(raw) || !Array.isArray(raw.groups) || raw.groups.length !== expectedGroupCount) {
    return { ok: false, reason: 'invalid_preview' };
  }

  const seen = new Set<string>();
  for (const group of raw.groups) {
    if (!record(group) || typeof group.group_id !== 'string' || !group.group_id ||
        seen.has(group.group_id) || !Array.isArray(group.prizes) ||
        !Array.isArray(group.ranking_issues) ||
        !group.ranking_issues.every((issue: unknown) => typeof issue === 'string')) {
      return { ok: false, reason: 'invalid_preview' };
    }
    seen.add(group.group_id);
    if (group.ranking_issues.length > 0) {
      return { ok: false, reason: 'unresolved_ranking' };
    }
    for (const prize of group.prizes) {
      if (!record(prize) || typeof prize.id !== 'string' || !prize.id ||
          !Number.isSafeInteger(prize.place) || (prize.place as number) < 1 ||
          !('winner_institution' in prize) ||
          (prize.winner_institution !== null && !validWinner(prize.winner_institution))) {
        return { ok: false, reason: 'invalid_preview' };
      }
    }
  }

  return { ok: true, groups: raw.groups as FinalizeTeamGroup[] };
}
