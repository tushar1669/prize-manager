import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { teamAppliedCriterionLabel } from '@/utils/teamAppliedCriterion';
import { buildVersionedTeamPdfResults } from '../../supabase/functions/_shared/teamPdfSnapshot';
import { generateHtmlReport } from '../../supabase/functions/_shared/prizePrintableHtml';
import { buildTeamPrizeExportRows } from '@/utils/teamPrizeExport';
import type { TeamPrizeResultsResponse } from '@/components/team-prizes/useTeamPrizeResults';

const audit = {
  schema_version: 2, decided_by_criterion: 'TB2',
  candidates: [{ key: 'private-candidate', selected_players: [{ player_id: 'private-id', individual_tbs: { 2: 3 } }] }],
  declared_rules: { criteria: [
    { kind: 'source_tb', ordinal: 2, name: 'Verified Rule', verified: true,
      aggregation: 'sum', direction: 'higher' },
  ] },
};

describe('Team Prize v2 criterion parity without rewriting historical awards', () => {
  it('uses one pure formatter for browser, public endpoint and server PDF', () => {
    expect(teamAppliedCriterionLabel(audit)).toBe('TB2 · Verified Rule');
    const client = readFileSync('src/utils/teamAppliedCriterion.ts', 'utf8');
    const api = readFileSync('supabase/functions/publicTeamPrizes/index.ts', 'utf8');
    const pdf = readFileSync('supabase/functions/_shared/teamPdfSnapshot.ts', 'utf8');
    expect(client).toContain("../../supabase/functions/_shared/teamAppliedCriterion");
    expect(api).toContain('applied_rule_label: teamAppliedCriterionLabel(winner.ranking_snapshot)');
    expect(api).not.toContain('ranking_snapshot: winner.ranking_snapshot');
    expect(api).toContain(".eq('version', pinnedVersion)");
    expect(pdf).toContain('applied_rule_label: teamAppliedCriterionLabel(allocation.ranking_snapshot)');
  });

  it('reconstructs the exact saved rule in PDF rows, no invented label for legacy awards', () => {
    const groups = [{ id: 'g', name: 'Team', group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0, scoring_mode: 'by_top_k_score' }];
    const prizes = [{ id: 'prize', group_id: 'g', place: 1, cash_amount: 0, has_trophy: true, has_medal: false }];
    const row = { group_id: 'g', prize_id: 'prize', place: 1, institution_key: 'Club A',
      total_points: 12, player_snapshot: [
        { player_id: 'p1', name: 'Fixture One', rank: 1, points: 7, gender: null },
        { player_id: 'p2', name: 'Fixture Two', rank: 2, points: 5, gender: null },
      ],
    };
    expect(buildVersionedTeamPdfResults(groups, prizes, [{ ...row, ranking_snapshot: audit }])
      .groups[0].prizes[0].winner_institution?.applied_rule_label).toBe('TB2 · Verified Rule');
    expect(buildVersionedTeamPdfResults(groups, prizes, [row])
      .groups[0].prizes[0].winner_institution?.applied_rule_label).toBeNull();
    const tournament = { title: 'Synthetic', start_date: '2026-10-03',
      end_date: '2026-10-04', venue: 'Fixture Hall' };
    const awarded = buildVersionedTeamPdfResults(groups, prizes, [{ ...row, ranking_snapshot: audit }]);
    const legacy = buildVersionedTeamPdfResults(groups, prizes, [row]);
    const printed = generateHtmlReport(tournament, [], 5, awarded, null);
    expect(printed).toContain('Tie-break applied: TB2 · Verified Rule');
    expect(printed).not.toContain('private-candidate');
    expect(printed).not.toContain('private-id');
    expect(generateHtmlReport(tournament, [], 5, legacy, null)).not.toContain('Tie-break applied:');
  });

  it('prints matching tie-break in Excel without touching winners or exposing unpaid prizes', () => {
    const data: TeamPrizeResultsResponse = { groups: [{
      group_id: 'g', name: 'Fixture Group', eligible_institutions: 1,
      ineligible_institutions: 0, ineligible_reasons: [],
      config: { group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0, scoring_mode: 'by_top_k_score' },
      prizes: [{ id: 'p', place: 1, cash_amount: 0, has_trophy: true,
        has_medal: false, is_active: true,
        winner_institution: { key: 'a', label: 'Club A', rank_sum: 0, best_individual_rank: 0,
          total_points: 12, players: [], ranking_snapshot: audit },
      }],
    }], players_loaded: 0, max_rank: 0 };
    expect(buildTeamPrizeExportRows(data, true)[0]).toMatchObject({
      'Team / Institution': 'Club A', 'Tie-break applied': 'TB2 · Verified Rule',
      'Cash Amount': 0,
    });
    expect(buildTeamPrizeExportRows(data, false)).toEqual([]);
  });

  it('does not expose raw private audit data or invent legacy/unverified methods', () => {
    expect(teamAppliedCriterionLabel(null)).toBeNull();
    expect(teamAppliedCriterionLabel({ schema_version: 1, decided_by_criterion: 'TB2' })).toBeNull();
    expect(teamAppliedCriterionLabel({
      ...audit, declared_rules: { criteria: [{ ...audit.declared_rules.criteria[0], verified: false }] },
    })).toBeNull();
    const publicView = JSON.stringify({ applied_rule_label: teamAppliedCriterionLabel(audit) });
    expect(publicView).not.toContain('private-candidate');
    expect(publicView).not.toContain('private-id');
    const publicApi = readFileSync('supabase/functions/publicTeamPrizes/index.ts', 'utf8');
    expect(publicApi).not.toContain('ranking_snapshot: winner.ranking_snapshot');
  });
});
