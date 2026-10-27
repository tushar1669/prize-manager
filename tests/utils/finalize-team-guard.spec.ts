import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { verifyTeamFinalizePreview } from '../../supabase/functions/_shared/teamFinalizeGuard';
import { buildTeamRankingAwardAudit } from '../../supabase/functions/_shared/teamRankingAudit';

const winningGroup = () => {
  const players = [
    { player_id: 'p1', name: 'Synthetic One', rank: 1, points: 7, gender: null },
    { player_id: 'p2', name: 'Synthetic Two', rank: 2, points: 5, gender: 'F' },
  ];
  const candidate = {
    key: 'Synthetic Club A',
    selectedPlayers: players.map(p => ({ playerId: p.player_id, points: p.points })),
  };
  const award = { id: 'fixture-prize', place: 1, cash_amount: 1000, has_trophy: true, has_medal: false };
  const ranking_snapshot = buildTeamRankingAwardAudit(
    'fixture-group',
    { group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0, scoring_mode: 'by_top_k_score' },
    award, candidate.key, null, [candidate],
    [{ teams: [candidate], status: 'resolved', criterion: 'total_points' }],
  );
  return {
    group_id: 'fixture-group',
    ranking_issues: [],
    prizes: [{ ...award, winner_institution: {
      key: candidate.key, total_points: 12, players, ranking_snapshot,
    } }],
  };
};

describe('finalize v2 server-authoritative pre-write ranking gate', () => {
  it('permits unambiguous award results and valid unfilled prizes', () => {
    const group = winningGroup();
    group.prizes.push({
      id: 'not-filled', place: 2, cash_amount: 0,
      has_trophy: true, has_medal: false, winner_institution: null as never,
    });
    expect(verifyTeamFinalizePreview({ groups: [group] }, 1)).toMatchObject({
      ok: true, groups: [{ group_id: 'fixture-group' }],
    });
  });

  it('blocks both unresolved ties and missing/undefined tie-break rules', () => {
    for (const issue of ['Place 1: team ranking tied', 'Place 2: team ranking blocked; undefined_tb']) {
      const group = winningGroup();
      group.ranking_issues = [issue];
      expect(verifyTeamFinalizePreview({ groups: [group] }, 1)).toEqual({
        ok: false, reason: 'unresolved_ranking',
      });
    }
  });

  it('rejects an old allocator without ranking_issues rather than accepting false certainty', () => {
    const { ranking_issues: _unused, ...oldGroup } = winningGroup();
    // The fixture deliberately removes the v2 decision contract.
    expect(_unused).toEqual([]);
    expect(verifyTeamFinalizePreview({ groups: [oldGroup] }, 1)).toEqual({
      ok: false, reason: 'invalid_preview',
    });
  });

  it('rejects partial, duplicate, absent or malformed group payloads', () => {
    const group = winningGroup();
    for (const response of [null, {}, { groups: [] }, { groups: [group, group] },
      { groups: [{ ...group, prizes: undefined }] }]) {
      expect(verifyTeamFinalizePreview(response, 2).ok).toBe(false);
    }
    expect(verifyTeamFinalizePreview({ groups: [group, group] }, 2).ok).toBe(false);
    expect(verifyTeamFinalizePreview({ groups: [group] }, 2).ok).toBe(false);
    expect(verifyTeamFinalizePreview({ groups: [group] }, 1).ok).toBe(true);
  });

  it('rejects malformed winner snapshots before any partial data write', () => {
    const bad = winningGroup();
    bad.prizes[0].winner_institution.players[0].points = Number.NaN;
    expect(verifyTeamFinalizePreview({ groups: [bad] }, 1)).toEqual({
      ok: false, reason: 'invalid_preview',
    });
  });


  it('fences configured Team Ranking v2 from the competing MAX+1 legacy finalize writer', () => {
    const source = readFileSync('supabase/functions/finalize/index.ts', 'utf8');
    const ownerGate = source.indexOf('tournamentAccess.owner_id !== user.id && !isMaster');
    const rulesRead = source.indexOf(".select('id, ranking_rules')");
    const missingRules = source.indexOf('activeTeamRulesError || !activeTeamRules');
    const v2Fence = source.indexOf('activeTeamRules.some(group => group.ranking_rules !== null)');
    const denied = source.indexOf("error: 'team_v2_atomic_writer_required'");
    const write = source.indexOf(".from('allocations')\n      .insert(allocationsToInsert)");
    expect(ownerGate).toBeGreaterThan(-1);
    expect(rulesRead).toBeGreaterThan(ownerGate);
    expect(missingRules).toBeGreaterThan(rulesRead);
    expect(v2Fence).toBeGreaterThan(missingRules);
    expect(denied).toBeGreaterThan(v2Fence);
    expect(write).toBeGreaterThan(denied);
    expect(source).not.toContain(".rpc('commit_team_v2_adjudicated_version'");
  });

  it('fails closed on missing/stale rule reads rather than treating unknown as legacy', () => {
    const source = readFileSync('supabase/functions/finalize/index.ts', 'utf8');
    const clauses = [
      'activeTeamRulesError || !activeTeamRules',
      'activeTeamRules.length !== teamGroupCount',
      'group.ranking_rules !== null',
      "error: 'team_v2_writer_route_unavailable'",
      "error: 'team_v2_atomic_writer_required'",
    ];
    for (const clause of clauses) {
      expect(source).toContain(clause);
      // Negative control: deleting each critical clause must invalidate its check.
      expect(source.replace(clause, '')).not.toContain(clause);
    }
  });

  it('places preflight ahead of the first individual allocation INSERT in the actual Edge route', () => {
    const source = readFileSync(
      'supabase/functions/finalize/index.ts', 'utf8',
    );
    const verified = source.indexOf('verifyTeamFinalizePreview(teamData');
    const inserted = source.indexOf(".from('allocations')\n      .insert(allocationsToInsert)");
    expect(verified).toBeGreaterThan(-1);
    expect(inserted).toBeGreaterThan(verified);
    expect(source).not.toMatch(/\.from\('allocations'\)\s*\.insert\([^)]*\)[\s\S]*verifyTeamFinalizePreview\(teamData/);
  });
});
