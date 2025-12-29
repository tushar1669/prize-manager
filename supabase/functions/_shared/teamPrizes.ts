export type TeamPrizePlayer = {
  id: string;
  name: string;
  rank: number;
  points: number;
  gender: string | null;
};

export type TeamPrizeInstitutionScore = {
  total_points: number;
  rank_sum: number;
  best_individual_rank: number;
  key: string;
};

/**
 * Check if a player is female (gender = 'F')
 */
export function isFemale(gender: string | null): boolean {
  return gender?.toUpperCase() === 'F';
}

/**
 * Check if a player is "not F" (male, unknown, null - consistent with main allocator's Boys (not F))
 */
export function isNotF(gender: string | null): boolean {
  return !isFemale(gender);
}

/**
 * Get player's score based on rank (higher rank = lower score)
 * Score = (maxRank + 1) - rank
 * This ensures rank 1 gets the highest score
 */
export function getRankPoints(rank: number, maxRank: number): number {
  return maxRank + 1 - rank;
}

/**
 * Compare players for sorting: by points DESC, then rank ASC (tie-break)
 */
export function comparePlayersByScore(
  a: { rank: number; points: number },
  b: { rank: number; points: number }
): number {
  // Higher points first
  if (b.points !== a.points) {
    return b.points - a.points;
  }
  // Lower rank wins tie-break
  return a.rank - b.rank;
}

/**
 * Compare institutions for ranking
 */
export function compareInstitutions(
  a: TeamPrizeInstitutionScore,
  b: TeamPrizeInstitutionScore
): number {
  // Higher total_points first
  if (b.total_points !== a.total_points) {
    return b.total_points - a.total_points;
  }
  // Lower rank_sum wins tie-break
  if (a.rank_sum !== b.rank_sum) {
    return a.rank_sum - b.rank_sum;
  }
  // Lower best_individual_rank wins
  if (a.best_individual_rank !== b.best_individual_rank) {
    return a.best_individual_rank - b.best_individual_rank;
  }
  // Alphabetical by institution name
  return a.key.localeCompare(b.key);
}

/**
 * Build a team for an institution with gender slot requirements
 * Returns null if the institution cannot form a valid team
 */
export function buildTeam(
  players: TeamPrizePlayer[],
  teamSize: number,
  femaleSlots: number,
  maleSlots: number
): { team: TeamPrizePlayer[] } | null {
  // Separate by gender
  const females = players.filter(p => isFemale(p.gender));
  const notFs = players.filter(p => isNotF(p.gender));

  // Sort each pool by points (desc), then rank (asc)
  females.sort(comparePlayersByScore);
  notFs.sort(comparePlayersByScore);

  const team: TeamPrizePlayer[] = [];
  const usedIds = new Set<string>();

  // Step 1: Fill required female slots
  if (femaleSlots > 0) {
    if (females.length < femaleSlots) {
      return null; // Not enough female players
    }
    for (let i = 0; i < femaleSlots; i++) {
      const p = females[i];
      team.push(p);
      usedIds.add(p.id);
    }
  }

  // Step 2: Fill required male slots
  if (maleSlots > 0) {
    if (notFs.length < maleSlots) {
      return null; // Not enough male/notF players
    }
    for (let i = 0; i < maleSlots; i++) {
      const p = notFs[i];
      team.push(p);
      usedIds.add(p.id);
    }
  }

  // Step 3: Fill remaining slots with best available (any gender)
  const remainingSlots = teamSize - team.length;
  if (remainingSlots > 0) {
    // Combine remaining players from both pools
    const remaining = [
      ...females.filter(p => !usedIds.has(p.id)),
      ...notFs.filter(p => !usedIds.has(p.id)),
    ];
    remaining.sort(comparePlayersByScore);

    if (remaining.length < remainingSlots) {
      return null; // Not enough players total
    }

    for (let i = 0; i < remainingSlots; i++) {
      const p = remaining[i];
      team.push(p);
      usedIds.add(p.id);
    }
  }

  return { team };
}
