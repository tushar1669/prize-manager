import { describe, it, expect } from 'vitest';
import { normalizeName } from './importSchema';
import { applyMergePolicy, scoreCandidate, type DedupIncomingPlayer, type DedupExistingPlayer } from './dedup';

function makeIncoming(overrides: Partial<DedupIncomingPlayer> = {}): DedupIncomingPlayer {
  return {
    _originalIndex: overrides._originalIndex ?? 1,
    name: overrides.name ?? ' Sample   Player ',
    dob: overrides.dob ?? '2001-02-03',
    dob_raw: overrides.dob_raw ?? overrides.dob ?? '2001-02-03',
    rating: overrides.rating ?? 1600,
    fide_id: overrides.fide_id ?? null,
    city: overrides.city ?? null,
    state: overrides.state ?? null,
    club: overrides.club ?? null,
    gender: overrides.gender ?? null,
    disability: overrides.disability ?? null,
    special_notes: overrides.special_notes ?? null,
    federation: overrides.federation ?? null,
  } satisfies DedupIncomingPlayer;
}

function makeExisting(overrides: Partial<DedupExistingPlayer> = {}): DedupExistingPlayer {
  return {
    id: overrides.id ?? 'existing-1',
    name: overrides.name ?? 'Sample Player',
    dob: overrides.dob ?? '2001-02-03',
    rating: overrides.rating ?? 1550,
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

describe('normalizeName', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeName('  Álvaro   DEL  Río  ')).toBe('álvaro del río');
  });
});

describe('scoreCandidate', () => {
  it('rewards fide id, dob, and close ratings', () => {
    const incoming = makeIncoming({ fide_id: '123', rating: 1505 });
    const existing = makeExisting({ fide_id: '123', rating: 1520 });

    const score = scoreCandidate(incoming, existing);

    expect(score).toBeGreaterThan(0.8);
  });

  it('handles partial matches with name normalization', () => {
    const incoming = makeIncoming({ name: 'José   Gómez', dob: null, dob_raw: null, rating: 1800 });
    const existing = makeExisting({ name: 'Jose Gomez', dob: null, rating: 1780 });

    const score = scoreCandidate(incoming, existing);

    expect(score).toBeCloseTo(0.55, 2);
  });
});

describe('applyMergePolicy', () => {
  it('only fills missing fields when fillBlanks is true', () => {
    const incoming = makeIncoming({ city: 'New City', state: 'CA' });
    const existing = makeExisting({ city: null, state: 'CA' });

    const result = applyMergePolicy(incoming, existing, {
      fillBlanks: true,
      preferNewerRating: true,
      neverOverwriteDob: true,
    });

    expect(result.changedFields).toEqual(['city']);
    expect(result.changes).toMatchObject({ city: 'New City' });
  });

  it('overrides conflicting values when fillBlanks is false', () => {
    const incoming = makeIncoming({ city: 'New City' });
    const existing = makeExisting({ city: 'Old City' });

    const result = applyMergePolicy(incoming, existing, {
      fillBlanks: false,
      preferNewerRating: true,
      neverOverwriteDob: true,
    });

    expect(result.changedFields).toEqual(['city']);
    expect(result.changes).toMatchObject({ city: 'New City' });
  });

  it('honours rating and dob preferences', () => {
    const incoming = makeIncoming({ rating: 1700, dob: '2001-02-03', dob_raw: '2001-02-03' });
    const existing = makeExisting({ rating: 1650, dob: '2001-02-03' });

    const result = applyMergePolicy(incoming, existing, {
      fillBlanks: true,
      preferNewerRating: false,
      neverOverwriteDob: true,
    });

    expect(result.changedFields).toEqual([]);

    const withRating = applyMergePolicy(incoming, existing, {
      fillBlanks: true,
      preferNewerRating: true,
      neverOverwriteDob: true,
    });

    expect(withRating.changedFields).toContain('rating');

    const allowDob = applyMergePolicy(incoming, existing, {
      fillBlanks: true,
      preferNewerRating: true,
      neverOverwriteDob: false,
    });

    expect(allowDob.changedFields).toContain('dob');
    expect(allowDob.changes).toMatchObject({ dob: '2001-02-03', dob_raw: '2001-02-03' });
  });
});
