import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('finalize writes team prizes through the usual route', () => {
  it('computes team prizes after the access check and before any allocation write', () => {
    const source = readFileSync('supabase/functions/finalize/index.ts', 'utf8');
    const ownerGate = source.indexOf('tournamentAccess.owner_id !== user.id && !isMaster');
    const allocate = source.indexOf("functions.invoke('allocateInstitutionPrizes'");
    const write = source.indexOf(".from('allocations')\n      .insert(allocationsToInsert)");
    expect(source).not.toContain('isTeamV2Tournament');
    expect(ownerGate).toBeGreaterThan(-1);
    expect(allocate).toBeGreaterThan(ownerGate);
    expect(write).toBeGreaterThan(allocate);
    expect(source).not.toContain(".rpc('commit_team_v2_adjudicated_version'");
  });

  it("finalize stores the scorer's ranking snapshot on every team row", () => {
    const source = readFileSync('supabase/functions/finalize/index.ts', 'utf8');
    const rows = source.slice(source.indexOf('const rows = teamGroups.flatMap'), source.indexOf(".from('team_allocations')\n          .insert(rows)"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows).toContain('ranking_snapshot: prize.winner_institution!.ranking_snapshot ?? null');
  });
});
