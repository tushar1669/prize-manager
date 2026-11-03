import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { teamAppliedCriterionLabel } from '@/utils/teamAppliedCriterion';
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
  it('uses one pure formatter for browser and public endpoint', () => {
    expect(teamAppliedCriterionLabel(audit)).toBe('TB2 · Verified Rule');
    const client = readFileSync('src/utils/teamAppliedCriterion.ts', 'utf8');
    const api = readFileSync('supabase/functions/publicTeamPrizes/index.ts', 'utf8');
    expect(client).toContain("../../supabase/functions/_shared/teamAppliedCriterion");
    expect(api).toContain('applied_rule_label: teamAppliedCriterionLabel(winner.ranking_snapshot)');
    expect(api).not.toContain('ranking_snapshot: winner.ranking_snapshot');
    expect(api).toContain(".eq('version', pinnedVersion)");
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
