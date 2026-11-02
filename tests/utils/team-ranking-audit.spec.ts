import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTeamRankingAwardAudit } from '../../supabase/functions/_shared/teamRankingAudit';

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

  it('Finalize writes the scorer\'s ranking_snapshot and no longer refuses with team_v2_save_required', () => {
    const source = readFileSync('supabase/functions/finalize/index.ts', 'utf8');
    expect(source).not.toContain('ranking_snapshot: {');
    expect(source).toContain('ranking_snapshot: prize.winner_institution!.ranking_snapshot ?? null');
    expect(source).not.toContain('team_v2_save_required');
  });
});
