import { describe, expect, it } from 'vitest';
import { detectImportedTieBreakColumns, extractPlayerTieBreakValues } from '@/utils/importTieBreakColumns';
import { buildSupabasePlayerPayload } from '@/utils/playerImportPayload';

describe('Swiss-Manager individual tie-break column discovery', () => {
  it('detects all available ordinals numerically, not lexicographically', () => {
    const rows = [{ TB1: 0, TB2: 12.5, TB10: '3.5', Name: 'Synthetic Player' }];
    expect(detectImportedTieBreakColumns(['Rank', 'Name', 'TB10', 'TB2', 'TB1'], rows))
      .toEqual([
        { ordinal: 1, sourceHeader: 'TB1', sourceColumn: 5, samplePresent: 1, sampleMissing: 0, sampleInvalid: 0, duplicateOrdinal: false },
        { ordinal: 2, sourceHeader: 'TB2', sourceColumn: 4, samplePresent: 1, sampleMissing: 0, sampleInvalid: 0, duplicateOrdinal: false },
        { ordinal: 10, sourceHeader: 'TB10', sourceColumn: 3, samplePresent: 1, sampleMissing: 0, sampleInvalid: 0, duplicateOrdinal: false },
      ]);
  });

  it('accepts unambiguous punctuation aliases and highlights duplicate ordinal mappings', () => {
    const rows = [{ TB1: 2, 'TB 01': 4, 'T.B.3': 0 }];
    const cols = detectImportedTieBreakColumns(['TB1', 'T.B.3', 'TB 01'], rows);
    expect(cols.map(c => c.ordinal)).toEqual([1, 1, 3]);
    expect(cols.map(c => c.duplicateOrdinal)).toEqual([true, true, false]);
    expect(cols.map(c => c.sourceColumn)).toEqual([1, 3, 2]);
  });

  it('counts zeros as valid but never converts missing or bad samples into zero', () => {
    const cols = detectImportedTieBreakColumns(['TB1'], [
      { TB1: 0 }, { TB1: '0' }, { TB1: ' 1.5 ' },
      { TB1: '' }, { TB1: null }, {}, { TB1: '1,5' },
      { TB1: 'no data' }, { TB1: Number.POSITIVE_INFINITY },
      { TB1: false },
    ]);
    expect(cols[0]).toMatchObject({ samplePresent: 3, sampleMissing: 3, sampleInvalid: 4 });
  });

  it('does not invent tie-breaks or interpret unrelated headers as source TB ordinals', () => {
    expect(detectImportedTieBreakColumns(['Rank', 'Name', 'Points'], [])).toEqual([]);
    expect(detectImportedTieBreakColumns(
      ['TB0', 'TB1 extra', 'BATB2', 'TB', '__EMPTY_COL_7', 'TB-2'],
      [{ 'TB-2': 2 }],
    ).map(c => c.ordinal)).toEqual([2]);
  });

  it('reports preview coverage without pretending it is full-import coverage', () => {
    const cols = detectImportedTieBreakColumns(['TB2'], [{ TB2: '2' }, { TB2: undefined }]);
    expect(cols[0]).toMatchObject({ samplePresent: 1, sampleMissing: 1, sampleInvalid: 0 });
  });
});

describe('TB import persistence using the existing player tags JSON path', () => {
  it('preserves source ordinal, valid zero and missing values through the payload', () => {
    const raw = { Name: 'Synthetic Player', Rank: 1, TB1: 0, TB2: '', TB3: 12.5 };
    const columns = detectImportedTieBreakColumns(['Rank', 'Name', 'TB1', 'TB2', 'TB3'], [raw]);
    const values = extractPlayerTieBreakValues(columns, raw, 'test-file-hash');
    expect(values).toMatchObject({
      version: 1, source_hash: 'test-file-hash',
      values: { '1': 0, '2': null, '3': 12.5 },
    });
    const payload = buildSupabasePlayerPayload({
      rank: 1, name: 'Synthetic Player', tags_json: { special_group: ['PC'] },
      _originalIndex: 1, _individualTieBreaks: values,
    } as never, 'synthetic-tournament');
    expect((payload.tags_json as Record<string, unknown>).special_group).toEqual(['PC']);
    expect((payload.tags_json as Record<string, unknown>).team_tiebreak_v2).toEqual(values);
  });

  it('refuses an ambiguous duplicate source ordinal and retains null rather than guessing', () => {
    const raw = { TB1: 12.5, 'TB 01': 9 };
    const columns = detectImportedTieBreakColumns(['TB1', 'TB 01'], [raw]);
    expect(extractPlayerTieBreakValues(columns, raw, null)?.values).toEqual({ '1': null });
  });

  it('does not carry any stale team TB metadata across new files without TB columns', () => {
    const payload = buildSupabasePlayerPayload({
      rank: 1, name: 'Synthetic Player', _originalIndex: 1,
      tags_json: { special_group: ['PC'], team_tiebreak_v2: { version: 1, values: { 1: 999 } } },
      _individualTieBreaks: null,
    } as never, 'synthetic-tournament');
    const tags = payload.tags_json as Record<string, unknown>;
    expect(tags.team_tiebreak_v2).toBeUndefined();
    expect(tags.special_group).toEqual(['PC']);
  });
});
