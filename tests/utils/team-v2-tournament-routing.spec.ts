import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isTeamV2Tournament } from '../../supabase/functions/_shared/teamV2Tournament';

// Fake service-role client: one canary row set and one V2-history row set.
function db(opts: { enrolled?: unknown[] | null; history?: unknown[] | null; failEnrolled?: boolean; failHistory?: boolean }) {
  const result = (rows: unknown[] | null | undefined, fail?: boolean) =>
    Promise.resolve(fail ? { data: null, error: { message: 'boom' } } : { data: rows ?? [], error: null });
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          limit: () => result(table === 'team_v2_canary_tournaments' ? opts.enrolled : opts.history,
            table === 'team_v2_canary_tournaments' ? opts.failEnrolled : opts.failHistory),
          not: () => ({ limit: () => result(opts.history, opts.failHistory) }),
        }),
      }),
    }),
  } as never;
}

describe('Team V2 applies only to Team V2 tournaments (same rule as the database fence)', () => {
  it('standard tournament: not enrolled and no V2 history', async () => {
    expect(await isTeamV2Tournament(db({}), 't')).toBe(false);
  });
  it('enrolled in the V2 list (enabled or not) is V2', async () => {
    expect(await isTeamV2Tournament(db({ enrolled: [{ tournament_id: 't' }] }), 't')).toBe(true);
  });
  it('a saved V2 award makes it V2 even if the list entry was removed', async () => {
    expect(await isTeamV2Tournament(db({ history: [{ id: 'x' }] }), 't')).toBe(true);
  });
  it('a failed check is reported as unknown, so callers fail closed', async () => {
    expect(await isTeamV2Tournament(db({ failEnrolled: true }), 't')).toBeNull();
    expect(await isTeamV2Tournament(db({ failHistory: true }), 't')).toBeNull();
  });
  it('the database fence uses the same two conditions', () => {
    const sql = readFileSync('supabase/migrations/20261027080000_team_v2_adjudicated_atomic_version.sql', 'utf8');
    expect(sql).toContain('FROM public.team_v2_canary_tournaments marker');
    expect(sql).toContain('history.ranking_snapshot IS NOT NULL');
  });
  it('the team allocator ranks every tournament with Team V2 steps', () => {
    const source = readFileSync('supabase/functions/allocateInstitutionPrizes/index.ts', 'utf8');
    expect(source).toContain('const useTeamV2Ranking = true;');
    expect(source).not.toContain('isTeamV2Tournament(');
    expect(source).toContain(': scoredInstitutions[placeIndex] ?? null;');
    expect(source).toContain('...(useTeamV2Ranking ? {');
  });
});
