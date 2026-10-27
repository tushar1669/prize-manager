import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * DRAFT SQL contract checks only. They do not execute PostgreSQL or certify
 * atomicity, authorization, deadlock safety, or production deployability.
 * Those require an isolated DB integration run before any release approval.
 */
const file = 'supabase/migrations/20261027080000_team_v2_adjudicated_atomic_version.sql';
const sql = readFileSync(file, 'utf8');
const live = sql
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n');

describe('Team Ranking v2 draft atomic new-version DB writer', () => {
  it('is dormant and service-role only, with SQL caller privilege restricted', () => {
    expect(live).toContain('SECURITY INVOKER');
    expect(live).toContain("SET search_path = ''");
    expect(live).toContain("current_user <> 'service_role'");
    expect(live).toMatch(/REVOKE EXECUTE ON FUNCTION public\.commit_team_v2_adjudicated_version\([\s\S]*?\) FROM PUBLIC, anon, authenticated/);
    expect(live).toMatch(/GRANT EXECUTE ON FUNCTION public\.commit_team_v2_adjudicated_version\([\s\S]*?\) TO service_role/);
    expect(live).not.toContain('SECURITY DEFINER');
  });

  it('validates owner/master, then locks the tournament and checks the latest version', () => {
    expect(live).toContain('FROM public.tournaments');
    expect(live).toContain('FOR UPDATE');
    expect(live).toContain('v_owner = p_actor_id');
    expect(live).toContain("public.has_role(p_actor_id, 'master'::public.app_role)");
    expect(live).toContain('v_latest <> p_expected_version');
    expect(live).toContain('v_new := v_latest + 1');
    expect(live).toContain('team_v2_stale_allocation_version');
  });

  it('handles the first finalized version even when no base allocation exists', () => {
    expect(live).toMatch(/IF v_latest = 0 THEN[\s\S]*?jsonb_array_length\(p_individual_rows\) = 0/);
    expect(live).toContain('FROM jsonb_to_recordset(p_individual_rows)');
    expect(live).toContain('LEFT JOIN public.categories cat ON cat.id = pz.category_id');
    expect(live).toContain('cat.tournament_id IS DISTINCT FROM p_tournament_id');
    expect(live).toContain('pl.tournament_id IS DISTINCT FROM p_tournament_id');
  });

  it('clones unchanged individual allocations on an existing version', () => {
    expect(live).toContain('team_v2_missing_individual_baseline');
    expect(live).toMatch(/SELECT tournament_id, v_new, prize_id, player_id, reason_codes,[\s\S]*?FROM public\.allocations\s+WHERE tournament_id = p_tournament_id AND version = v_latest/);
    expect(live).toContain('team_v2_previous_winner_changed');
    expect(live).not.toMatch(/\bDELETE\s+FROM\s+public\.(?:allocations|team_allocations)\b/i);
    expect(live).not.toMatch(/\bUPDATE\s+public\.(?:allocations|team_allocations|publications)\b/i);
  });

  it('requires source-matched team award, selected player snapshot and signed ruling references', () => {
    expect(live).toContain("j.ranking_snapshot ->> 'schema_version' <> '2'");
    expect(live).toContain("j.ranking_snapshot ->> 'winner_key' IS DISTINCT FROM j.institution_key");
    expect(live).toContain('p.place IS DISTINCT FROM j.place');
    expect(live).toContain('jsonb_array_length(j.player_snapshot) <> cardinality(j.player_ids)');
    expect(live).toContain('team_v2_unreferenced_ruling');
    expect(live).toContain("v_ruling ->> 'actor_id' IS DISTINCT FROM p_actor_id::text");
    expect(live).toContain("v_ruling ->> 'arbiter_decision_reference'");
    expect(live).toContain('team_v2_ruling_award_mismatch');
  });

  it('makes individual and team snapshots one statement and fails closed on partial team insertion', () => {
    expect(live).toContain('INSERT INTO public.allocations');
    expect(live).toContain('INSERT INTO public.team_allocations');
    expect(live).toContain('GET DIAGNOSTICS v_inserted = ROW_COUNT');
    expect(live).toContain('RAISE EXCEPTION');
    expect(live).toContain('team_v2_team_write_incomplete');
    expect(live).not.toMatch(/\bCOMMIT\s*;/i);
    expect(live).not.toMatch(/\bROLLBACK\s*;/i);
  });


  it('rejects inactive or duplicate initial individual prize submissions', () => {
    expect(live).toContain('team_v2_duplicate_initial_prize');
    expect(live).toContain('GROUP BY j.prize_id HAVING COUNT(*) > 1');
    expect(live).toContain('cat.is_active IS DISTINCT FROM true');
    expect(live).toContain('pz.is_active IS DISTINCT FROM true');
  });

  it('guards current team rules, distinct selected K, membership, snapshot and points', () => {
    for (const clause of [
      "j.ranking_snapshot -> 'declared_rules' IS DISTINCT FROM g.ranking_rules",
      "j.ranking_snapshot -> 'group_rule' IS DISTINCT FROM jsonb_build_object(",
      "j.ranking_snapshot ->> 'allocation_version' IS DISTINCT FROM v_new::text",
      'cardinality(j.player_ids) IS DISTINCT FROM g.team_size',
      "COUNT(DISTINCT snap.value ->> 'player_id')",
      'pl.tournament_id IS DISTINCT FROM p_tournament_id',
      "WHEN 'group_label' THEN pl.group_label",
      "snap.value ->> 'player_id' = selected.id::text",
      "(snap.value ->> 'points')::numeric IS NOT DISTINCT FROM pl.points",
      'SELECT SUM(pl.points) FROM public.players pl',
      'team_v2_invalid_team_roster_or_scores',
    ]) expect(live).toContain(clause);
  });

  it('rejects duplicate team awards and ruling places outside the cited affected places', () => {
    expect(live).toContain('team_v2_duplicate_team_award');
    expect(live).toContain('GROUP BY j.group_id, j.place HAVING COUNT(*) > 1');
    expect(live).toContain('GROUP BY j.group_id, j.institution_key HAVING COUNT(*) > 1');
    expect(live).toContain("g.ranking_rules ->> 'published_reference'");
    expect(live).toContain('team_v2_invalid_ruling_places');
    expect(live).toContain("ap.value = a.value -> 'place'");
  });

  it('detects a removed critical static guard (negative-control only)', () => {
    for (const clause of [
      "j.ranking_snapshot -> 'declared_rules' IS DISTINCT FROM g.ranking_rules",
      'cardinality(j.player_ids) IS DISTINCT FROM g.team_size',
      'team_v2_invalid_team_roster_or_scores',
    ]) {
      expect(live.includes(clause)).toBe(true);
      expect(live.replace(clause, '').includes(clause)).toBe(false);
    }
    // This is not an isolated PostgreSQL transaction or privilege test.
  });

  it('is not yet wired to any old in-place legacy RPC or protected finalization writer', () => {
    const finalize = readFileSync('supabase/functions/finalize/index.ts', 'utf8');
    const dialog = readFileSync('src/components/allocation/TeamTieBreakDialog.tsx', 'utf8');
    expect(finalize).not.toContain("commit_team_v2_adjudicated_version");
    expect(dialog).not.toContain("commit_team_v2_adjudicated_version");
    expect(live).not.toMatch(/\bresolve_team_tie\s*\(/);
  });
});
