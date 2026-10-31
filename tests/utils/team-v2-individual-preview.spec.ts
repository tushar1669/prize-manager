import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasCompleteInitialTeamV2IndividualPreview as complete } from '../../supabase/functions/_shared/teamV2IndividualPreview.ts';

const ids = ['p1', 'p2', 'p3'];
const preview = {
  winners: [
    { prizeId: 'p1', playerId: 'player-a', reasons: ['eligible'], isManual: false },
    { prizeId: 'p2', playerId: 'player-a', reasons: ['side-prize'], isManual: true },
  ],
  unfilled: [{ prizeId: 'p3', reasonCodes: ['no_eligible_players'] }],
  meta: {
    dryRun: false, hiddenWinnersCount: 0,
    activePrizeCount: 3, winnersCount: 2, unfilledCount: 1,
  },
};
describe('dormant Team v2 first-version individual-engine completeness preflight', () => {
  it('accepts exact winners and genuine unfilled prize coverage, including allowed multi-awards', () => {
    expect(complete(ids, preview)).toBe(true);
    expect(complete(ids, { ...preview, winners: [...preview.winners].reverse() })).toBe(true);
  });

  it('rejects omitted, extra or duplicate individual prizes across winners and unfilled', () => {
    expect(complete(ids, { ...preview, unfilled: [] })).toBe(false);
    expect(complete(ids, { ...preview, winners: [
      ...preview.winners, { ...preview.winners[0], prizeId: 'foreign' },
    ] })).toBe(false);
    expect(complete(ids, { ...preview, unfilled: [
      { prizeId: 'p2', reasonCodes: [] },
    ] })).toBe(false);
    expect(complete([...ids, 'p2'], preview)).toBe(false);
  });

  it('rejects restricted/partial preview metadata or mismatched server counts', () => {
    for (const invalidMeta of [
      { dryRun: true }, { hiddenWinnersCount: 1 },
      { activePrizeCount: 2 }, { winnersCount: 3 }, { unfilledCount: 0 },
    ]) {
      expect(complete(ids, { ...preview, meta: { ...preview.meta, ...invalidMeta } })).toBe(false);
    }
    expect(complete(ids, { ...preview, meta: null })).toBe(false);
  });

  it('rejects malformed rows and zero-winner first-version attempts', () => {
    for (const changed of [
      { playerId: '' }, { prizeId: '' }, { reasons: 'eligible' }, { isManual: 'false' },
    ]) {
      const winners = [{ ...preview.winners[0], ...changed }, preview.winners[1]];
      expect(complete(ids, { ...preview, winners })).toBe(false);
    }
    expect(complete(ids, { ...preview, unfilled: [{ prizeId: 'p3', reasonCodes: null }] })).toBe(false);
    expect(complete(['p3'], {
      winners: [], unfilled: [{ prizeId: 'p3', reasonCodes: [] }],
      meta: { dryRun: false, hiddenWinnersCount: 0, activePrizeCount: 1,
        winnersCount: 0, unfilledCount: 1 },
    })).toBe(false);
  });

  it('keeps the helper unconnected to legacy finalize, draft SQL and browser-supplied winners', () => {
    const finalize = readFileSync('supabase/functions/finalize/index.ts', 'utf8');
    const ruling = readFileSync('supabase/functions/prepareTeamRulingV2/index.ts', 'utf8');
    const allocator = readFileSync('supabase/functions/allocatePrizes/index.ts', 'utf8');
    expect(finalize).not.toContain('hasCompleteInitialTeamV2IndividualPreview(');
    expect(ruling).not.toContain('hasCompleteInitialTeamV2IndividualPreview(');
    expect(ruling).not.toContain('commit_team_v2_adjudicated_version');
    expect(allocator).toContain("const { tournamentId, overrides = [], ruleConfigOverride");
    expect(allocator).toContain("winners: winnersForResponse");
    expect(allocator).toContain("unfilled: unfilledForResponse");
    expect(allocator).toContain("hiddenWinnersCount:");
    expect(allocator).toContain("dryRun");
  });
});
