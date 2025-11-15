import { describe, expect, it } from 'vitest';
import { normalizeRating, inferUnrated } from '@/utils/valueNormalizers';
import {
  buildSupabasePlayerPayload,
  type ParsedPlayer,
} from '@/utils/playerImportPayload';

const makeBasePlayer = (): ParsedPlayer => ({
  _originalIndex: 1,
  rank: 1,
  sno: 101,
  name: 'Zero Rated Player',
  rating: null,
  fide_id: null,
  federation: null,
  unrated: true,
});

describe('normalizeRating', () => {
  it('returns null when value is 0 or less', () => {
    expect(normalizeRating(0)).toBeNull();
    expect(normalizeRating('0')).toBeNull();
    expect(normalizeRating(-5)).toBeNull();
  });

  it('returns rounded number for valid ratings', () => {
    expect(normalizeRating('1,523')).toBe(1523);
    expect(normalizeRating(' 1800 ')).toBe(1800);
  });
});

describe('inferUnrated + PlayerImport payload', () => {
  it('defaults unrated to true when rating is null', () => {
    const inferred = inferUnrated(
      { rating: null, fide_id: null, unrated: undefined },
      {
        treatEmptyAsUnrated: true,
        inferFromMissingRating: true,
      },
    );

    expect(inferred).toBe(true);
  });

  it('builds replace-mode payload with rating=null and unrated=true for zero-rated players', () => {
    const rawRating = 0;
    const normalizedRating = normalizeRating(rawRating);
    expect(normalizedRating).toBeNull();

    const player: ParsedPlayer = {
      ...makeBasePlayer(),
      rating: normalizedRating,
    };

    const inferred = inferUnrated(
      { rating: player.rating, fide_id: player.fide_id, unrated: undefined },
      {
        treatEmptyAsUnrated: true,
        inferFromMissingRating: true,
      },
    );

    player.unrated = inferred;

    const payload = buildSupabasePlayerPayload(player, 'test-tournament');

    expect(payload.rating).toBeNull();
    expect(payload.unrated).toBe(true);

    console.log('[import.test] replace-mode normalized payload', {
      replaceExisting: true,
      player: payload,
    });
  });
});
