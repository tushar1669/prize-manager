import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

const writeFile = vi.hoisted(() => vi.fn());
vi.mock('xlsx', async (importOriginal) => {
  const real = await importOriginal<typeof import('xlsx')>();
  return { ...real, writeFile };
});

import { downloadWorkbookXlsx } from '@/utils/excel';

// The real worksheet writer/reader are exercised. Only the browser download side effect is intercepted.
describe('Excel workbook serialization', () => {
  afterEach(() => {
    writeFile.mockReset();
  });

  it('writes a readable three-sheet workbook with stable header rows and numeric cash values', () => {
    const fields = {
      'Category Order': 1, 'Category Name': 'Main Open', Place: 1,
      'Player Name': 'Synthetic Player', Rank: 2, Amount: 2400,
      Trophy: 'Yes', Medal: 'No', 'Has Gift': 'Yes', 'Gift Items': 'Chess Clock ×2',
      'Club/Institution': '', State: '',
    };
    expect(downloadWorkbookXlsx('synthetic_final_prizes.xlsx', {
      Winners: [fields],
      'Poster Grid': [fields],
      'Arbiter Sheet': [{ ...fields, Signature: '' }],
    })).toBe(true);
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [workbook, filename, options] = writeFile.mock.calls[0] as [
      XLSX.WorkBook, string, { bookType: string }
    ];
    expect(filename).toBe('synthetic_final_prizes.xlsx');
    expect(options.bookType).toBe('xlsx');
    expect(workbook.SheetNames).toEqual(['Winners', 'Poster Grid', 'Arbiter Sheet']);

    const encoded = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const reopened = XLSX.read(encoded, { type: 'buffer' });
    expect(reopened.SheetNames).toEqual(workbook.SheetNames);
    const winnerRows = XLSX.utils.sheet_to_json(reopened.Sheets.Winners, { header: 1 }) as unknown[][];
    const posterRows = XLSX.utils.sheet_to_json(reopened.Sheets['Poster Grid'], { header: 1 }) as unknown[][];
    const arbiterRows = XLSX.utils.sheet_to_json(reopened.Sheets['Arbiter Sheet'], { header: 1 }) as unknown[][];
    expect(winnerRows[0]).toEqual(Object.keys(fields));
    expect(winnerRows[1][3]).toBe('Synthetic Player');
    expect(winnerRows[1][5]).toBe(2400);
    expect(posterRows).toEqual(winnerRows);
    expect(arbiterRows[0]).toEqual([...Object.keys(fields), 'Signature']);
    expect(arbiterRows[1].slice(0, 10)).toEqual(winnerRows[1].slice(0, 10));
  });
});
