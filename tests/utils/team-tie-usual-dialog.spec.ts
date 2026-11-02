import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectTeamTiesAtBoundary } from '@/utils/teamTieDetection';
import type { GroupResponse, WinnerInstitution } from '@/components/team-prizes/useTeamPrizeResults';

const team = (key: string, points: number): WinnerInstitution => ({
  key, label: key, total_points: points, rank_sum: 0, best_individual_rank: 1,
  players: [{ player_id: `${key}-1`, name: `${key} One`, rank: 1, points, gender: null }],
});

// Places 2 and 3 could not be decided by the steps; place 1 was.
const group = (filled: number[]): GroupResponse => ({
  group_id: 'g', name: 'Best School',
  config: { group_by: 'club', team_size: 1, female_slots: 0, male_slots: 0, scoring_mode: 'by_top_k_score' },
  eligible_institutions: 4, ineligible_institutions: 0, ineligible_reasons: [],
  prizes: [1, 2, 3].map(place => ({
    id: `p${place}`, place, cash_amount: 1000, has_trophy: false, has_medal: false, is_active: true,
    winner_institution: filled.includes(place) ? team(`W${place}`, 5) : null,
  })),
  ranking_ties: [{
    affected_places: [2, 3], reason: 'still equal after every tie-break step',
    teams: [team('B', 4), team('C', 4), team('D', 4)],
  }],
});

describe('team ties go to the usual tie dialog', () => {
  it('no ranking ties: nothing to resolve (saved results and the public page)', () => {
    expect(detectTeamTiesAtBoundary({ ...group([1, 2, 3]), ranking_ties: undefined })).toBeNull();
    expect(detectTeamTiesAtBoundary({ ...group([1]), ranking_ties: [] })).toBeNull();
  });

  it('places still empty: an open tie with every team in contention, runner-up included', () => {
    const tie = detectTeamTiesAtBoundary(group([1]));
    expect(tie).toMatchObject({ affectedPlaces: [2, 3], hasNote: false, reason: 'still equal after every tie-break step' });
    expect(tie?.tiedInstitutions.map(t => t.key)).toEqual(['B', 'C', 'D']);
  });

  it('places filled by the dialog: the tie shows as resolved, so it can be edited', () => {
    expect(detectTeamTiesAtBoundary(group([1, 2, 3]))?.hasNote).toBe(true);
    // Half-filled is still open.
    expect(detectTeamTiesAtBoundary(group([1, 2]))?.hasNote).toBe(false);
  });

  it('the Finalize view adds the current ties to the saved version, and only there', () => {
    const view = readFileSync('src/components/final-prize/TeamPrizesTabView.tsx', 'utf8');
    expect(view).toContain('ranking_ties: live.ranking_ties');
    expect(view).toContain('enabled: showDiagnostics && allocationVersion !== undefined');
    expect(view).toMatch(/onTieResolutionRequest=\{showDiagnostics && hasFullAccess && allocationVersion !== undefined/);
  });

  it('the dialog needs a reason, never mentions Rank Sum, and clears the cached result', () => {
    const dialog = readFileSync('src/components/allocation/TeamTieBreakDialog.tsx', 'utf8');
    expect(dialog).toContain('const reasonValid = reason.trim().length > 0;');
    expect(dialog).not.toMatch(/Rank Sum/i);
    expect(dialog).toContain('invalidateTeamPrizeResultCache(tournamentId)');
  });

  it('the scorer leaves undecided places empty and lists them as ties', () => {
    const scorer = readFileSync('supabase/functions/allocateInstitutionPrizes/index.ts', 'utf8');
    expect(scorer).toContain("const winner = slot?.partition.status === 'resolved' ? slot.institution : null;");
    expect(scorer).toContain('rankingTies.push({');
    expect(scorer).not.toContain('adjudication_');
  });
});
