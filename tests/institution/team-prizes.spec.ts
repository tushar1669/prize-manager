/**
 * tests/institution/team-prizes.spec.ts
 *
 * Pins TODAY'S SHIPPED BEHAVIOUR of supabase/functions/_shared/teamPrizes.ts.
 *
 * This suite imports the real module. It deliberately does NOT reproduce the
 * header comment at allocateInstitutionPrizes:27-30 (the "maxRank + 1 - rank"
 * rank-point transform), because no such code exists. What is asserted here is
 * what the shipped functions do:
 *
 *   - team members are selected by `rank` ASCENDING, tie-broken by `id`
 *     (teamPrizes.ts:88-91) — NOT by points descending
 *   - total_points is the raw sum of the selected players' `points` column
 *     (teamPrizes.ts:101) — no transform
 *   - rank_sum sums the selected players' ranks; best_individual_rank is the
 *     first selected player's rank
 *   - compareInstitutions orders: total_points DESC, rank_sum ASC,
 *     best_individual_rank ASC, key localeCompare (teamPrizes.ts:25-30)
 *   - an institution with fewer than teamSize players is dropped from `scored`
 *     (teamPrizes.ts:94)
 *   - a player whose groupBy value is null/empty/whitespace is dropped before
 *     grouping (teamPrizes.ts:72-77)
 *   - gender is never read; it is not even a parameter
 *
 * TC1.3 adds computeTeamScoresWithReasons, which makes those two drops visible
 * (`excluded` / `droppedPlayersWithoutKey`) WITHOUT changing what is selected;
 * computeTeamScores is now a thin wrapper returning its `.scored`.
 *
 * Fixture rule (DD4): no two compared values are equal unless the equality is
 * the thing under test.
 */

import { describe, it, expect } from 'vitest';
import {
  compareInstitutions,
  computeTeamScores,
  computeTeamScoresWithReasons,
  detectTieAtPrizeBoundary,
  type TeamPrizeInstitutionScore,
  type TeamPrizePlayer,
} from '../../supabase/functions/_shared/teamPrizes';

type PlayerOverrides = Partial<TeamPrizePlayer> & { id: string; rank: number; points: number };

function player(overrides: PlayerOverrides): TeamPrizePlayer {
  return {
    name: `Player ${overrides.id}`,
    gender: null,
    ...overrides,
  };
}

function institution(overrides: Partial<TeamPrizeInstitutionScore> & { key: string }): TeamPrizeInstitutionScore {
  return {
    total_points: 0,
    rank_sum: 0,
    best_individual_rank: 0,
    team: [],
    ...overrides,
  };
}

const teamIds = (row: TeamPrizeInstitutionScore) => row.team.map((p) => p.id);

describe('computeTeamScores — selection and scoring', () => {
  it('takes the top teamSize players and sums their raw points column', () => {
    // One institution, four players. The excluded player carries 100 points, so
    // any implementation that scored the whole roster would be off by 100.
    const players = [
      player({ id: 'p1', rank: 2, points: 5, club: 'Chess Club' }),
      player({ id: 'p2', rank: 4, points: 3, club: 'Chess Club' }),
      player({ id: 'p3', rank: 7, points: 2, club: 'Chess Club' }),
      player({ id: 'p4', rank: 11, points: 100, club: 'Chess Club' }),
    ];

    const scored = computeTeamScores(players, 3, 'club');

    expect(scored).toHaveLength(1);
    expect(scored[0].key).toBe('Chess Club');
    expect(teamIds(scored[0])).toEqual(['p1', 'p2', 'p3']);
    expect(scored[0].total_points).toBe(10); // 5 + 3 + 2, raw column values
    expect(scored[0].rank_sum).toBe(13); // 2 + 4 + 7
    expect(scored[0].best_individual_rank).toBe(2);
  });

  it('selects by rank ascending, not by points descending', () => {
    // Rank order (p1, p2, p3) and points order (p3, p2, p1) disagree.
    // Shipped code picks p1 + p2 => 3 + 4 = 7 points, rank_sum 3, best rank 1.
    // A points-descending implementation would pick p3 + p2 => 13, rank_sum 5.
    const players = [
      player({ id: 'p1', rank: 1, points: 3, club: 'Alpha' }),
      player({ id: 'p2', rank: 2, points: 4, club: 'Alpha' }),
      player({ id: 'p3', rank: 3, points: 9, club: 'Alpha' }),
    ];

    const scored = computeTeamScores(players, 2, 'club');

    expect(teamIds(scored[0])).toEqual(['p1', 'p2']);
    expect(scored[0].total_points).toBe(7);
    expect(scored[0].rank_sum).toBe(3);
    expect(scored[0].best_individual_rank).toBe(1);
  });

  it('breaks an equal rank by id, regardless of input order or points', () => {
    // Both players sit on rank 4. Input order puts 'b' first and 'b' carries the
    // higher points, so only the id tie-break can produce 'a'.
    const players = [
      player({ id: 'b', rank: 4, points: 50, club: 'Alpha' }),
      player({ id: 'a', rank: 4, points: 20, club: 'Alpha' }),
    ];

    const scored = computeTeamScores(players, 1, 'club');

    expect(teamIds(scored[0])).toEqual(['a']);
    expect(scored[0].total_points).toBe(20);
    expect(scored[0].best_individual_rank).toBe(4);
  });

  it('drops an institution with fewer players than teamSize', () => {
    const players = [
      player({ id: 's1', rank: 1, points: 9, club: 'Short Roster' }),
      player({ id: 's2', rank: 2, points: 8, club: 'Short Roster' }),
      player({ id: 'f1', rank: 3, points: 7, club: 'Full Roster' }),
      player({ id: 'f2', rank: 5, points: 6, club: 'Full Roster' }),
      player({ id: 'f3', rank: 6, points: 4, club: 'Full Roster' }),
    ];

    const scored = computeTeamScores(players, 3, 'club');

    expect(scored.map((row) => row.key)).toEqual(['Full Roster']);
    expect(scored[0].total_points).toBe(17);
  });

  it('drops players whose group key is null, empty or whitespace-only, and trims the rest', () => {
    const players = [
      player({ id: 'n1', rank: 1, points: 40, club: null }),
      player({ id: 'n2', rank: 2, points: 30, club: '' }),
      player({ id: 'n3', rank: 3, points: 20, club: '   ' }),
      player({ id: 'n4', rank: 4, points: 10, club: '\t\n ' }),
      player({ id: 'r1', rank: 5, points: 6, club: '  Padded School  ' }),
    ];

    const scored = computeTeamScores(players, 1, 'club');

    expect(scored).toHaveLength(1);
    expect(scored[0].key).toBe('Padded School'); // trimmed
    expect(teamIds(scored[0])).toEqual(['r1']);
    expect(scored[0].total_points).toBe(6);
  });

  it('groups on the requested column, ignoring the other columns', () => {
    // Same players, grouped by state. club values are deliberately different
    // from state values so a wrong groupBy would produce different keys.
    const players = [
      player({ id: 'x1', rank: 1, points: 7, club: 'Club One', state: 'Rajasthan' }),
      player({ id: 'x2', rank: 3, points: 5, club: 'Club Two', state: 'Rajasthan' }),
      player({ id: 'y1', rank: 2, points: 6, club: 'Club Three', state: 'Kerala' }),
      player({ id: 'y2', rank: 4, points: 2, club: 'Club Four', state: 'Kerala' }),
    ];

    const scored = computeTeamScores(players, 2, 'state');

    expect(scored.map((row) => row.key)).toEqual(['Rajasthan', 'Kerala']);
    expect(scored[0].total_points).toBe(12);
    expect(scored[1].total_points).toBe(8);
  });

  it('counts a non-finite points value as zero', () => {
    const players = [
      player({ id: 'p1', rank: 1, points: Number.NaN, club: 'Alpha' }),
      player({ id: 'p2', rank: 2, points: 13, club: 'Alpha' }),
    ];

    const scored = computeTeamScores(players, 2, 'club');

    expect(scored[0].total_points).toBe(13);
    expect(scored[0].rank_sum).toBe(3);
  });

  it('returns institutions already sorted by compareInstitutions', () => {
    const players = [
      player({ id: 'a1', rank: 3, points: 4, club: 'Alpha' }),
      player({ id: 'a2', rank: 6, points: 3, club: 'Alpha' }),
      player({ id: 'b1', rank: 1, points: 9, club: 'Beta' }),
      player({ id: 'b2', rank: 2, points: 8, club: 'Beta' }),
      player({ id: 'c1', rank: 4, points: 6, club: 'Gamma' }),
      player({ id: 'c2', rank: 5, points: 5, club: 'Gamma' }),
    ];

    const scored = computeTeamScores(players, 2, 'club');

    expect(scored.map((row) => row.key)).toEqual(['Beta', 'Gamma', 'Alpha']);
    expect(scored.map((row) => row.total_points)).toEqual([17, 11, 7]);
  });
});

describe('compareInstitutions — one test per cascade level', () => {
  // In each of the first three tests the higher-priority fields are equal (so the
  // cascade must reach the level under test) and every LOWER-priority field is set
  // to favour the other row. A comparator that skipped the level under test would
  // therefore return the opposite order, not merely a coincidentally right one.

  it('level 1: total_points descending wins over every lower tier', () => {
    const higher = institution({ key: 'Zulu', total_points: 20, rank_sum: 30, best_individual_rank: 9 });
    const lower = institution({ key: 'Alpha', total_points: 15, rank_sum: 12, best_individual_rank: 3 });

    expect(compareInstitutions(higher, lower)).toBeLessThan(0);
    expect(compareInstitutions(lower, higher)).toBeGreaterThan(0);
    expect([lower, higher].sort(compareInstitutions).map((row) => row.key)).toEqual(['Zulu', 'Alpha']);
  });

  it('level 2: on equal total_points, rank_sum ascending wins over every lower tier', () => {
    const better = institution({ key: 'Zulu', total_points: 12, rank_sum: 8, best_individual_rank: 6 });
    const worse = institution({ key: 'Alpha', total_points: 12, rank_sum: 19, best_individual_rank: 2 });

    expect(compareInstitutions(better, worse)).toBeLessThan(0);
    expect(compareInstitutions(worse, better)).toBeGreaterThan(0);
    expect([worse, better].sort(compareInstitutions).map((row) => row.key)).toEqual(['Zulu', 'Alpha']);
  });

  it('level 3: on equal total_points and rank_sum, best_individual_rank ascending wins over the key tier', () => {
    const better = institution({ key: 'Zulu', total_points: 12, rank_sum: 14, best_individual_rank: 3 });
    const worse = institution({ key: 'Alpha', total_points: 12, rank_sum: 14, best_individual_rank: 7 });

    expect(compareInstitutions(better, worse)).toBeLessThan(0);
    expect(compareInstitutions(worse, better)).toBeGreaterThan(0);
    expect([worse, better].sort(compareInstitutions).map((row) => row.key)).toEqual(['Zulu', 'Alpha']);
  });

  it('level 4: with all three numeric tiers equal, the key decides by localeCompare', () => {
    // The numeric equality here is the condition under test, not an accident.
    const first = institution({ key: 'Alpha', total_points: 12, rank_sum: 14, best_individual_rank: 3 });
    const second = institution({ key: 'Zulu', total_points: 12, rank_sum: 14, best_individual_rank: 3 });

    expect(compareInstitutions(first, second)).toBeLessThan(0);
    expect(compareInstitutions(second, first)).toBeGreaterThan(0);
    expect([second, first].sort(compareInstitutions).map((row) => row.key)).toEqual(['Alpha', 'Zulu']);
  });
});

describe('detectTieAtPrizeBoundary', () => {
  it('returns empty when there are fewer institutions than winners', () => {
    const rows = [
      institution({ key: 'Alpha', total_points: 30 }),
      institution({ key: 'Beta', total_points: 20 }),
    ];

    expect(detectTieAtPrizeBoundary(rows, 3)).toEqual([]);
  });

  it('returns empty when the institution count exactly equals the winner count', () => {
    const rows = [
      institution({ key: 'Alpha', total_points: 30 }),
      institution({ key: 'Beta', total_points: 30 }),
    ];

    expect(detectTieAtPrizeBoundary(rows, 2)).toEqual([]);
  });

  it('returns empty for a non-positive winner count', () => {
    const rows = [
      institution({ key: 'Alpha', total_points: 30 }),
      institution({ key: 'Beta', total_points: 20 }),
      institution({ key: 'Gamma', total_points: 10 }),
    ];

    expect(detectTieAtPrizeBoundary(rows, 0)).toEqual([]);
    expect(detectTieAtPrizeBoundary(rows, -1)).toEqual([]);
  });

  it('returns the keys tied on total_points at the boundary, sorted', () => {
    // Boundary at winnerCount 2 is 'Beta' (20). 'Gamma' also has 20; 'Alpha' (30)
    // and 'Delta' (7) have distinct totals and must not appear.
    const rows = [
      institution({ key: 'Alpha', total_points: 30 }),
      institution({ key: 'Beta', total_points: 20 }),
      institution({ key: 'Gamma', total_points: 20 }),
      institution({ key: 'Delta', total_points: 7 }),
    ];

    expect(detectTieAtPrizeBoundary(rows, 2)).toEqual(['Beta', 'Gamma']);
  });

  it('sorts the returned keys rather than echoing list order', () => {
    const rows = [
      institution({ key: 'Zulu', total_points: 40 }),
      institution({ key: 'Mike', total_points: 25 }),
      institution({ key: 'Alpha', total_points: 25 }),
      institution({ key: 'Delta', total_points: 4 }),
    ];

    expect(detectTieAtPrizeBoundary(rows, 2)).toEqual(['Alpha', 'Mike']);
  });

  it('includes institutions ABOVE the boundary that share the boundary total (shipped behaviour)', () => {
    // teamPrizes.ts:133-136 filters the whole list on the boundary's total_points,
    // so a winner already inside the cut is reported too.
    const rows = [
      institution({ key: 'Alpha', total_points: 20 }),
      institution({ key: 'Beta', total_points: 20 }),
      institution({ key: 'Gamma', total_points: 20 }),
      institution({ key: 'Delta', total_points: 5 }),
    ];

    expect(detectTieAtPrizeBoundary(rows, 2)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('ties are decided on total_points alone, ignoring rank_sum and best_individual_rank', () => {
    const rows = [
      institution({ key: 'Alpha', total_points: 30, rank_sum: 3, best_individual_rank: 1 }),
      institution({ key: 'Beta', total_points: 18, rank_sum: 11, best_individual_rank: 4 }),
      institution({ key: 'Gamma', total_points: 18, rank_sum: 26, best_individual_rank: 9 }),
      institution({ key: 'Delta', total_points: 2, rank_sum: 41, best_individual_rank: 15 }),
    ];

    expect(detectTieAtPrizeBoundary(rows, 2)).toEqual(['Beta', 'Gamma']);
  });
});

describe('gender is not part of the shipped team algorithm', () => {
  const roster = [
    { id: 'p1', rank: 1, points: 3 },
    { id: 'p2', rank: 2, points: 9 },
    { id: 'p3', rank: 4, points: 5 },
    { id: 'p4', rank: 6, points: 11 },
  ];

  const shape = (rows: TeamPrizeInstitutionScore[]) =>
    rows.map((row) => ({
      key: row.key,
      total_points: row.total_points,
      rank_sum: row.rank_sum,
      best_individual_rank: row.best_individual_rank,
      team: teamIds(row),
    }));

  it('produces identical output no matter how genders are assigned', () => {
    const allFemale = roster.map((p) => player({ ...p, gender: 'F', club: 'Alpha' }));
    const allMale = roster.map((p) => player({ ...p, gender: 'M', club: 'Alpha' }));
    const mixed = roster.map((p, i) => player({ ...p, gender: ['F', 'M', null, 'f'][i], club: 'Alpha' }));

    const expected = shape(computeTeamScores(allFemale, 3, 'club'));

    // Sanity: the fixture actually produces a team, so "identical" is not "identically empty".
    expect(expected).toEqual([
      { key: 'Alpha', total_points: 17, rank_sum: 7, best_individual_rank: 1, team: ['p1', 'p2', 'p3'] },
    ]);
    expect(shape(computeTeamScores(allMale, 3, 'club'))).toEqual(expected);
    expect(shape(computeTeamScores(mixed, 3, 'club'))).toEqual(expected);
  });

  it('takes no slot arguments at all — female_slots/male_slots cannot reach it', () => {
    expect(computeTeamScores).toHaveLength(3); // players, teamSize, groupBy
  });
});

describe('computeTeamScoresWithReasons — visible exclusions (TC1.3)', () => {
  // Reporting only: selection is unchanged. Every institution dropped by the
  // pre-TC1.3 scorer is still dropped here — it now carries a reason.
  // ARCHITECTURE §4: fail codes `team_short_roster` and `missing_group_field`.

  // Two institutions, deliberately unequal in every compared field: 'Short Roster'
  // enters 2 players (below a teamSize of 3), 'Full Roster' enters 4.
  const mixedRoster = () => [
    player({ id: 's1', rank: 2, points: 9, club: 'Short Roster' }),
    player({ id: 's2', rank: 5, points: 8, club: 'Short Roster' }),
    player({ id: 'f1', rank: 1, points: 7, club: 'Full Roster' }),
    player({ id: 'f2', rank: 3, points: 6, club: 'Full Roster' }),
    player({ id: 'f3', rank: 4, points: 4, club: 'Full Roster' }),
    player({ id: 'f4', rank: 8, points: 50, club: 'Full Roster' }),
  ];

  it('reports a short-roster institution with its real playerCount and reason', () => {
    const { excluded } = computeTeamScoresWithReasons(mixedRoster(), 3, 'club');

    expect(excluded).toEqual([{ key: 'Short Roster', reason: 'team_short_roster', playerCount: 2 }]);
    // playerCount is the roster it entered (2), which differs from both the
    // teamSize it needed (3) and the other institution's roster (4).
    expect(excluded[0].playerCount).not.toBe(3);
  });

  it('does not report an institution that qualifies', () => {
    const { scored, excluded } = computeTeamScoresWithReasons(mixedRoster(), 3, 'club');

    expect(scored.map((row) => row.key)).toEqual(['Full Roster']);
    expect(excluded.map((row) => row.key)).not.toContain('Full Roster');
    // The qualifying institution has a 4th player at rank 8 with 50 points that is
    // not selected, so "qualifies" is not "has exactly teamSize players".
    expect(teamIds(scored[0])).toEqual(['f1', 'f2', 'f3']);
    expect(scored[0].total_points).toBe(17);
  });

  it('reports every short-roster institution, sorted by key', () => {
    // Input order is Zulu, Alpha, Mike; output order must be alphabetical.
    // Each carries a different playerCount so no two compared values are equal.
    const players = [
      player({ id: 'z1', rank: 1, points: 30, club: 'Zulu' }),
      player({ id: 'z2', rank: 2, points: 25, club: 'Zulu' }),
      player({ id: 'z3', rank: 3, points: 20, club: 'Zulu' }),
      player({ id: 'a1', rank: 4, points: 15, club: 'Alpha' }),
      player({ id: 'm1', rank: 6, points: 10, club: 'Mike' }),
      player({ id: 'm2', rank: 7, points: 5, club: 'Mike' }),
    ];

    const { scored, excluded } = computeTeamScoresWithReasons(players, 4, 'club');

    expect(scored).toEqual([]);
    expect(excluded).toEqual([
      { key: 'Alpha', reason: 'team_short_roster', playerCount: 1 },
      { key: 'Mike', reason: 'team_short_roster', playerCount: 2 },
      { key: 'Zulu', reason: 'team_short_roster', playerCount: 3 },
    ]);
  });

  it('counts players dropped for a null, empty or whitespace-only group key', () => {
    // Four keyless players against one keyed player, so the count (4) differs
    // from both the total roster (5) and the surviving institution's size (1).
    const players = [
      player({ id: 'n1', rank: 1, points: 40, club: null }),
      player({ id: 'n2', rank: 2, points: 30, club: '' }),
      player({ id: 'n3', rank: 3, points: 20, club: '   ' }),
      player({ id: 'n4', rank: 4, points: 10, club: '\t\n ' }),
      player({ id: 'r1', rank: 5, points: 6, club: 'Padded School' }),
    ];

    const { scored, excluded, droppedPlayersWithoutKey } = computeTeamScoresWithReasons(players, 1, 'club');

    expect(droppedPlayersWithoutKey).toBe(4);
    expect(scored.map((row) => row.key)).toEqual(['Padded School']);
    // Keyless players have no key by definition, so no placeholder appears.
    expect(excluded).toEqual([]);
  });

  it('counts zero dropped players when every player has a group key', () => {
    const players = [
      player({ id: 'p1', rank: 1, points: 12, club: 'Alpha' }),
      player({ id: 'p2', rank: 3, points: 7, club: 'Beta' }),
    ];

    const { droppedPlayersWithoutKey } = computeTeamScoresWithReasons(players, 1, 'club');

    expect(droppedPlayersWithoutKey).toBe(0);
  });

  it('counts a missing key on the requested column only, not on the other columns', () => {
    // Every player has a blank `club`; grouping is by `state`, where two of the
    // three are populated. A scorer reading the wrong column would count 3.
    const players = [
      player({ id: 'x1', rank: 1, points: 9, club: '  ', state: 'Rajasthan' }),
      player({ id: 'x2', rank: 2, points: 8, club: '  ', state: 'Kerala' }),
      player({ id: 'x3', rank: 4, points: 6, club: '  ', state: null }),
    ];

    const { scored, droppedPlayersWithoutKey } = computeTeamScoresWithReasons(players, 1, 'state');

    expect(droppedPlayersWithoutKey).toBe(1);
    expect(scored.map((row) => row.key)).toEqual(['Rajasthan', 'Kerala']);
  });

  it('moves an institution from excluded to scored when one more player is added', () => {
    // Matched pair on one fixture. 'Rising School' enters 2 players against a
    // teamSize of 3; the added player is the only difference between the runs.
    const base = [
      player({ id: 'r1', rank: 2, points: 11, club: 'Rising School' }),
      player({ id: 'r2', rank: 5, points: 7, club: 'Rising School' }),
    ];
    const withThird = [...base, player({ id: 'r3', rank: 9, points: 3, club: 'Rising School' })];

    const before = computeTeamScoresWithReasons(base, 3, 'club');
    const after = computeTeamScoresWithReasons(withThird, 3, 'club');

    expect(before.scored).toEqual([]);
    expect(before.excluded).toEqual([
      { key: 'Rising School', reason: 'team_short_roster', playerCount: 2 },
    ]);

    expect(after.excluded).toEqual([]);
    expect(after.scored.map((row) => row.key)).toEqual(['Rising School']);
    expect(teamIds(after.scored[0])).toEqual(['r1', 'r2', 'r3']);
    expect(after.scored[0].total_points).toBe(21); // 11 + 7 + 3
    expect(after.scored[0].rank_sum).toBe(16); // 2 + 5 + 9
    expect(after.scored[0].best_individual_rank).toBe(2);
  });

  it('computeTeamScores returns exactly computeTeamScoresWithReasons(...).scored', () => {
    // A fixture that exercises all three outputs at once: two qualifying
    // institutions with different totals, one short roster, one keyless player.
    const players = [
      player({ id: 'a1', rank: 1, points: 12, club: 'Alpha' }),
      player({ id: 'a2', rank: 4, points: 9, club: 'Alpha' }),
      player({ id: 'b1', rank: 2, points: 8, club: 'Beta' }),
      player({ id: 'b2', rank: 3, points: 5, club: 'Beta' }),
      player({ id: 'g1', rank: 6, points: 30, club: 'Gamma' }),
      player({ id: 'k1', rank: 7, points: 40, club: '   ' }),
    ];

    const full = computeTeamScoresWithReasons(players, 2, 'club');
    const wrapped = computeTeamScores(players, 2, 'club');

    expect(wrapped).toEqual(full.scored);

    // Sanity: the fixture is not degenerate — the equality above is not "both empty",
    // and the wrapper is genuinely dropping the other two fields.
    expect(wrapped.map((row) => row.key)).toEqual(['Alpha', 'Beta']);
    expect(wrapped.map((row) => row.total_points)).toEqual([21, 13]);
    expect(full.excluded).toEqual([{ key: 'Gamma', reason: 'team_short_roster', playerCount: 1 }]);
    expect(full.droppedPlayersWithoutKey).toBe(1);
  });
});

describe('computeTeamScoresWithReasons — gender slots (TC1.4)', () => {
  // RULING 1 (PRD §3): a female slot is satisfied ONLY by an explicit 'F'; a male
  // slot is satisfied by "not F", which INCLUDES null and blank. Slots are MINIMUMS —
  // boards left over after both minimums are filled by best rank, any gender.

  const shape = (rows: TeamPrizeInstitutionScore[]) =>
    rows.map((row) => ({
      key: row.key,
      total_points: row.total_points,
      rank_sum: row.rank_sum,
      best_individual_rank: row.best_individual_rank,
      team: teamIds(row),
    }));

  describe('the zero-slot guard — this is what protects the three live groups', () => {
    // Every live institution_prize_group sits at female_slots = 0, male_slots = 0.
    // Genders here are deliberately mixed across all four cases ('F', 'M', null, 'f')
    // so a scorer that read gender at zero slots would produce something else.
    const genderRichRoster = () => [
      player({ id: 'a1', rank: 1, points: 12, gender: 'M', club: 'Alpha' }),
      player({ id: 'a2', rank: 4, points: 9, gender: 'F', club: 'Alpha' }),
      player({ id: 'a3', rank: 6, points: 30, gender: null, club: 'Alpha' }),
      player({ id: 'b1', rank: 2, points: 8, gender: 'f', club: 'Beta' }),
      player({ id: 'b2', rank: 3, points: 5, gender: null, club: 'Beta' }),
      player({ id: 'g1', rank: 7, points: 40, gender: 'F', club: 'Gamma' }),
      player({ id: 'k1', rank: 9, points: 50, gender: 'M', club: '   ' }),
    ];

    it('produces today’s exact result when slots is omitted', () => {
      const result = computeTeamScoresWithReasons(genderRichRoster(), 2, 'club');

      expect(shape(result.scored)).toEqual([
        { key: 'Alpha', total_points: 21, rank_sum: 5, best_individual_rank: 1, team: ['a1', 'a2'] },
        { key: 'Beta', total_points: 13, rank_sum: 5, best_individual_rank: 2, team: ['b1', 'b2'] },
      ]);
      expect(result.excluded).toEqual([{ key: 'Gamma', reason: 'team_short_roster', playerCount: 1 }]);
      expect(result.droppedPlayersWithoutKey).toBe(1);
    });

    it('is deep-equal at femaleSlots 0 / maleSlots 0 to the same call with slots omitted', () => {
      const omitted = computeTeamScoresWithReasons(genderRichRoster(), 2, 'club');
      const zeroed = computeTeamScoresWithReasons(genderRichRoster(), 2, 'club', {
        femaleSlots: 0,
        maleSlots: 0,
      });

      expect(zeroed).toEqual(omitted);
      // Sanity: the fixture is not degenerate — the equality is not "both empty".
      expect(zeroed.scored.map((row) => row.key)).toEqual(['Alpha', 'Beta']);
      expect(zeroed.scored.map((row) => row.total_points)).toEqual([21, 13]);
    });

    it('attaches no warnings key at all when no slots are configured', () => {
      // The roster contains null genders, so a scorer that warned unconditionally
      // would add the key here. Byte-identical output means the key is absent.
      const zeroed = computeTeamScoresWithReasons(genderRichRoster(), 2, 'club', {
        femaleSlots: 0,
        maleSlots: 0,
      });

      expect(zeroed.scored.some((row) => 'warnings' in row)).toBe(false);
      expect(JSON.stringify(zeroed)).not.toContain('warnings');
    });

    it('adds slots as a fourth parameter and leaves the wrapper at three', () => {
      // The fourth parameter is optional — the three-argument calls throughout this
      // suite are the proof. `computeTeamScores` is untouched, so no caller of it
      // can see the change; that is what TC1.4 means by "no caller is wired in".
      expect(computeTeamScoresWithReasons).toHaveLength(4);
      expect(computeTeamScores).toHaveLength(3);
    });
  });

  describe('slot-aware selection differs from rank-only selection', () => {
    // THE DISCRIMINATING FIXTURE. 'Slot School' enters six players; its four best by
    // rank (m1, m2, m3, m4) are all not-F. With femaleSlots 2 the engine must reach
    // down to ranks 5 and 6 for the girls and drop two better-ranked players.
    const slotSchool = () => [
      player({ id: 'm1', rank: 1, points: 10, gender: 'M', club: 'Slot School' }),
      player({ id: 'm2', rank: 2, points: 9, gender: 'M', club: 'Slot School' }),
      player({ id: 'm3', rank: 3, points: 8, gender: null, club: 'Slot School' }),
      player({ id: 'm4', rank: 4, points: 7, gender: 'M', club: 'Slot School' }),
      player({ id: 'f1', rank: 5, points: 6, gender: 'F', club: 'Slot School' }),
      player({ id: 'f2', rank: 6, points: 5, gender: 'F', club: 'Slot School' }),
    ];

    it('picks a different team than the rank-only selection, and the exact ids', () => {
      const rankOnly = computeTeamScoresWithReasons(slotSchool(), 4, 'club');
      const withSlots = computeTeamScoresWithReasons(slotSchool(), 4, 'club', {
        femaleSlots: 2,
        maleSlots: 0,
      });

      expect(teamIds(rankOnly.scored[0])).toEqual(['m1', 'm2', 'm3', 'm4']);
      expect(teamIds(withSlots.scored[0])).toEqual(['m1', 'm2', 'f1', 'f2']);

      // Every derived number moves too, so the two runs are distinguishable on
      // more than member ids alone.
      expect(rankOnly.scored[0].total_points).toBe(34); // 10 + 9 + 8 + 7
      expect(withSlots.scored[0].total_points).toBe(30); // 10 + 9 + 6 + 5
      expect(rankOnly.scored[0].rank_sum).toBe(10); // 1 + 2 + 3 + 4
      expect(withSlots.scored[0].rank_sum).toBe(14); // 1 + 2 + 5 + 6
      expect(withSlots.scored[0].best_individual_rank).toBe(1);
      expect(withSlots.excluded).toEqual([]);
    });

    it('raises no warning when maleSlots is zero, even with an unrecorded gender present', () => {
      // m3 has a null gender but is not counted toward a male slot — there are none.
      const withSlots = computeTeamScoresWithReasons(slotSchool(), 4, 'club', {
        femaleSlots: 2,
        maleSlots: 0,
      });

      expect('warnings' in withSlots.scored[0]).toBe(false);
    });

    it('fills the remaining boards by best rank regardless of gender', () => {
      // femaleSlots 1 takes f1 (rank 1); maleSlots 1 takes m1 (rank 5, the best not-F).
      // The one free board must go to f2 at rank 2, NOT to m2 at rank 6.
      const players = [
        player({ id: 'f1', rank: 1, points: 20, gender: 'F', club: 'Free Board' }),
        player({ id: 'f2', rank: 2, points: 15, gender: 'F', club: 'Free Board' }),
        player({ id: 'm1', rank: 5, points: 9, gender: 'M', club: 'Free Board' }),
        player({ id: 'm2', rank: 6, points: 8, gender: 'M', club: 'Free Board' }),
      ];

      const { scored } = computeTeamScoresWithReasons(players, 3, 'club', {
        femaleSlots: 1,
        maleSlots: 1,
      });

      expect(teamIds(scored[0])).toEqual(['f1', 'f2', 'm1']);
      expect(scored[0].total_points).toBe(44); // 20 + 15 + 9, not 20 + 9 + 8
      expect(scored[0].rank_sum).toBe(8); // 1 + 2 + 5
    });
  });

  describe('slot minimums that cannot be met exclude the institution', () => {
    it('excludes a school with too few explicit F as female_slots_unfilled', () => {
      // Four players against a teamSize of 4, so team_short_roster cannot fire first.
      // Only one carries an explicit 'F'; the null and the blank do NOT count.
      const players = [
        player({ id: 'q1', rank: 1, points: 11, gender: 'M', club: 'One Girl School' }),
        player({ id: 'q2', rank: 3, points: 9, gender: null, club: 'One Girl School' }),
        player({ id: 'q3', rank: 5, points: 7, gender: '   ', club: 'One Girl School' }),
        player({ id: 'q4', rank: 8, points: 4, gender: 'F', club: 'One Girl School' }),
      ];

      const { scored, excluded } = computeTeamScoresWithReasons(players, 4, 'club', {
        femaleSlots: 2,
        maleSlots: 0,
      });

      expect(scored).toEqual([]);
      expect(excluded).toEqual([
        { key: 'One Girl School', reason: 'female_slots_unfilled', playerCount: 4 },
      ]);
      // playerCount is the entered roster (4), which differs from the girls it has (1)
      // and from the girls the rule asked for (2).
      expect(excluded[0].playerCount).not.toBe(2);
    });

    it('excludes a school with too few not-F as male_slots_unfilled', () => {
      // Three explicit F and one 'M' against maleSlots 2 — the not-F pool is 1.
      const players = [
        player({ id: 'g1', rank: 2, points: 12, gender: 'F', club: 'Girls Academy' }),
        player({ id: 'g2', rank: 4, points: 10, gender: 'F', club: 'Girls Academy' }),
        player({ id: 'g3', rank: 6, points: 8, gender: 'F', club: 'Girls Academy' }),
        player({ id: 'g4', rank: 9, points: 3, gender: 'M', club: 'Girls Academy' }),
      ];

      const { scored, excluded } = computeTeamScoresWithReasons(players, 4, 'club', {
        femaleSlots: 1,
        maleSlots: 2,
      });

      expect(scored).toEqual([]);
      expect(excluded).toEqual([
        { key: 'Girls Academy', reason: 'male_slots_unfilled', playerCount: 4 },
      ]);
    });

    it('reports the short roster before either slot check', () => {
      // Two players, teamSize 3, and neither slot minimum is satisfiable either.
      // ARCHITECTURE §4 order says the roster size is the reason given.
      const players = [
        player({ id: 't1', rank: 1, points: 9, gender: 'M', club: 'Tiny School' }),
        player({ id: 't2', rank: 3, points: 6, gender: 'M', club: 'Tiny School' }),
      ];

      const { excluded } = computeTeamScoresWithReasons(players, 3, 'club', {
        femaleSlots: 2,
        maleSlots: 1,
      });

      expect(excluded).toEqual([{ key: 'Tiny School', reason: 'team_short_roster', playerCount: 2 }]);
    });

    it('moves an institution from excluded to scored when one gender changes null → F', () => {
      // Matched pair: the SAME fixture, one field different. 'Rising School' has one
      // explicit F against femaleSlots 2; marking its second player 'F' qualifies it.
      const base = () => [
        player({ id: 'r1', rank: 1, points: 14, gender: 'F', club: 'Rising School' }),
        player({ id: 'r2', rank: 3, points: 9, gender: null, club: 'Rising School' }),
        player({ id: 'r3', rank: 7, points: 5, gender: 'M', club: 'Rising School' }),
      ];
      const corrected = base().map((p) => (p.id === 'r2' ? { ...p, gender: 'F' } : p));

      const slots = { femaleSlots: 2, maleSlots: 0 };
      const before = computeTeamScoresWithReasons(base(), 3, 'club', slots);
      const after = computeTeamScoresWithReasons(corrected, 3, 'club', slots);

      expect(before.scored).toEqual([]);
      expect(before.excluded).toEqual([
        { key: 'Rising School', reason: 'female_slots_unfilled', playerCount: 3 },
      ]);

      expect(after.excluded).toEqual([]);
      expect(after.scored.map((row) => row.key)).toEqual(['Rising School']);
      expect(teamIds(after.scored[0])).toEqual(['r1', 'r2', 'r3']);
      expect(after.scored[0].total_points).toBe(28); // 14 + 9 + 5
      expect(after.scored[0].rank_sum).toBe(11); // 1 + 3 + 7
    });
  });

  describe('RULING 1 — what satisfies which slot', () => {
    it('counts null and blank genders toward a male slot and warns with the count', () => {
      // maleSlots 2 is filled by n1 (rank 1, null) and n2 (rank 3, blank); m1 at rank 6
      // is a better-documented but worse-ranked candidate and is not needed.
      const players = [
        player({ id: 'n1', rank: 1, points: 12, gender: null, club: 'Unmarked School' }),
        player({ id: 'w1', rank: 2, points: 10, gender: 'F', club: 'Unmarked School' }),
        player({ id: 'n2', rank: 3, points: 8, gender: '  ', club: 'Unmarked School' }),
        player({ id: 'm1', rank: 6, points: 4, gender: 'M', club: 'Unmarked School' }),
      ];

      const { scored } = computeTeamScoresWithReasons(players, 3, 'club', {
        femaleSlots: 1,
        maleSlots: 2,
      });

      expect(teamIds(scored[0])).toEqual(['n1', 'w1', 'n2']);
      expect(scored[0].warnings).toEqual([
        { reason: 'unknown_gender_filled_other_slot', playerCount: 2 },
      ]);
      // playerCount is the unmarked players counted (2) — not the roster (4), not the
      // team size (3), not the male slots asked for... which is also 2, so pin the
      // discriminating case separately below.
      expect(scored[0].warnings?.[0].playerCount).not.toBe(scored[0].team.length);
    });

    it('counts only the unmarked players, not every player filling a male slot', () => {
      // maleSlots 2 is filled by n1 (null) and m1 (explicit 'M'): the count is 1, which
      // differs from the male slots asked for (2) and from the roster (4).
      const players = [
        player({ id: 'n1', rank: 1, points: 12, gender: null, club: 'Half Marked' }),
        player({ id: 'm1', rank: 2, points: 10, gender: 'M', club: 'Half Marked' }),
        player({ id: 'w1', rank: 4, points: 7, gender: 'F', club: 'Half Marked' }),
        player({ id: 'n2', rank: 8, points: 2, gender: null, club: 'Half Marked' }),
      ];

      const { scored } = computeTeamScoresWithReasons(players, 3, 'club', {
        femaleSlots: 1,
        maleSlots: 2,
      });

      expect(teamIds(scored[0])).toEqual(['n1', 'm1', 'w1']);
      expect(scored[0].warnings).toEqual([
        { reason: 'unknown_gender_filled_other_slot', playerCount: 1 },
      ]);
    });

    it('raises no warning when every male slot is filled by an explicit M', () => {
      // Same shape as the fixture above with n1 marked 'M'. n2's null gender sits
      // outside the team, so nothing unmarked is counted.
      const players = [
        player({ id: 'm1', rank: 1, points: 12, gender: 'M', club: 'Marked School' }),
        player({ id: 'm2', rank: 2, points: 10, gender: 'M', club: 'Marked School' }),
        player({ id: 'w1', rank: 4, points: 7, gender: 'F', club: 'Marked School' }),
        player({ id: 'n2', rank: 8, points: 2, gender: null, club: 'Marked School' }),
      ];

      const { scored } = computeTeamScoresWithReasons(players, 3, 'club', {
        femaleSlots: 1,
        maleSlots: 2,
      });

      expect(teamIds(scored[0])).toEqual(['m1', 'm2', 'w1']);
      expect('warnings' in scored[0]).toBe(false);
      expect(scored[0].warnings).toBeUndefined();
    });

    it('matches gender case- and whitespace-insensitively', () => {
      // Lower-case 'f' and a padded ' F ' must both satisfy female slots; a padded
      // ' m ' must not. Without trimming or case folding this school is excluded.
      const players = [
        player({ id: 'c1', rank: 1, points: 13, gender: 'f', club: 'Casing School' }),
        player({ id: 'c2', rank: 2, points: 11, gender: ' F ', club: 'Casing School' }),
        player({ id: 'c3', rank: 5, points: 6, gender: ' m ', club: 'Casing School' }),
      ];

      const { scored, excluded } = computeTeamScoresWithReasons(players, 3, 'club', {
        femaleSlots: 2,
        maleSlots: 1,
      });

      expect(excluded).toEqual([]);
      expect(teamIds(scored[0])).toEqual(['c1', 'c2', 'c3']);
      // ' m ' is not blank, so it raises no unknown-gender warning either.
      expect('warnings' in scored[0]).toBe(false);
    });
  });

  it('clamps slots that over-subscribe the team rather than crashing', () => {
    // femaleSlots 3 + maleSlots 3 against a teamSize of 4. Documented behaviour:
    // female is clamped to 3, male to the single remaining board. A DB check blocks
    // this configuration upstream; the scorer must not throw and must not exclude
    // an institution that satisfies the requirement that actually fits.
    const players = [
      player({ id: 'w1', rank: 1, points: 15, gender: 'F', club: 'Oversubscribed' }),
      player({ id: 'w2', rank: 2, points: 12, gender: 'F', club: 'Oversubscribed' }),
      player({ id: 'w3', rank: 4, points: 10, gender: 'F', club: 'Oversubscribed' }),
      player({ id: 'm1', rank: 6, points: 7, gender: 'M', club: 'Oversubscribed' }),
      player({ id: 'm2', rank: 9, points: 3, gender: 'M', club: 'Oversubscribed' }),
    ];

    const { scored, excluded } = computeTeamScoresWithReasons(players, 4, 'club', {
      femaleSlots: 3,
      maleSlots: 3,
    });

    expect(excluded).toEqual([]);
    expect(teamIds(scored[0])).toEqual(['w1', 'w2', 'w3', 'm1']);
    expect(scored[0].total_points).toBe(44); // 15 + 12 + 10 + 7
  });
});
