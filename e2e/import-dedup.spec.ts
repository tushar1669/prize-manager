import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  runDedupPass,
  type DedupIncomingPlayer,
  type DedupExistingPlayer,
  type MergePolicy,
} from '../src/utils/dedup';

function createStubClient(matchMap: Record<number, DedupExistingPlayer[]>): SupabaseClient {
  return {
    rpc: async (_fn: string, _payload: Record<string, unknown>) => {
      const rows = Object.entries(matchMap).flatMap(([row, matches]) =>
        matches.map(match => ({
          cand_idx: Number(row),
          player_id: match.id,
          name: match.name,
          dob: match.dob ?? null,
          rating: match.rating ?? null,
          fide_id: match.fide_id ?? null,
          city: match.city ?? null,
          state: match.state ?? null,
          club: match.club ?? null,
          gender: match.gender ?? null,
          disability: match.disability ?? null,
          special_notes: match.special_notes ?? null,
          federation: match.federation ?? null,
        })),
      );

      return { data: rows, error: null } as { data: unknown; error: null };
    },
  } as unknown as SupabaseClient;
}

function createStubClientFromData(
  data: unknown,
  onCall?: () => void,
): SupabaseClient {
  return {
    rpc: async (_fn: string, _payload: Record<string, unknown>) => {
      onCall?.();
      return { data, error: null } as { data: unknown; error: null };
    },
  } as unknown as SupabaseClient;
}

function buildIncoming(overrides: Partial<DedupIncomingPlayer> = {}): DedupIncomingPlayer {
  return {
    _originalIndex: overrides._originalIndex ?? 1,
    name: overrides.name ?? 'Test Player',
    dob: overrides.dob ?? '2000-01-01',
    dob_raw: overrides.dob_raw ?? overrides.dob ?? '2000-01-01',
    rating: overrides.rating ?? 1200,
    fide_id: overrides.fide_id ?? null,
    ...overrides,
  } satisfies DedupIncomingPlayer;
}

function buildExisting(overrides: Partial<DedupExistingPlayer> = {}): DedupExistingPlayer {
  return {
    id: overrides.id ?? 'existing-1',
    name: overrides.name ?? 'Test Player',
    dob: overrides.dob ?? '2000-01-01',
    rating: overrides.rating ?? 1200,
    fide_id: overrides.fide_id ?? null,
    city: overrides.city ?? null,
    state: overrides.state ?? null,
    club: overrides.club ?? null,
    gender: overrides.gender ?? null,
    disability: overrides.disability ?? null,
    special_notes: overrides.special_notes ?? null,
    federation: overrides.federation ?? null,
  } satisfies DedupExistingPlayer;
}

test.describe('Import deduplication heuristics', () => {
  test('treats an identical re-import as a skip by default', async () => {
    const incoming = [buildIncoming({ _originalIndex: 1 })];
    const existing = buildExisting({ id: 'player-1' });
    const client = createStubClient({ 1: [existing] });

    const result = await runDedupPass({
      client,
      tournamentId: 'stub',
      incomingPlayers: incoming,
    });

    expect(result.summary.defaultSkips).toBe(1);
    expect(result.decisions).toEqual([
      {
        row: 1,
        action: 'skip',
        existingId: 'player-1',
      },
    ]);
  });

  test('prioritises FIDE, name + DOB, then fuzzy name matches', async () => {
    const fideMatchIncoming = buildIncoming({ _originalIndex: 1, fide_id: '123456' });
    const fideMatchExisting = buildExisting({ id: 'existing-fide', fide_id: '123456' });

    const dobMatchIncoming = buildIncoming({
      _originalIndex: 2,
      name: 'Jane Smith',
      dob: '1995-05-10',
      dob_raw: '1995-05-10',
      rating: 1350,
    });
    const dobMatchExisting = buildExisting({
      id: 'existing-dob',
      name: 'Jane   Smith',
      dob: '1995-05-10',
      rating: 1380,
    });

    const fuzzyIncoming = buildIncoming({
      _originalIndex: 3,
      name: 'Jose Alvarez',
      dob: null,
      dob_raw: null,
      fide_id: null,
      rating: 1450,
    });
    const fuzzyExisting = buildExisting({
      id: 'existing-fuzzy',
      name: 'José   Alvarez',
      dob: null,
      rating: 1460,
    });

    const client = createStubClient({
      1: [fideMatchExisting],
      2: [dobMatchExisting],
      3: [fuzzyExisting],
    });

    const result = await runDedupPass({
      client,
      tournamentId: 'stub',
      incomingPlayers: [fideMatchIncoming, dobMatchIncoming, fuzzyIncoming],
    });

    const [fideCandidate, dobCandidate, fuzzyCandidate] = result.candidates;

    expect(fideCandidate.bestMatch?.reason).toBe('Matched on FIDE ID');
    expect(dobCandidate.bestMatch?.reason).toBe('Matched on name + DOB');
    expect(fuzzyCandidate.bestMatch?.reason).toBe('Matched on normalized name');
    expect(fuzzyCandidate.bestMatch?.score).toBeGreaterThanOrEqual(result.summary.scoreThreshold);
  });

  test('respects merge policy toggles when selecting default actions', async () => {
    const incoming = buildIncoming({
      _originalIndex: 1,
      rating: 1500,
      city: 'New City',
    });

    const existing = buildExisting({
      id: 'existing-policy',
      rating: 1400,
      city: 'Old City',
    });

    const client = createStubClient({ 1: [existing] });

    const aggressivePolicy: MergePolicy = {
      fillBlanks: false,
      preferNewerRating: true,
      neverOverwriteDob: true,
    };

    const conservativePolicy: MergePolicy = {
      fillBlanks: true,
      preferNewerRating: false,
      neverOverwriteDob: true,
    };

    const aggressive = await runDedupPass({
      client,
      tournamentId: 'stub',
      incomingPlayers: [incoming],
      mergePolicy: aggressivePolicy,
    });

    expect(aggressive.candidates[0].bestMatch?.merge.changedFields).toEqual(['rating', 'city']);
    expect(aggressive.decisions[0]).toMatchObject({ action: 'update', existingId: 'existing-policy' });

    const conservative = await runDedupPass({
      client,
      tournamentId: 'stub',
      incomingPlayers: [incoming],
      mergePolicy: conservativePolicy,
    });

    expect(conservative.candidates[0].bestMatch?.merge.changedFields).toEqual([]);
    expect(conservative.decisions[0]).toMatchObject({ action: 'skip', existingId: 'existing-policy' });
  });

  test('treats summary-only RPC payloads as no matches without warnings', async () => {
    const incoming = [buildIncoming({ _originalIndex: 1 })];
    const client = createStubClientFromData({ status: 'ok', total: 0 });

    const result = await runDedupPass({
      client,
      tournamentId: 'stub',
      incomingPlayers: incoming,
    });

    expect(result.summary.defaultCreates).toBe(1);
    expect(result.candidates[0].matches).toEqual([]);
  });

  test('skips RPC work entirely when replaceExisting is enabled', async () => {
    const incoming = [buildIncoming({ _originalIndex: 5 })];
    let rpcCalls = 0;
    const client = createStubClientFromData(
      [{ row: 5, matches: [buildExisting({ id: 'should-not-be-used' })] }],
      () => {
        rpcCalls += 1;
      },
    );

    const result = await runDedupPass({
      client,
      tournamentId: 'stub',
      incomingPlayers: incoming,
      replaceExisting: true,
    });

    expect(rpcCalls).toBe(0);
    expect(result.summary).toMatchObject({
      totalCandidates: 1,
      matchedCandidates: 0,
      defaultCreates: 1,
      defaultUpdates: 0,
      defaultSkips: 0,
    });
    expect(result.decisions).toEqual([{ row: 5, action: 'create' }]);
    expect(result.candidates[0].matches).toEqual([]);
  });

  test('replace mode always yields create-only decisions, even when existing players match', async () => {
    const incoming = [
      buildIncoming({ _originalIndex: 3, fide_id: '321321' }),
      buildIncoming({
        _originalIndex: 4,
        name: 'Existing Person',
        dob: '1990-02-02',
        dob_raw: '1990-02-02',
        rating: 1450,
      }),
    ];

    const existing = [
      buildExisting({ id: 'existing-fide', fide_id: '321321', rating: 1470 }),
      buildExisting({ id: 'existing-dob', name: 'Existing Person', dob: '1990-02-02', rating: 1500 }),
    ];

    const client = createStubClient({
      3: [existing[0]],
      4: [existing[1]],
    });

    const result = await runDedupPass({
      client,
      tournamentId: 'stub',
      incomingPlayers: incoming,
      existingPlayers: existing,
      replaceExisting: true,
    });

    expect(result.decisions).toEqual([
      { row: 3, action: 'create' },
      { row: 4, action: 'create' },
    ]);
    expect(result.summary).toMatchObject({ matchedCandidates: 0, defaultCreates: 2 });
    result.candidates.forEach(candidate => {
      expect(candidate.matches).toEqual([]);
      expect(candidate.bestMatch).toBeUndefined();
      expect(candidate.defaultAction).toBe('create');
    });
  });

  test('append mode still surfaces dedup candidates when matches exist', async () => {
    const incoming = [
      buildIncoming({ _originalIndex: 10, fide_id: '999999' }),
      buildIncoming({
        _originalIndex: 11,
        name: 'Duplicate Name',
        dob: '1988-03-03',
        dob_raw: '1988-03-03',
      }),
    ];

    const existing = [
      buildExisting({ id: 'existing-fide', fide_id: '999999', rating: 1500 }),
      buildExisting({ id: 'existing-dob', name: 'Duplicate Name', dob: '1988-03-03' }),
    ];

    let rpcCalls = 0;
    const client = createStubClientFromData([], () => {
      rpcCalls += 1;
    });

    const result = await runDedupPass({
      client,
      tournamentId: 'stub',
      incomingPlayers: incoming,
      existingPlayers: existing,
    });

    expect(rpcCalls).toBe(1);
    expect(result.summary.matchedCandidates).toBe(2);
    expect(result.summary.defaultCreates).toBe(0);
    expect(result.summary.defaultSkips).toBe(2);

    const [fideCandidate, dobCandidate] = result.candidates;
    expect(fideCandidate.bestMatch?.existing.id).toBe('existing-fide');
    expect(fideCandidate.bestMatch?.reason).toBe('Matched on FIDE ID');
    expect(dobCandidate.bestMatch?.existing.id).toBe('existing-dob');
    expect(dobCandidate.bestMatch?.reason).toBe('Matched on name + DOB');
  });
});
