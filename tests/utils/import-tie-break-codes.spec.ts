import { describe, expect, it } from 'vitest';
import { detectImportedTieBreakColumns, extractPlayerTieBreakValues } from '@/utils/importTieBreakColumns';
import {
  isNonSummableTieBreakName,
  tieBreakMethodFromSwissManagerCode,
} from '@/utils/teamTieBreakMethods';

// The exact header row of a real Swiss-Manager "Final ranking" Excel export
// (headers only, as produced by withUniqueHeaders). Values below are synthetic.
const SWISS_MANAGER_FINAL_RANKING_HEADERS = [
  'Rank', 'SNo.', '__EMPTY_COL_2', 'Name', 'Name (2)', '__EMPTY_COL_5', 'Rtg', 'NRtg', 'IRtg', 'Fed.', 'fs',
  'FED', 'Federation', 'Club', 'Team', 'Birth', 'age', 'Ident', 'Type', 'Gr', 'Fide-No.', 'Pts', 'Wins',
  'Draws', 'Loses', 'forfeit', 'Gam.', 'BH:GP/C1', 'BH:GP', 'SB', 'DE', 'WIN:GP/P', 'BWG:GP', 'Nrat-Ø',
  'IRat-Ø', 'Rtg+/-', 'W', 'n', 'We', 'W-We', 'K', 'Rtg+/- (2)', 'Ra', 'Rp',
];
const syntheticRow = {
  Rank: '1', Name: 'Synthetic Player', Club: 'Synthetic School', Pts: '6', Wins: '6',
  'BH:GP/C1': '29.5', 'BH:GP': '32', SB: '27.5', DE: '0', 'WIN:GP/P': '6', 'BWG:GP': '3',
  'Nrat-Ø': '1483', Ra: '1676', Rp: '2397',
};

describe('Swiss-Manager tie-break code headers', () => {
  it('detects exactly the six tie-break columns, numbered in file order', () => {
    const cols = detectImportedTieBreakColumns(SWISS_MANAGER_FINAL_RANKING_HEADERS, [syntheticRow]);
    expect(cols.map(c => [c.ordinal, c.sourceHeader])).toEqual([
      [1, 'BH:GP/C1'], [2, 'BH:GP'], [3, 'SB'], [4, 'DE'], [5, 'WIN:GP/P'], [6, 'BWG:GP'],
    ]);
    expect(cols.every(c => c.samplePresent === 1 && c.sampleInvalid === 0 && !c.duplicateOrdinal)).toBe(true);
    expect(cols.map(c => c.sourceColumn)).toEqual([28, 29, 30, 31, 32, 33]);
  });

  it('never treats rating statistics or the plain Wins count as tie-breaks', () => {
    const cols = detectImportedTieBreakColumns(['Wins', 'Rp', 'Ra', 'Nrat-Ø', 'IRat-Ø', 'Rtg+/-', 'sb', 'Sb', 'SB extra', 'BH:XY', 'DE (2)'], []);
    expect(cols).toEqual([]);
  });

  it('keeps numbered TB1…TBn columns authoritative when a file has both styles', () => {
    const cols = detectImportedTieBreakColumns(['TB1', 'TB2', 'SB', 'DE'], [{ TB1: '1', TB2: '2', SB: '3', DE: '0' }]);
    expect(cols.map(c => [c.ordinal, c.sourceHeader])).toEqual([[1, 'TB1'], [2, 'TB2']]);
  });

  it('saves each player\'s values under the detected ordinals, blank stays missing', () => {
    const cols = detectImportedTieBreakColumns(SWISS_MANAGER_FINAL_RANKING_HEADERS, [syntheticRow]);
    const values = extractPlayerTieBreakValues(cols, { ...syntheticRow, 'BWG:GP': '' }, 'synthetic-hash');
    expect(values?.values).toEqual({ '1': 29.5, '2': 32, '3': 27.5, '4': 0, '5': 6, '6': null });
    expect(values?.source_columns.map(c => c.header)).toEqual(['BH:GP/C1', 'BH:GP', 'SB', 'DE', 'WIN:GP/P', 'BWG:GP']);
  });

  it('suggests the matching standard method for each code, and nothing for unknown modifiers', () => {
    const suggest = (header: string) => tieBreakMethodFromSwissManagerCode(header)?.id ?? null;
    expect(['BH:GP/C1', 'BH:GP', 'SB', 'DE', 'WIN:GP/P', 'BWG:GP'].map(suggest))
      .toEqual(['bh_c1', 'bh', 'sb', 'de', 'wins', 'black_wins']);
    expect(suggest('BH/C2')).toBe('bh_c2');
    expect(suggest('BH:GP/M1')).toBe('bh_m1');
    expect(suggest('BH:GP/C3')).toBeNull();
    expect(suggest('SB/C1')).toBeNull();
    expect(suggest('EDE')).toBeNull();
    expect(suggest('Rp')).toBeNull();
    expect(suggest('Wins')).toBeNull();
    expect(suggest('TB1')).toBeNull();
  });

  it('treats Extended Direct Encounter as non-summable like Direct Encounter', () => {
    expect(isNonSummableTieBreakName('EDE')).toBe(true);
    expect(isNonSummableTieBreakName('Extended Direct Encounter')).toBe(true);
    expect(isNonSummableTieBreakName('Games won with Black')).toBe(false);
  });
});
