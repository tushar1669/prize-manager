import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parsePrizeTemplateFile } from '../src/utils/prizeTemplateParser';

function workbookToFile(name: string, sheets: Record<string, unknown[][]>): File {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return {
    name,
    async arrayBuffer() {
      return bytes as ArrayBuffer;
    },
  } as File;
}

describe('parsePrizeTemplateFile v2', () => {
  it('parses single category with multiple prize rows', async () => {
    const file = workbookToFile('v2.xlsx', {
      Prizes: [
        ['Category', 'Is Main', 'Place', 'Cash Amount', 'Trophy', 'Medal', 'Gender'],
        ['Main Prize', 'yes', '1', 10000, 'yes', 'yes', 'OPEN'],
        ['Main Prize', 'yes', '2', 6000, 'yes', 'no', 'OPEN'],
      ],
    });

    const result = await parsePrizeTemplateFile(file);
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(result.draft.categories).toHaveLength(1);
    expect(result.draft.categories[0].prizes).toHaveLength(2);
  });

  it('expands place ranges in v2', async () => {
    const file = workbookToFile('v2.xlsx', {
      Prizes: [
        ['Category', 'Place'],
        ['Main Prize', '6-8'],
      ],
    });

    const result = await parsePrizeTemplateFile(file);
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(result.draft.categories[0].prizes.map((p) => p.place)).toEqual([6, 7, 8]);
  });

  it('applies gift qty by repeating gift entries', async () => {
    const file = workbookToFile('v2.xlsx', {
      Prizes: [
        ['Category', 'Place', 'Gift Name', 'Gift Qty'],
        ['Main Prize', '1', 'Chess Clock', 3],
      ],
    });

    const result = await parsePrizeTemplateFile(file);
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(result.draft.categories[0].prizes[0].gift_items).toEqual(['Chess Clock', 'Chess Clock', 'Chess Clock']);
  });

  it('raises validation error on conflicting category criteria across rows', async () => {
    const file = workbookToFile('v2.xlsx', {
      Prizes: [
        ['Category', 'Place', 'Gender'],
        ['Women', '1', 'F'],
        ['Women', '2', 'OPEN'],
      ],
    });

    const result = await parsePrizeTemplateFile(file);
    expect(result.issues.some((i) => i.message.includes('Conflicting criteria for category "Women"'))).toBe(true);
  });
});

describe('parsePrizeTemplateFile v1 compatibility', () => {
  it('still parses legacy Categories + Prizes sheets', async () => {
    const file = workbookToFile('v1.xlsx', {
      Categories: [
        ['Name', 'Is Main', 'Gender'],
        ['Main Prize', 'yes', 'OPEN'],
      ],
      Prizes: [
        ['Category', 'Place', 'Cash Amount'],
        ['Main Prize', '1', 5000],
      ],
      'Category Rules': [['Category']],
      'Team Groups': [['Name']],
      'Team Prizes': [['Group']],
    });

    const result = await parsePrizeTemplateFile(file);
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(result.draft.categories).toHaveLength(1);
    expect(result.draft.categories[0].name).toBe('Main Prize');
    expect(result.draft.categories[0].prizes).toHaveLength(1);
  });
});
