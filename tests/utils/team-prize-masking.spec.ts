import { describe, expect, it } from 'vitest';
import { selectVisibleTeamPrizes, type PlacedPrize } from '@/utils/teamPrizeMasking';

/**
 * TC1.6-C. `selectVisibleTeamPrizes` is the deliberate INVERSE of the
 * individual masking rule (`src/utils/reviewAccess.ts`, unchanged this week):
 * individual masking previews the top and hides the bottom; team masking
 * hides the top placing(s) — 1st is NEVER revealed — and shows 2nd downward.
 * Organizer preview surfaces only; PublicTeamPrizesSection never calls this
 * with `hasFullAccess: false`.
 */
describe('selectVisibleTeamPrizes', () => {
  const prizes: PlacedPrize[] = [
    { id: 'p1', place: 1 },
    { id: 'p2', place: 2 },
    { id: 'p3', place: 3 },
  ];

  it('reveals everything when the viewer has full access', () => {
    const result = selectVisibleTeamPrizes(prizes, true);
    expect(result.visible).toEqual(prizes);
    expect(result.hidden).toEqual([]);
  });

  it('hides only 1st place when access is restricted', () => {
    const result = selectVisibleTeamPrizes(prizes, false);
    expect(result.visible.map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(result.hidden.map((p) => p.id)).toEqual(['p1']);
  });

  it('never reveals 1st place even when it is the only prize configured', () => {
    const result = selectVisibleTeamPrizes([{ id: 'only', place: 1 }], false);
    expect(result.visible).toEqual([]);
    expect(result.hidden.map((p) => p.id)).toEqual(['only']);
  });

  it('reveals every placing when there is no 1st place to hide', () => {
    const result = selectVisibleTeamPrizes(
      [{ id: 'p2', place: 2 }, { id: 'p3', place: 3 }],
      false
    );
    expect(result.visible.map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(result.hidden).toEqual([]);
  });

  it('hides every tie on 1st place rather than revealing all but one', () => {
    const tied: PlacedPrize[] = [
      { id: 'a', place: 1 },
      { id: 'b', place: 1 },
      { id: 'c', place: 2 },
    ];
    const result = selectVisibleTeamPrizes(tied, false);
    expect(result.hidden.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(result.visible.map((p) => p.id)).toEqual(['c']);
  });

  it('returns an empty result for an empty input regardless of access', () => {
    expect(selectVisibleTeamPrizes([], true)).toEqual({ visible: [], hidden: [] });
    expect(selectVisibleTeamPrizes([], false)).toEqual({ visible: [], hidden: [] });
  });
});
