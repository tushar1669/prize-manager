import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTeamRankingAwardAudit } from '../../supabase/functions/_shared/teamRankingAudit';
import { verifyTeamFinalizePreview } from '../../supabase/functions/_shared/teamFinalizeGuard';

const groupRule = {
  group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0, scoring_mode: 'by_top_k_score',
};
const prize = { id: 'prize-fixture', place: 1, cash_amount: 2000, has_trophy: true, has_medal: false };
const candidates = [
  { key: 'A', selectedPlayers: [
    { playerId: 'a1', points: 6, sourceHash: 'import-fixture', individualTieBreaks: { 1: 0, 2: 7 } },
    { playerId: 'a2', points: 6, sourceHash: 'import-fixture', individualTieBreaks: { 1: 4, 2: 8 } },
  ] },
  { key: 'B', selectedPlayers: [
    { playerId: 'b1', points: 6, sourceHash: 'import-fixture', individualTieBreaks: { 1: 0, 2: 9 } },
    { playerId: 'b2', points: 6, sourceHash: 'import-fixture', individualTieBreaks: { 1: 4, 2: 7 } },
  ] },
];
const rules = {
  version: 2 as const,
  source_hash: 'import-fixture',
  published_reference: 'fixture event regulations §3',
  organizer_confirmed: true,
  criteria: [
    { kind: 'score_vector' as const },
    { kind: 'source_tb' as const, ordinal: 2, name: 'Fixture verified TB2',
      aggregation: 'sum' as const, direction: 'lower' as const, verified: true },
  ],
};

describe('versioned team-ranking audit saved per award', () => {
  it('captures declared order, source hash, exact K IDs, scores and TB zeroes', () => {
    const partitions = [
      { teams: [candidates[0]], status: 'resolved' as const, criterion: 'TB2' },
      { teams: [candidates[1]], status: 'resolved' as const, criterion: 'TB2' },
    ];
    const snapshot = buildTeamRankingAwardAudit(
      'group-fixture', groupRule, prize, 'A', rules, candidates, partitions,
    );
    expect(snapshot).toMatchObject({
      schema_version: 2, group_id: 'group-fixture',
      group_rule: { team_size: 2, female_slots: 0 },
      award: { id: 'prize-fixture', cash_amount: 2000 },
      declared_rules: { source_hash: 'import-fixture', criteria: [
        { kind: 'score_vector' }, { kind: 'source_tb', ordinal: 2, direction: 'lower' },
      ] },
      decided_by_criterion: 'TB2', winner_key: 'A',
    });
    // Audit intentionally includes both competing teams; assert each member
    // and both lengths rather than mistakenly expecting a single-item array.
    expect(snapshot?.candidates[0]).toMatchObject({ key: 'A', selected_players: [
      { player_id: 'a1', points: 6, source_hash: 'import-fixture', individual_tbs: { '1': 0, '2': 7 } },
      { player_id: 'a2', points: 6 },
    ] });
    expect(snapshot?.partitions[0]).toMatchObject({ status: 'resolved', team_keys: ['A'], criterion: 'TB2' });
    expect(snapshot?.candidates).toHaveLength(2);
    expect(snapshot?.partitions).toHaveLength(2);
    expect(JSON.stringify(snapshot)).not.toContain('Synthetic One');
  });

  it('refuses to create a cash-award audit for a tied or blocked winner', () => {
    expect(buildTeamRankingAwardAudit('group-fixture', groupRule, prize, 'A', rules, candidates, [
      { teams: [candidates[0], candidates[1]], status: 'tied' },
    ])).toBeNull();
    expect(buildTeamRankingAwardAudit('group-fixture', groupRule, prize, 'Z', rules, candidates, [
      { teams: [candidates[0]], status: 'resolved', criterion: 'total_points' },
    ])).toBeNull();
  });

  it('records the real tied partition and documented official ruling without pretending it was resolved', () => {
    const tied = [{ teams: [candidates[0], candidates[1]], status: 'tied' as const }];
    const ruling = {
      schema_version: 2 as const, group_id: 'group-fixture',
      allocation_version: 3, supersedes_allocation_version: 2,
      actor_id: 'owner-fixture', recorded_at: '2026-10-30T00:00:00Z',
      method: 'documented_arbiter_ruling' as const,
      regulation_reference: 'fixture event regulations §3',
      arbiter_decision_reference: 'official ruling 7',
      explanation: 'Exhausted event TBs under published regulations',
      tied_team_keys: ['A', 'B'], ordered_team_keys: ['B', 'A'],
      affected_places: [1],
      award_instructions: [{ place: 1, institution_key: 'B' }],
    };
    const result = buildTeamRankingAwardAudit(
      'group-fixture', groupRule, prize, 'B', rules, candidates, tied, ruling,
    );
    expect(result).toMatchObject({
      decided_by_criterion: 'documented_arbiter_ruling',
      winner_key: 'B',
      partitions: [{ status: 'tied', team_keys: ['A', 'B'] }],
      ruling: { arbiter_decision_reference: 'official ruling 7', allocation_version: 3 },
    });
    expect(buildTeamRankingAwardAudit(
      'group-fixture', groupRule, prize, 'A', rules, candidates, tied, ruling,
    )).toBeNull();
    expect(buildTeamRankingAwardAudit(
      'group-fixture', groupRule, prize, 'B', rules, candidates,
      [{ teams: [candidates[0], candidates[1]], status: 'blocked' }], ruling,
    )).toBeNull();
  });

  it('finalize guard rejects tampered rankings or missing player points', () => {
    const partitions = [
      { teams: [candidates[0]], status: 'resolved' as const, criterion: 'TB2' },
      { teams: [candidates[1]], status: 'resolved' as const, criterion: 'TB2' },
    ];
    const base = buildTeamRankingAwardAudit('group-fixture', groupRule, prize, 'A', rules, candidates, partitions);
    const request = (audit: unknown) => ({ groups: [{
      group_id: 'group-fixture', ranking_issues: [],
      prizes: [{ ...prize, winner_institution: {
        key: 'A', total_points: 12,
        players: [
          { player_id: 'a1', name: 'Fixture One', rank: 1, points: 6, gender: null },
          { player_id: 'a2', name: 'Fixture Two', rank: 2, points: 6, gender: null },
        ], ranking_snapshot: audit,
      } }],
    }] });
    expect(verifyTeamFinalizePreview(request(base), 1).ok).toBe(true);
    expect(verifyTeamFinalizePreview(request(null), 1)).toEqual({ ok: false, reason: 'invalid_preview' });
    expect(verifyTeamFinalizePreview(request({ ...base, award: { ...prize, cash_amount: 9000 } }), 1).ok).toBe(false);
    expect(verifyTeamFinalizePreview(request({ ...base, decided_by_criterion: 'TB1' }), 1).ok).toBe(false);
    expect(verifyTeamFinalizePreview(request({
      ...base,
      candidates: [{ ...base!.candidates[0], selected_players: [
        { ...base!.candidates[0].selected_players[0], points: 99 },
        base!.candidates[0].selected_players[1],
      ] }, base!.candidates[1]],
    }), 1).ok).toBe(false);
  });

  it('writes audit in the same versioned team row only after preflight', () => {
    const source = readFileSync('supabase/functions/finalize/index.ts', 'utf8');
    const guard = source.indexOf('verifyTeamFinalizePreview(teamData');
    const persisted = source.indexOf('ranking_snapshot: {');
    const writer = source.indexOf(".from('team_allocations')\n          .insert(rows)");
    expect(guard).toBeGreaterThan(-1);
    expect(persisted).toBeGreaterThan(guard);
    expect(writer).toBeGreaterThan(persisted);
    expect(source).toContain('allocation_version: nextVersion');
    expect(source).toContain('finalized_by: user.id');
  });
});
