import { describe, expect, it } from 'vitest';
import { isTeamPrizeGroupLimitReached } from '@/utils/teamPrizeGroupLimit';
import { teamPrizeGroupLimitHint } from '@/constants/tournamentAccess';

/**
 * TC1.6-B. Free tier (<=150 players) is capped at one ACTIVE team prize
 * group. This predicate is what `TeamPrizesEditor` wires the "Add Team Prize
 * Group" button's `disabled` to — CLIENT-SIDE ONLY, see
 * docs/team-championship/ARCHITECTURE.md "TC1.6-debt".
 */
describe('isTeamPrizeGroupLimitReached', () => {
  it('is reached on the free tier once one group is active', () => {
    expect(isTeamPrizeGroupLimitReached(true, 1)).toBe(true);
    expect(isTeamPrizeGroupLimitReached(true, 2)).toBe(true);
  });

  it('is not reached on the free tier with zero active groups', () => {
    expect(isTeamPrizeGroupLimitReached(true, 0)).toBe(false);
  });

  it('never applies off the free tier, no matter how many groups exist', () => {
    expect(isTeamPrizeGroupLimitReached(false, 0)).toBe(false);
    expect(isTeamPrizeGroupLimitReached(false, 1)).toBe(false);
    expect(isTeamPrizeGroupLimitReached(false, 5)).toBe(false);
  });

  it('counts only ACTIVE groups — an inactive one does not block adding', () => {
    // The editor computes activeGroupCount by filtering `is_active` before
    // calling this — an inactive-only tournament passes activeGroupCount: 0.
    expect(isTeamPrizeGroupLimitReached(true, 0)).toBe(false);
  });
});

describe('teamPrizeGroupLimitHint', () => {
  it('names the reason and the threshold that unlocks more groups', () => {
    const hint = teamPrizeGroupLimitHint(150);
    expect(hint).toContain('150');
    expect(hint).toMatch(/one team prize group/i);
    expect(hint).toMatch(/upgrade/i);
  });
});
