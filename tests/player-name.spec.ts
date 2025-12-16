import { describe, expect, it } from 'vitest';
import { getPlayerDisplayName, nameNeedsTruncation } from '../utils/playerName';

describe('getPlayerDisplayName', () => {
  it('returns full name without abbreviation', () => {
    expect(getPlayerDisplayName('Prakhar Tripathi')).toBe('Prakhar Tripathi');
    expect(getPlayerDisplayName('T. Prakhar')).toBe('T. Prakhar');
    expect(getPlayerDisplayName('John Smith Jr.')).toBe('John Smith Jr.');
  });

  it('returns fallback for null/undefined/empty', () => {
    expect(getPlayerDisplayName(null)).toBe('Unknown Player');
    expect(getPlayerDisplayName(undefined)).toBe('Unknown Player');
    expect(getPlayerDisplayName('')).toBe('Unknown Player');
    expect(getPlayerDisplayName('  ')).toBe('Unknown Player');
  });

  it('uses custom fallback when provided', () => {
    expect(getPlayerDisplayName(null, { fallback: 'N/A' })).toBe('N/A');
    expect(getPlayerDisplayName('', { fallback: 'TBD' })).toBe('TBD');
  });

  it('truncates when maxLength is set', () => {
    expect(getPlayerDisplayName('Prakhar Tripathi', { maxLength: 10 })).toBe('Prakhar T…');
    expect(getPlayerDisplayName('Short', { maxLength: 10 })).toBe('Short');
  });

  it('trims whitespace', () => {
    expect(getPlayerDisplayName('  John Smith  ')).toBe('John Smith');
  });
});

describe('nameNeedsTruncation', () => {
  it('returns true when name exceeds maxLength', () => {
    expect(nameNeedsTruncation('Prakhar Tripathi', 10)).toBe(true);
    expect(nameNeedsTruncation('Prakhar Tripathi', 20)).toBe(false);
  });

  it('handles null/undefined', () => {
    expect(nameNeedsTruncation(null, 10)).toBe(false);
    expect(nameNeedsTruncation(undefined, 10)).toBe(false);
  });
});
