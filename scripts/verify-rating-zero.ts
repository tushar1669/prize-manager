import { normalizeRating, inferUnrated } from '../src/utils/valueNormalizers.ts';
import { buildSupabasePlayerPayload } from '../src/utils/playerImportPayload.ts';

type MinimalPlayer = Parameters<typeof buildSupabasePlayerPayload>[0];

const rawPlayer: MinimalPlayer = {
  _originalIndex: 1,
  rank: 12,
  sno: 77,
  name: 'Fixture Zero Rated',
  rating: normalizeRating(0),
  fide_id: null,
  federation: null,
  unrated: false,
};

const normalizedUnrated = inferUnrated(
  { rating: rawPlayer.rating, fide_id: rawPlayer.fide_id, unrated: undefined },
  { treatEmptyAsUnrated: true, inferFromMissingRating: true },
);

rawPlayer.unrated = normalizedUnrated;

const payload = buildSupabasePlayerPayload(rawPlayer, 'test-tournament');

console.log('[import.test] replace-mode normalized payload', {
  replaceExisting: true,
  player: payload,
});
