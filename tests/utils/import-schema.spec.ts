import { describe, expect, it } from 'vitest';
import { getNameHeaderCandidates, extractRuleUsedFields } from '@/utils/importSchema';
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

describe('extractRuleUsedFields', () => {
  it('returns empty set when no categories provided', () => {
    expect(extractRuleUsedFields(null)).toEqual(new Set());
    expect(extractRuleUsedFields(undefined)).toEqual(new Set());
    expect(extractRuleUsedFields([])).toEqual(new Set());
  });

  it('detects state field from allowed_states criteria', () => {
    const categories = [
      { criteria_json: { allowed_states: ['KA', 'TN'] } }
    ];
    const fields = extractRuleUsedFields(categories);
    expect(fields.has('state')).toBe(true);
  });

  it('detects multiple fields from mixed criteria', () => {
    const categories = [
      { criteria_json: { gender: 'F', min_age: 10, max_age: 14 } },
      { criteria_json: { allowed_cities: ['Bangalore'], allowed_groups: ['A'] } }
    ];
    const fields = extractRuleUsedFields(categories);
    expect(fields.has('gender')).toBe(true);
    expect(fields.has('dob')).toBe(true);  // age rules use DOB
    expect(fields.has('city')).toBe(true);
    expect(fields.has('group_label')).toBe(true);
  });

  it('ignores OPEN gender (does not require gender field)', () => {
    const categories = [
      { criteria_json: { gender: 'OPEN' } }
    ];
    const fields = extractRuleUsedFields(categories);
    expect(fields.has('gender')).toBe(false);
  });

  it('does NOT include federation when not used in any criteria', () => {
    const categories = [
      { criteria_json: { min_age: 10, max_age: 18 } },
      { criteria_json: { allowed_states: ['MH', 'KA'] } }
    ];
    const fields = extractRuleUsedFields(categories);
    expect(fields.has('federation')).toBe(false);
    expect(fields.has('state')).toBe(true);
    expect(fields.has('dob')).toBe(true);
  });

  it('does NOT include club/city/type when not referenced by criteria', () => {
    const categories = [
      { criteria_json: { gender: 'F' } }
    ];
    const fields = extractRuleUsedFields(categories);
    expect(fields.has('gender')).toBe(true);
    expect(fields.has('club')).toBe(false);
    expect(fields.has('city')).toBe(false);
    expect(fields.has('type_label')).toBe(false);
  });
});
