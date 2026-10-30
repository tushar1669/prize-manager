import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const epoch = readFileSync(
  'supabase/migrations/20261027110000_team_v2_source_epoch.sql', 'utf8',
);
const atomic = readFileSync(
  'supabase/migrations/20261027080000_team_v2_adjudicated_atomic_version.sql', 'utf8',
);

describe('Team v2 draft source mutation lineage (separate, restricted SQL)', () => {
  it('keeps the monetary writer and source digest invoker-only', () => {
    expect(atomic).not.toContain('SECURITY DEFINER');
    expect(atomic).toContain('SECURITY INVOKER');
    expect(atomic).not.toContain('team_v2_record_source_change');
  });

  it('protects the narrow source trigger with restricted privileges and search path', () => {
    expect(epoch).toContain('CREATE FUNCTION public.team_v2_record_source_change()');
    expect(epoch).toContain("SECURITY DEFINER SET search_path = ''");
    expect(epoch).toContain(
      'REVOKE EXECUTE ON FUNCTION public.team_v2_record_source_change()',
    );
    expect(epoch).toContain('FROM PUBLIC, anon, authenticated');
    expect(epoch).not.toMatch(/GRANT EXECUTE[\s\S]*TO (anon|authenticated)/);
    expect(epoch).not.toMatch(/^\s*(DROP TABLE|TRUNCATE|DELETE FROM)\b/m);
  });

  it('captures insert/update/delete on every scorer-source table, not saved allocations', () => {
    for (const table of [
      'categories', 'prizes', 'players', 'rule_config',
      'institution_prize_groups', 'institution_prizes',
    ]) {
      expect(epoch).toContain(`AFTER INSERT OR UPDATE OR DELETE ON public.${table}`);
    }
    expect(epoch).not.toContain('ON public.allocations');
    expect(epoch).not.toContain('ON public.team_allocations');
    expect(epoch).toContain('UPDATE public.tournaments');
    expect(epoch).toContain('ORDER BY v.tournament_id');
  });
});
