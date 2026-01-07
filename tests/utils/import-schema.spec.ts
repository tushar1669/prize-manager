import { describe, expect, it } from 'vitest';
import { getNameHeaderCandidates } from '@/utils/importSchema';

describe('getNameHeaderCandidates', () => {
  it('detects Name columns while ignoring headerless columns', () => {
    const headers = ['Rank', 'Name', '__EMPTY', 'Rtg', 'Name (2)'];

    expect(getNameHeaderCandidates(headers)).toEqual(['Name', 'Name (2)']);
  });
});
