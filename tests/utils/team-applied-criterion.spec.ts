import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { teamAppliedCriterionLabel } from '@/utils/teamAppliedCriterion';

describe('visible named Team Prize rule provenance', () => {
  const snapshot = (decidedBy: string, verified = true) => ({
    schema_version: 2,
    decided_by_criterion: decidedBy,
    declared_rules: {
      criteria: [
        { kind: 'score_vector' },
        { kind: 'source_tb', ordinal: 2, name: 'Verified source TB name',
          verified, aggregation: 'sum', direction: 'higher' },
      ],
    },
  });

  it('shows the actual named TB when verified; never assumes a particular TB1/TB2 identity', () => {
    expect(teamAppliedCriterionLabel(snapshot('TB2'))).toBe('TB2 · Verified source TB name');
    expect(teamAppliedCriterionLabel(snapshot('TB1'))).toBeNull();
    expect(teamAppliedCriterionLabel(snapshot('TB2', false))).toBeNull();
  });

  it('names score-vector decisions but not fixed-total or unsupported legacy results', () => {
    expect(teamAppliedCriterionLabel(snapshot('score_vector'))).toBe('Highest individual scores');
    expect(teamAppliedCriterionLabel(snapshot('total_points'))).toBeNull();
    expect(teamAppliedCriterionLabel({ schema_version: 1, decided_by_criterion: 'TB2' })).toBeNull();
    expect(teamAppliedCriterionLabel(null)).toBeNull();
  });

  it('does not display a source metric with missing or incompatible verification', () => {
    const base = snapshot('TB2');
    expect(teamAppliedCriterionLabel({
      ...base, declared_rules: { criteria: [{ ...base.declared_rules.criteria[1], aggregation: 'average' }] },
    })).toBeNull();
    expect(teamAppliedCriterionLabel({ ...base, declared_rules: null })).toBeNull();
    expect(teamAppliedCriterionLabel(snapshot('TB9999999999999999999999999999'))).toBeNull();
  });

  it('connects server audit to the final Team handout and rule-card summary', () => {
    const hook = readFileSync('src/components/team-prizes/useTeamPrizeResults.ts', 'utf8');
    const panel = readFileSync('src/components/allocation/TeamPrizeResultsPanel.tsx', 'utf8');
    const rules = readFileSync('src/components/team-prizes/TeamPrizesEditor.tsx', 'utf8');
    expect(hook).toContain('ranking_snapshot: winner.ranking_snapshot ?? null');
    expect(panel).toContain('Tie-break applied:');
    expect(panel).toContain('teamAppliedCriterionLabel(winner.ranking_snapshot)');
    expect(rules).toContain('needs definition');
    expect(rules).toContain('rule.name.trim()');
  });
});
