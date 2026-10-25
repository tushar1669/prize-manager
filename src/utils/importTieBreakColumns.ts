/**
 * Read-only discovery of Swiss-Manager individual tie-break columns.
 *
 * TB1/TB2 are source positions, NOT named methods. The importer does not yet
 * persist or apply these values to team scoring. Never infer a Buchholz method,
 * default an empty value to zero, or use these samples to allocate prizes.
 */
export type ImportedTieBreakColumn = {
  ordinal: number;
  sourceHeader: string;
  /** 1-based position in the detected Excel header row. */
  sourceColumn: number;
  samplePresent: number;
  sampleMissing: number;
  sampleInvalid: number;
  duplicateOrdinal: boolean;
};

const TIE_BREAK_HEADER = /^t[\s._-]*b[\s._-]*0*(\d+)$/i;
const STRICT_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function isFiniteNumericSample(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return STRICT_DECIMAL.test(normalized) && Number.isFinite(Number(normalized));
}

/**
 * Report the TB columns actually present. Preview coverage refers only to the
 * rows available in the mapping dialog, not all imported tournament players.
 */
export function detectImportedTieBreakColumns(
  headers: readonly string[],
  previewRows: readonly Record<string, unknown>[],
): ImportedTieBreakColumn[] {
  const recognised = headers.flatMap((sourceHeader, index) => {
    if (sourceHeader.startsWith('__EMPTY_COL_')) return [];
    const match = TIE_BREAK_HEADER.exec(sourceHeader.trim());
    if (!match) return [];
    const ordinal = Number(match[1]);
    if (!Number.isSafeInteger(ordinal) || ordinal < 1) return [];
    return [{ ordinal, sourceHeader, sourceColumn: index + 1 }];
  });

  const frequency = new Map<number, number>();
  for (const column of recognised) {
    frequency.set(column.ordinal, (frequency.get(column.ordinal) ?? 0) + 1);
  }

  return recognised.map((column) => {
    let samplePresent = 0;
    let sampleMissing = 0;
    let sampleInvalid = 0;
    for (const row of previewRows) {
      const value = row[column.sourceHeader];
      if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
        sampleMissing += 1;
      } else if (isFiniteNumericSample(value)) {
        samplePresent += 1;
      } else {
        sampleInvalid += 1;
      }
    }
    return {
      ...column,
      samplePresent,
      sampleMissing,
      sampleInvalid,
      duplicateOrdinal: (frequency.get(column.ordinal) ?? 0) > 1,
    };
  }).sort((a, b) => a.ordinal - b.ordinal || a.sourceColumn - b.sourceColumn);
}
