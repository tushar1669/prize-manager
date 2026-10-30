import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { prepareInitialUncontestedTeamV2Rows } from '../../supabase/functions/_shared/teamV2InitialSaveRows';

const rules = {
  version: 2 as const, source_hash: null, published_reference: 'fixture-regulations',
  organizer_confirmed: true, criteria: [{ kind: 'score_vector' as const }],
};
const group = {
  id: 'g', group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0,
  scoring_mode: 'by_top_k_score', ranking_rules: rules,
};
const prize = { id: 'tp', group_id: 'g', place: 1, cash_amount: 200,
  has_trophy: true, has_medal: false };
const people = [
  { player_id: 'p1', name: 'Synthetic 1', rank: 1, gender: null, points: 5 },
  { player_id: 'p2', name: 'Synthetic 2', rank: 2, gender: null, points: 4 },
];
const audit = {
  schema_version: 2, group_id: 'g', winner_key: 'Club A',
  award: { id: 'tp', place: 1, cash_amount: 200, has_trophy: true, has_medal: false },
  group_rule: { group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0,
    scoring_mode: 'by_top_k_score' },
  declared_rules: rules, decided_by_criterion: 'total_points',
  candidates: [{ key: 'Club A', selected_players: people.map(p => ({
    player_id: p.player_id, points: p.points, source_hash: null, individual_tbs: {},
  })) }],
  partitions: [{ status: 'resolved', criterion: 'total_points', team_keys: ['Club A'] }],
};
const winner = { key: 'Club A', total_points: 9, players: people,
  ranking_snapshot: audit };
const individual = {
  winners: [{ prizeId: 'ip', playerId: 'p1', reasons: ['rank'], isManual: false }],
  unfilled: [],
  meta: { dryRun: false, hiddenWinnersCount: 0, activePrizeCount: 1,
    winnersCount: 1, unfilledCount: 0 },
};
const team = {
  groups: [{ group_id: 'g', config: {
    group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0,
    scoring_mode: 'by_top_k_score',
  }, prizes: [{ ...prize, is_active: true, winner_institution: winner }],
  ranking_issues: [],
  adjudication_rules_reference: 'fixture-regulations',
  adjudication_partitions: [{ status: 'resolved', criterion: 'total_points',
    teams: [{ key: 'Club A' }] }],
  adjudication_ties: [] }],
};
const prepare = (ind: unknown = individual, sc: unknown = team,
  groups = [group], prizes = [prize], individualIds = ['ip'], newVersion = 1) =>
  prepareInitialUncontestedTeamV2Rows(individualIds, ind, groups, prizes, sc, 'owner', newVersion);

describe('initial Team v2 Save source-only fail-closed assembler', () => {
  it('builds complete server-sourced award arrays for a genuinely uncontested first version', () => {
    const result = prepare();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.individual_rows).toEqual([{
      prize_id: 'ip', player_id: 'p1', reason_codes: ['rank'], is_manual: false,
    }]);
    expect(result.rows.team_rows).toHaveLength(1);
    expect(result.rows.team_rows[0].player_ids).toEqual(['p1', 'p2']);
    expect(result.rows.team_rows[0].total_points).toBe(9);
    expect(result.rows.team_rows[0].ranking_snapshot).toMatchObject({
      allocation_version: 1, finalized_by: 'owner', winner_key: 'Club A',
    });
    expect(result.rows.rulings).toEqual([]);
  });
  it('supports an explicit genuinely unfilled individual prize without inventing a winner', () => {
    const unfilledId = 'ip-without-eligible-player';
    const preview = {
      ...individual,
      unfilled: [{ prizeId: unfilledId, reasonCodes: ['no_eligible_players'] }],
      meta: { ...individual.meta, activePrizeCount: 2, unfilledCount: 1 },
    };
    const result = prepare(preview, team, [group], [prize], ['ip', unfilledId]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.individual_rows).toEqual([
      { prize_id: 'ip', player_id: 'p1', reason_codes: ['rank'], is_manual: false },
      { prize_id: unfilledId, player_id: null,
        reason_codes: ['no_eligible_players'], is_manual: false },
    ]);
    expect(result.rows.team_rows).toHaveLength(1);
  });

  it('builds the audited next version without changing the roster or historical awards', () => {
    const result = prepare(individual, team, [group], [prize], ['ip'], 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.team_rows[0].ranking_snapshot).toMatchObject({
      allocation_version: 2, finalized_by: 'owner', winner_key: 'Club A',
    });
  });

  it('rejects missing or masked individual prize coverage', () => {
    expect(prepare({ ...individual, meta: { ...individual.meta, hiddenWinnersCount: 1 } }).ok).toBe(false);
    expect(prepare({ ...individual, unfilled: [{ prizeId: 'ip', reasonCodes: ['none'] }],
      winners: [], meta: { ...individual.meta, winnersCount: 0, unfilledCount: 1 } }).ok).toBe(false);
    expect(prepare(individual, team, [group], [prize], ['ip', 'unseen']).ok).toBe(false);
  });
  it('rejects changed cash, duplicate or missing prize-bearing groups', () => {
    expect(prepare(individual, team, [group], [{ ...prize, cash_amount: 500 }]).ok).toBe(false);
    expect(prepare(individual, team, [group, { ...group, id: 'g2' }]).ok).toBe(false);
    expect(prepare(individual, team, [group], [prize, { ...prize, id: 'tp2', place: 2 }]).ok).toBe(false);
  });
  it('rejects tied, blocked and malformed ranking provenance', () => {
    const g = team.groups[0];
    for (const status of ['tied', 'blocked']) {
      expect(prepare(individual, { groups: [{
        ...g, adjudication_partitions: [{ status, teams: [{ key: 'Club A' }] }],
      }] }).ok).toBe(false);
    }
    expect(prepare(individual, { groups: [{
      ...g, ranking_issues: ['unresolved'] }] }).ok).toBe(false);
    expect(prepare(individual, { groups: [{
      ...g, adjudication_ties: [{ team_keys: ['Club A'], affected_places: [1] }],
    }] }).ok).toBe(false);
    expect(prepare(individual, { groups: [{
      ...g, prizes: [{ ...g.prizes[0], winner_institution: {
        ...winner, total_points: 10,
      } }],
    }] }).ok).toBe(false);
  });
  it('requires verified, exact event rules and genuine audit', () => {
    expect(prepare(individual, team, [{ ...group,
      ranking_rules: { ...rules, organizer_confirmed: false } }]).ok).toBe(false);
    expect(prepare(individual, team, [{ ...group,
      ranking_rules: { ...rules, published_reference: '' } }]).ok).toBe(false);
    expect(prepare(individual, { groups: [{
      ...team.groups[0], prizes: [{
        ...prize, is_active: true,
        winner_institution: { ...winner, ranking_snapshot: {
          ...audit, declared_rules: { ...rules, published_reference: 'mismatch' },
        } },
      }],
    }] }).ok).toBe(false);
  });
  it('requires real server-side master role for early admin-only Save', () => {
    const source = readFileSync('supabase/functions/saveTeamV2/index.ts', 'utf8');
    const identity = source.indexOf("db.auth.getUser(auth.slice('Bearer '.length))");
    const roleLookup = source.indexOf("db.rpc('has_role'");
    const masterOnly = source.indexOf("if (master !== true)");
    const write = source.indexOf("db.rpc(\n      'commit_team_v2_adjudicated_version'");
    expect(identity).toBeGreaterThan(-1);
    expect(roleLookup).toBeGreaterThan(identity);
    expect(masterOnly).toBeGreaterThan(roleLookup);
    expect(write).toBeGreaterThan(masterOnly);
    expect(source).toContain("error: 'master_only_preview'");
    expect(source).toContain("ENABLE_TEAM_V2_ATOMIC_SAVE");
  });

  it('connects official ruling proposals to SERVER-validated rows before the atomic writer', () => {
    const source = readFileSync('supabase/functions/saveTeamV2/index.ts', 'utf8');
    expect(source).toContain("prepareAdjudicatedTeamV2Rows(");
    expect(source).toContain("'official_rulings'");
    expect(source).toContain("requestBody.official_rulings");
    expect(source).toContain("p_rulings: proposal.rows.rulings");
    expect(source).toContain("p_expected_source_fingerprint: before");
    expect(source).toContain("if (master !== true)");
    expect(source).not.toContain("requestBody.winners");
    expect(source).not.toContain("resolve_team_tie");
  });

  it('keeps the Edge route off unless explicitly enabled and rejects client award inputs', () => {
    const source = readFileSync('supabase/functions/saveTeamV2/index.ts', 'utf8');
    expect(source).toContain("ENABLE_TEAM_V2_ATOMIC_SAVE");
    expect(source).toContain("!== '1'");
    expect(source).toContain("Number.isSafeInteger(requestBody.expected_version)");
    expect(source).toContain("p_expected_version: expectedVersion");
    expect(source).toContain("expectedVersion === 0 ? proposal.rows.individual_rows : []");
    expect(source).toContain("Object.keys(requestBody).some");
    expect(source).toContain("has_role");
    expect(source).toContain("get_tournament_access_state");
    expect(source).toContain("commit_team_v2_adjudicated_version");
    expect(source).toContain("p_individual_rows: expectedVersion === 0 ? proposal.rows.individual_rows : []");
    expect(source).not.toMatch(/p_individual_rows:\s*proposal\.rows\.individual_rows\s*,/);
    expect(source).toContain("p_rulings: []");
    expect(source).toContain("team_v2_source_fingerprint");
    expect(source).toContain("p_expected_source_fingerprint: before");
    expect(source).toContain("after !== before");
    expect(source).not.toContain("requestBody.winners");
  });
});
