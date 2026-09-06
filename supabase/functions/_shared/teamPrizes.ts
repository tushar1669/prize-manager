export type TeamGroupByKey = 'team' | 'club' | 'city' | 'state' | 'group_label' | 'type_label';

export type TeamPrizePlayer = {
  id: string;
  name: string;
  rank: number;
  points: number;
  gender: string | null;
  club?: string | null;
  team?: string | null;
  city?: string | null;
  state?: string | null;
  group_label?: string | null;
  type_label?: string | null;
};

export type TeamPrizeInstitutionScore = {
  key: string;
  total_points: number;
  rank_sum: number;
  best_individual_rank: number;
  team: TeamPrizePlayer[];
  /**
   * Present ONLY when non-empty. A group with no gender slots configured therefore
   * produces an object with no `warnings` key at all, byte-identical to pre-TC1.4.
   */
  warnings?: TeamWarning[];
};

export function compareInstitutions(a: TeamPrizeInstitutionScore, b: TeamPrizeInstitutionScore): number {
  if (b.total_points !== a.total_points) return b.total_points - a.total_points;
  if (a.rank_sum !== b.rank_sum) return a.rank_sum - b.rank_sum;
  if (a.best_individual_rank !== b.best_individual_rank) return a.best_individual_rank - b.best_individual_rank;
  return a.key.localeCompare(b.key);
}

/**
 * Why an institution was excluded from `scored`. ARCHITECTURE §4 (fail codes).
 * `team_short_roster` shipped with TC1.3; the two slot codes ship with TC1.4.
 * `below_minimum_roster` arrives with TC1.6 (RULING 3, signed off 7 September 2026).
 */
export type TeamExclusionReason =
  | 'team_short_roster'
  | 'female_slots_unfilled'
  | 'male_slots_unfilled';

export type TeamExclusion = {
  key: string;
  reason: TeamExclusionReason;
  /** How many players the institution actually entered, whatever the reason. */
  playerCount: number;
};

/**
 * Gender minimums for one prize group, from `institution_prize_groups.female_slots`
 * and `.male_slots`. These are MINIMUMS, not exact quotas: any board left over after
 * both minimums are met is filled from whoever is left, of any gender.
 */
export type TeamSlotRequirements = {
  femaleSlots: number;
  maleSlots: number;
};

/**
 * Attached to a SCORED institution — it qualified, but the organizer should know
 * something about how. ARCHITECTURE §4 (warn codes).
 */
export type TeamWarning = {
  reason: 'unknown_gender_filled_other_slot';
  /** How many players with a null/blank gender were counted toward a male slot. */
  playerCount: number;
};

/**
 * RULING 1 (PRD §3), implemented in parallel to `allocatePrizes`' M_OR_UNKNOWN rule
 * and NOT imported from it — DD1 forbids reaching into the allocation engine.
 *
 * A female slot is satisfied ONLY by an explicit `'F'`; a male slot is satisfied by
 * "not F", which includes null and blank, because a blank Sex column in a
 * Swiss-Manager export is the default for a male entrant, not missing data.
 */
function isFemale(player: TeamPrizePlayer): boolean {
  return (player.gender ?? '').trim().toLowerCase() === 'f';
}

/** A gender that was never recorded. Such a player still satisfies a male slot. */
function isUnknownGender(player: TeamPrizePlayer): boolean {
  return (player.gender ?? '').trim() === '';
}

export type TeamScoresWithReasons = {
  scored: TeamPrizeInstitutionScore[];
  excluded: TeamExclusion[];
  /**
   * Count of players discarded before grouping because their `groupBy` column was
   * null, empty or whitespace-only — ARCHITECTURE §4 fail code `missing_group_field`.
   * This is a PLAYER-level condition: such players have no key, so they cannot
   * appear in `excluded`, and no placeholder key is invented for them.
   */
  droppedPlayersWithoutKey: number;
};

/**
 * The real implementation.
 *
 * `slots` is optional and additive. Omitted — or with both minimums at zero, which
 * is where all three live prize groups sit — selection and output are byte-identical
 * to the rank-only behaviour pinned by tests/institution/team-prizes.spec.ts.
 * See ARCHITECTURE §1.3, §1.4 and §5 (TC1.4).
 */
export function computeTeamScoresWithReasons(
  players: TeamPrizePlayer[],
  teamSize: number,
  groupBy: TeamGroupByKey,
  slots?: TeamSlotRequirements
): TeamScoresWithReasons {
  const grouped = new Map<string, TeamPrizePlayer[]>();
  let droppedPlayersWithoutKey = 0;

  for (const player of players) {
    const rawKey = (player[groupBy] as string | null | undefined) ?? null;
    const key = rawKey?.trim();
    if (!key) {
      droppedPlayersWithoutKey += 1;
      continue;
    }

    const list = grouped.get(key) ?? [];
    list.push(player);
    grouped.set(key, list);
  }

  const scored: TeamPrizeInstitutionScore[] = [];
  const excluded: TeamExclusion[] = [];

  // Over-subscribed slots (femaleSlots + maleSlots > teamSize) cannot all be honoured;
  // a DB check blocks the configuration upstream. Rather than crash or invent an
  // exclusion nobody can satisfy, the minimums are clamped to the boards available —
  // female first, then whatever is left for male — and the slot checks below run
  // against the clamped numbers. An impossible configuration therefore degrades to the
  // strictest requirement that fits, it never silently excludes every institution.
  const femaleSlots = Math.max(0, Math.min(slots?.femaleSlots ?? 0, teamSize));
  const maleSlots = Math.max(0, Math.min(slots?.maleSlots ?? 0, teamSize - femaleSlots));

  const byRankThenId = (a: TeamPrizePlayer, b: TeamPrizePlayer) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.id.localeCompare(b.id);
  };

  for (const [key, groupPlayers] of grouped.entries()) {
    const ordered = [...groupPlayers].sort(byRankThenId);

    // Fail codes are evaluated in ARCHITECTURE §4 order: roster size first, then the
    // slot minimums (female, then male). The first one that fires is the reason given.
    if (ordered.length < teamSize) {
      excluded.push({ key, reason: 'team_short_roster', playerCount: groupPlayers.length });
      continue;
    }

    // The two constrained pools are disjoint (a player is F or not-F, never both), so
    // taking the best-ranked players from each independently is optimal for the slots.
    const femalePool = ordered.filter(isFemale);
    const notFemalePool = ordered.filter((p) => !isFemale(p));

    if (femalePool.length < femaleSlots) {
      excluded.push({ key, reason: 'female_slots_unfilled', playerCount: groupPlayers.length });
      continue;
    }
    if (notFemalePool.length < maleSlots) {
      excluded.push({ key, reason: 'male_slots_unfilled', playerCount: groupPlayers.length });
      continue;
    }

    const maleSlotFill = notFemalePool.slice(0, maleSlots);
    const selected = [...femalePool.slice(0, femaleSlots), ...maleSlotFill];

    // Remaining boards go to the best-ranked players still unselected, any gender.
    const takenIds = new Set(selected.map((p) => p.id));
    for (const candidate of ordered) {
      if (selected.length >= teamSize) break;
      if (takenIds.has(candidate.id)) continue;
      takenIds.add(candidate.id);
      selected.push(candidate);
    }

    // Re-sorted so `team` and `best_individual_rank` keep their shipped meaning:
    // with no slots configured this is exactly `ordered.slice(0, teamSize)`.
    const topPlayers = selected.sort(byRankThenId);

    // RULING 1's visible consequence: a blank gender counted toward a male slot.
    // Only the male-slot fill can raise it — the free boards require nothing.
    const unknownGenderInMaleSlots = maleSlotFill.filter(isUnknownGender).length;
    const warnings: TeamWarning[] =
      unknownGenderInMaleSlots > 0
        ? [{ reason: 'unknown_gender_filled_other_slot', playerCount: unknownGenderInMaleSlots }]
        : [];

    scored.push({
      key,
      total_points: topPlayers.reduce((sum, p) => sum + (Number.isFinite(p.points) ? p.points : 0), 0),
      rank_sum: topPlayers.reduce((sum, p) => sum + p.rank, 0),
      best_individual_rank: topPlayers[0]?.rank ?? 0,
      team: topPlayers,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  }

  return {
    scored: scored.sort(compareInstitutions),
    // Sorted by key so the diagnostics are stable under input reordering.
    excluded: excluded.sort((a, b) => a.key.localeCompare(b.key)),
    droppedPlayersWithoutKey,
  };
}

/** Thin wrapper: the scored institutions only. Signature and return type unchanged. */
export function computeTeamScores(
  players: TeamPrizePlayer[],
  teamSize: number,
  groupBy: TeamGroupByKey
): TeamPrizeInstitutionScore[] {
  return computeTeamScoresWithReasons(players, teamSize, groupBy).scored;
}

export function detectTieAtPrizeBoundary(
  scoredInstitutions: TeamPrizeInstitutionScore[],
  winnerCount: number
): string[] {
  if (winnerCount <= 0 || scoredInstitutions.length <= winnerCount) return [];
  const boundary = scoredInstitutions[winnerCount - 1];
  if (!boundary) return [];

  return scoredInstitutions
    .filter((row) => row.total_points === boundary.total_points)
    .map((row) => row.key)
    .sort((a, b) => a.localeCompare(b));
}
