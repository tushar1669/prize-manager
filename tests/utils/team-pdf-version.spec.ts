import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildVersionedTeamPdfResults,
  type PinnedTeamGroup, type PinnedTeamPrize, type PinnedTeamAllocation,
} from '../../supabase/functions/_shared/teamPdfSnapshot';

const groups: PinnedTeamGroup[] = [
  { id: 'group-a', name: 'Fixture Team Cup', group_by: 'club', team_size: 2,
    female_slots: 0, male_slots: 0, scoring_mode: 'by_top_k_score' },
];
const prizes: PinnedTeamPrize[] = [
  { id: 'award-a', group_id: 'group-a', place: 1, cash_amount: 5000,
    has_trophy: true, has_medal: false },
  { id: 'award-b', group_id: 'group-a', place: 2, cash_amount: 2500,
    has_trophy: false, has_medal: true },
];
const row: PinnedTeamAllocation = {
  group_id: 'group-a', prize_id: 'award-a', place: 1,
  institution_key: 'Fixture School', total_points: 0,
  player_snapshot: [
    { player_id: 'p1', name: 'Fixture One', rank: 4, points: 0, gender: null },
    { player_id: 'p2', name: 'Fixture Two', rank: 6, points: 0, gender: null },
  ],
};

describe('generatePdf exact-version team award reconstruction', () => {
  it('shows only awarded snapshot winner(s), keeping valid zero and saved players', () => {
    const result = buildVersionedTeamPdfResults(groups, prizes, [row]);
    const awards = result.groups[0].prizes;
    expect(awards[0].winner_institution).toMatchObject({
      label: 'Fixture School', total_points: 0,
      players: [{ name: 'Fixture One', rank: 4, points: 0 }, { name: 'Fixture Two', rank: 6, points: 0 }],
    });
    expect(awards[1].winner_institution).toBeNull();
    expect(awards[0].cash_amount).toBe(5000);
    expect(result.groups[0].eligible_institutions).toBe(1);
  });

  it('shows unfilled awards when the requested version has no team snapshot', () => {
    const result = buildVersionedTeamPdfResults(groups, prizes, []);
    expect(result.groups[0].prizes.every(prize => prize.winner_institution === null)).toBe(true);
    expect(result.groups[0].eligible_institutions).toBe(0);
  });

  it('does not invent group winners in another group or reorder their ranks', () => {
    const other = { ...groups[0], id: 'group-b', name: 'Other Cup' };
    const result = buildVersionedTeamPdfResults([other, ...groups], prizes, [row]);
    expect(result.groups[0].prizes).toEqual([]);
    expect(result.groups[1].prizes.map(prize => prize.place)).toEqual([1, 2]);
    expect(result.groups[1].prizes[0].winner_institution?.key).toBe('Fixture School');
  });

  it('fails closed on a snapshot whose group or prize has been removed/changed', () => {
    expect(() => buildVersionedTeamPdfResults([], [], [row])).toThrow('cannot be reconstructed');
    expect(() => buildVersionedTeamPdfResults(groups, prizes.slice(1), [row])).toThrow('cannot be reconstructed');
    expect(() => buildVersionedTeamPdfResults(groups, prizes, [
      { ...row, place: 2 },
    ])).toThrow('cannot be reconstructed');
    expect(() => buildVersionedTeamPdfResults(groups, prizes, [row, row])).toThrow('cannot be reconstructed');
    expect(() => buildVersionedTeamPdfResults(groups, prizes, [
      { ...row, total_points: Number.NaN },
    ])).toThrow('cannot be reconstructed');
  });

  it('keeps valid empty tournaments empty', () => {
    expect(buildVersionedTeamPdfResults([], [], [])).toEqual({
      groups: [], players_loaded: 0, max_rank: 0,
    });
  });

  it('pins both the snapshot read and cache to the requested version and forbids live compute', () => {
    const source = readFileSync('supabase/functions/generatePdf/index.ts', 'utf8');
    expect(source).toContain('buildVersionedTeamPdfResults(');
    expect(source).toContain('${tournamentId}:${version}');
    expect(source).toContain(".eq('version', version)");
    expect(source).not.toContain("functions.invoke('publicTeamPrizes'");
    expect(source).not.toContain("'allocateInstitutionPrizes'");
    expect(source).not.toContain('latestAlloc');
  });

  it('server PDF request passes its explicit allocation version to the Team Prize loader', () => {
    const source = readFileSync('supabase/functions/generatePdf/index.ts', 'utf8');
    expect(source).toMatch(/loadTeamPrizes\(\s*supabaseClient,\s*tournamentId,\s*version\s*\)/);
    expect(source).toMatch(/Number\.isSafeInteger\(version\).*version < 1/);
  });
});
