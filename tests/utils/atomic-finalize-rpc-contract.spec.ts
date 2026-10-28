import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Source-only contract checks. They NEVER run SQL or prove Postgres
 * transactional rollback, role privileges, concurrency or recovery.
 */
const path = 'supabase/migrations/20261027100000_finalize_atomic_version_candidate.sql';
const sql = readFileSync(path, 'utf8');
const live = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
const adjudicatedWriter = readFileSync(
  'supabase/migrations/20261027080000_team_v2_adjudicated_atomic_version.sql',
  'utf8',
);
const finalize = readFileSync('supabase/functions/finalize/index.ts', 'utf8');

describe('dormant atomic legacy finalization writer source', () => {
  it('is invoker-only, grants execute to service_role and is not callable from finalize', () => {
    expect(live).toContain('CREATE FUNCTION public.commit_finalize_version_atomic(');
    expect(live).toContain('SECURITY INVOKER');
    expect(live).toContain("SET search_path = ''");
    expect(live).toContain("current_user <> 'service_role'");
    expect(live).toMatch(/REVOKE EXECUTE ON FUNCTION public\.commit_finalize_version_atomic\([\s\S]*?FROM PUBLIC, anon, authenticated/);
    expect(live).toMatch(/GRANT EXECUTE ON FUNCTION public\.commit_finalize_version_atomic\([\s\S]*?TO service_role/);
    expect(live).not.toContain('SECURITY DEFINER');
    expect(finalize).not.toContain('commit_finalize_version_atomic');
  });

  it('uses the exact tournament-row lock shared by the v2 writer before both latest-version reads', () => {
    const lock = 'FROM public.tournaments\n    WHERE id = p_tournament_id FOR UPDATE;';
    expect(live).toContain(lock);
    expect(adjudicatedWriter).toMatch(/FROM public\.tournaments\s+WHERE id = p_tournament_id\s+FOR UPDATE/);
    expect(live.indexOf('SELECT GREATEST(')).toBeGreaterThan(live.indexOf(lock));
    expect(live).toContain('MAX(version) FROM public.allocations');
    expect(live).toContain('MAX(version) FROM public.team_allocations');
    expect(live).toContain('v_latest <> p_expected_version');
    expect(live).toContain('v_new := v_latest + 1');
    expect(live).toContain("public.has_role(p_actor_id, 'master'::public.app_role)");
  });

  it('refuses configured Team Ranking v2 before monetary allocations', () => {
    const gate = 'AND ranking_rules IS NOT NULL';
    expect(live).toContain(gate);
    expect(live).toContain('finalize_atomic_v2_requires_adjudication');
    expect(live.indexOf(gate)).toBeLessThan(live.indexOf('INSERT INTO public.allocations'));
    expect(live).not.toContain('resolve_team_tie(');
  });

  it('enforces active individual prizes, unique awards and server-owned roster properties', () => {
    const clauses = [
      'c.tournament_id IS DISTINCT FROM p_tournament_id',
      'p.is_active IS DISTINCT FROM true',
      'pl.tournament_id IS DISTINCT FROM p_tournament_id',
      'GROUP BY j.prize_id HAVING count(*) > 1',
      'p.group_id IS DISTINCT FROM g.id',
      'p.place IS DISTINCT FROM j.place',
      'cardinality(j.player_ids) IS DISTINCT FROM g.team_size',
      'count(DISTINCT chosen.id)',
      "count(DISTINCT snap.value ->> 'player_id')",
      "snap.value ->> 'player_id' = chosen.id::text",
      'j.total_points IS DISTINCT FROM',
      "j.ranking_snapshot -> 'group_rule' IS DISTINCT FROM jsonb_build_object(",
      "j.ranking_snapshot -> 'award' IS DISTINCT FROM jsonb_build_object(",
      "j.ranking_snapshot -> 'declared_rules' IS DISTINCT FROM 'null'::jsonb",
    ];
    for (const clause of clauses) {
      expect(live).toContain(clause);
      expect(live.indexOf(clause)).toBeLessThan(live.indexOf('INSERT INTO public.allocations'));
    }
  });

  it('writes one shared new version and status atomically without touching old allocations or publication pins', () => {
    expect(live).toContain('INSERT INTO public.allocations');
    expect(live).toContain('INSERT INTO public.team_allocations');
    expect(live).toContain('GET DIAGNOSTICS v_written = ROW_COUNT');
    expect(live).toContain('finalize_atomic_individual_write_incomplete');
    expect(live).toContain('finalize_atomic_team_write_incomplete');
    expect(live).toContain('UPDATE public.tournaments SET updated_at = now()');
    expect(live).toContain('UPDATE public.conflicts SET status =');
    expect(live).not.toMatch(/\b(?:DELETE FROM|UPDATE)\s+public\.(?:allocations|team_allocations|publications)\b/i);
    expect(live).not.toMatch(/\b(?:COMMIT|ROLLBACK)\s*;/i);
  });

  it('negative source control detects removed lock, stale-version check or v2 fence', () => {
    for (const critical of [
      'WHERE id = p_tournament_id FOR UPDATE;',
      'v_latest <> p_expected_version',
      'AND ranking_rules IS NOT NULL',
      "current_user <> 'service_role'",
    ]) {
      expect(live.includes(critical)).toBe(true);
      expect(live.replace(critical, '').includes(critical)).toBe(false);
    }
  });
});
