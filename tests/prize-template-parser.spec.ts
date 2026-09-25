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
  it('prefers the exact Prizes worksheet when another sheet also has prize headers', async () => {
    const file = workbookToFile('v2.xlsx', {
      Prizes: [
        ['Category', 'Place'],
        ['Main Prize', 1],
      ],
      Sheet1: [
        ['Category', 'Place'],
        ['Other Prize', 1],
      ],
    });

    const result = await parsePrizeTemplateFile(file);
    expect(result.issues).toHaveLength(0);
    expect(result.draft.categories.map((category) => category.name)).toEqual(['Main Prize']);
  });

  it('uses one unambiguously matching worksheet and warns when Prizes is absent', async () => {
    const file = workbookToFile('eklavya.xlsx', {
      Sheet1: [
        ['Category', 'Is Main', 'Place', 'Cash Amount', 'Trophy', 'Medal', 'Gift Name', 'Gift Qty', 'Notes'],
        ['Main Prize', 'Yes', 1, 31000, 'Yes', 'yes', '', '', ''],
        ['Main Prize', 'Yes', 2, 25000, 'yes', 'no', '', '', ''],
        ['Under 7', 'no', 2, '', 'no', 'yes', '', '', ''],
        ['Under 7', 'no', 3, '', 'no', 'Yes', '', '', ''],
      ],
    });

    const result = await parsePrizeTemplateFile(file);
    expect(result.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0);
    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: 'warning',
      sheet: 'Sheet1',
      message: expect.stringContaining('Using worksheet "Sheet1"'),
    }));
    expect(result.draft.categories).toHaveLength(2);
    expect(result.draft.categories.find((category) => category.name === 'Under 7')?.prizes.map((prize) => prize.place)).toEqual([2, 3]);
    expect(result.draft.categories.reduce((count, category) => count + category.prizes.length, 0)).toBe(4);
  });

  it('returns a clear blocking error when no worksheet has the v2 headers', async () => {
    const file = workbookToFile('invalid.xlsx', {
      Sheet1: [['Name', 'Amount'], ['Main Prize', 1000]],
    });

    const result = await parsePrizeTemplateFile(file);
    expect(result.draft.categories).toHaveLength(0);
    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: 'error',
      sheet: 'Workbook',
      message: expect.stringContaining('No prize worksheet found'),
    }));
  });

  it('returns a clear blocking error when multiple worksheets match', async () => {
    const file = workbookToFile('ambiguous.xlsx', {
      First: [['Category', 'Place'], ['Main Prize', 1]],
      Second: [['Category', 'Place'], ['Women', 1]],
    });

    const result = await parsePrizeTemplateFile(file);
    expect(result.draft.categories).toHaveLength(0);
    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: 'error',
      sheet: 'Workbook',
      message: expect.stringContaining('Multiple worksheets contain Category and Place columns'),
    }));
  });

  it('parses simplified v2 rows with default columns only', async () => {
    const file = workbookToFile('v2.xlsx', {
      Prizes: [
        ['Category', 'Is Main', 'Place', 'Cash Amount', 'Trophy', 'Medal', 'Gift Name', 'Gift Qty', 'Notes'],
        ['Main Prize', 'yes', '1', 10000, 'yes', 'yes', 'Chess Clock', 1, 'Overall champion'],
        ['Main Prize', 'yes', '2', 6000, 'yes', 'no', '', '', 'Main runner-up'],
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


  it('allows repeated-category rows to omit criteria after first row', async () => {
    const file = workbookToFile('v2.xlsx', {
      Prizes: [
        ['Category', 'Place', 'Gender', 'Min Rating'],
        ['Women', '1', 'F', 1200],
        ['Women', '2', '', ''],
      ],
    });

    const result = await parsePrizeTemplateFile(file);
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(result.draft.categories).toHaveLength(1);
    expect(result.draft.categories[0].prizes).toHaveLength(2);
    expect(result.draft.categories[0].criteria_json).toMatchObject({ gender: 'F', min_rating: 1200 });
  });


  it('tolerates older v2 files with legacy criteria columns', async () => {
    const file = workbookToFile('v2-legacy-columns.xlsx', {
      Prizes: [
        ['Category', 'Is Main', 'Place', 'Gender', 'Min Rating', 'Allowed States'],
        ['Women', 'no', '1', 'F', 1200, 'MH, GJ'],
        ['Women', 'no', '2', 'F', 1200, 'MH, GJ'],
      ],
    });

    const result = await parsePrizeTemplateFile(file);
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(result.draft.categories).toHaveLength(1);
    expect(result.draft.categories[0].criteria_json).toMatchObject({
      gender: 'F',
      min_rating: 1200,
      allowed_states: ['MH', 'GJ'],
    });
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
