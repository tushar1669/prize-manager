import { describe, expect, it } from 'vitest';
import { getNameHeaderCandidates } from '@/utils/importSchema';
import { withUniqueHeaders } from '@/utils/sheetDetection';

describe('getNameHeaderCandidates', () => {
  it('detects Name columns while ignoring headerless columns', () => {
    const headers = ['Rank', 'Name', '__EMPTY', 'Rtg', 'Name (2)'];

    expect(getNameHeaderCandidates(headers)).toEqual(['Name', 'Name (2)']);
  });

  it('handles Name (2) style suffixes from withUniqueHeaders', () => {
    const headers = ['Rank', 'Name', 'Name (2)', 'Rtg'];
    const candidates = getNameHeaderCandidates(headers);

    expect(candidates).toEqual(['Name', 'Name (2)']);
  });
});

describe('withUniqueHeaders', () => {
  it('deduplicates duplicate Name headers', () => {
    const rawRow = ['Rank', 'Name', '', 'Name', 'Rtg'];
    const result = withUniqueHeaders(rawRow);

    expect(result).toEqual(['Rank', 'Name', '__EMPTY_COL_2', 'Name (2)', 'Rtg']);
  });

  it('handles multiple duplicates with (2), (3), etc.', () => {
    const rawRow = ['Name', 'Name', 'Name', 'Rank'];
    const result = withUniqueHeaders(rawRow);

    expect(result).toEqual(['Name', 'Name (2)', 'Name (3)', 'Rank']);
  });

  it('replaces empty cells with __EMPTY_COL_X placeholders', () => {
    const rawRow = ['Rank', '', 'Name', null, 'Rtg'];
    const result = withUniqueHeaders(rawRow);

    expect(result).toEqual(['Rank', '__EMPTY_COL_1', 'Name', '__EMPTY_COL_3', 'Rtg']);
  });
});
