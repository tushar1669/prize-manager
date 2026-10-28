import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as ReaderXLSX from 'xlsx';
import * as StyledXLSX from 'xlsx-js-style';
import { buildBrandedReportWorkbook, isBrandedPrizeReportSheetSet } from '@/utils/brandedWorkbookXlsx';

const winners = [
  { 'Category Order': 0, 'Category Name': 'Main', Place: 1, 'Player Name': 'Synthetic Winner One', Rank: 3, Amount: 15000, Trophy: 'Yes', Medal: 'No', Signature: '' },
  { 'Category Order': 1, 'Category Name': 'Under 12', Place: 1, 'Player Name': 'Synthetic Winner Two', Rank: 9, Amount: 3421, Trophy: 'No', Medal: 'Yes', Signature: '' },
  { 'Category Order': 2, 'Category Name': 'Under 16', Place: 2, 'Player Name': 'Synthetic Winner Three', Rank: 18, Amount: 3863, Trophy: 'No', Medal: 'Yes', Signature: '' },
];

const coverage = [
  { Category: 'Main', Place: 1, Amount: 15000, Status: 'Filled', 'Winner Name': 'Synthetic Winner One', Diagnosis: '' },
  { Category: 'Under 12', Place: 2, Amount: 1000, Status: 'Unfilled', 'Winner Name': '', Diagnosis: 'No eligible players' },
];

const rca = [
  { Category: 'Under 12', Place: 2, Amount: 1000, 'Root Cause': 'No eligible players', Diagnosis: 'No eligible players', 'Suggested Fix': 'Review criteria' },
];

describe('Branded report XLSX: structure and serializable data contracts', () => {
  it('keeps all three final workbook sheet names, row order, keys and numeric cash values', () => {
    const workbook = buildBrandedReportWorkbook({
      Winners: winners.map(({ Signature: _ignored, ...rest }) => rest),
      'Poster Grid': winners.map(({ Signature: _ignored, ...rest }) => rest),
      'Arbiter Sheet': winners,
    });
    expect(workbook.SheetNames).toEqual(['Winners', 'Poster Grid', 'Arbiter Sheet']);
    const raw = StyledXLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
    const reopened = ReaderXLSX.read(raw, { type: 'buffer', cellStyles: true });
    expect(reopened.SheetNames).toEqual(workbook.SheetNames);
    expect(ReaderXLSX.utils.sheet_to_json(reopened.Sheets.Winners)).toEqual(
      winners.map(({ Signature: _ignored, ...rest }) => rest),
    );
    expect(ReaderXLSX.utils.sheet_to_json(reopened.Sheets['Arbiter Sheet'])).toEqual(winners);
    expect(reopened.Sheets.Winners['F2'].t).toBe('n');
    expect(reopened.Sheets.Winners['F2'].v).toBe(15000);
    expect(Object.keys(ReaderXLSX.utils.sheet_to_json(reopened.Sheets.Winners)[0] as object))
      .toEqual(Object.keys(winners[0]).filter(key => key !== 'Signature'));
  });

  it('keeps coverage all rows and RCA unfilled only, using distinct report accents', () => {
    const wb = buildBrandedReportWorkbook({ AllocationCoverage: coverage, RCA: rca });
    expect(wb.SheetNames).toEqual(['AllocationCoverage', 'RCA']);
    expect(StyledXLSX.utils.sheet_to_json(wb.Sheets.AllocationCoverage)).toEqual(coverage);
    expect(StyledXLSX.utils.sheet_to_json(wb.Sheets.RCA)).toEqual(rca);
    const coverageHeader = wb.Sheets.AllocationCoverage['A1'] as { s?: { fill?: { fgColor?: { rgb?: string } } } };
    const rcaHeader = wb.Sheets.RCA['A1'] as { s?: { fill?: { fgColor?: { rgb?: string } } } };
    expect(coverageHeader.s?.fill?.fgColor?.rgb).toBe('1F6E5B');
    expect(rcaHeader.s?.fill?.fgColor?.rgb).toBe('99571F');
    const coveredUnfilled = wb.Sheets.AllocationCoverage['A3'] as typeof coverageHeader;
    expect(coveredUnfilled.s?.fill?.fgColor?.rgb).toBe('FFF1E4');
    expect(wb.Sheets.AllocationCoverage['!autofilter']).toBeTruthy();
    expect(wb.Sheets.RCA['!autofilter']).toBeTruthy();
  });
});


it('writes two complete synthetic XLSX files for actual OOXML and visual inspection', () => {
  mkdirSync('artifacts/branded-xlsx', { recursive: true });
  const final = buildBrandedReportWorkbook({
    Winners: winners.map(({ Signature: _signature, ...fields }) => fields),
    'Poster Grid': winners.map(({ Signature: _signature, ...fields }) => fields),
    'Arbiter Sheet': winners,
  });
  const reports = buildBrandedReportWorkbook({ AllocationCoverage: coverage, RCA: rca });
  writeFileSync('artifacts/branded-xlsx/final-winners.xlsx',
    StyledXLSX.write(final, { bookType: 'xlsx', type: 'buffer', cellStyles: true }));
  writeFileSync('artifacts/branded-xlsx/allocation-and-rca.xlsx',
    StyledXLSX.write(reports, { bookType: 'xlsx', type: 'buffer', cellStyles: true }));
  const teamBook = buildBrandedReportWorkbook({
    Winners: winners.map(({ Signature: _signature, ...fields }) => fields),
    'Poster Grid': winners.map(({ Signature: _signature, ...fields }) => fields),
    'Arbiter Sheet': winners,
    'Team Prizes': teamRows,
  });
  writeFileSync('artifacts/branded-xlsx/four-sheet-with-team.xlsx',
    StyledXLSX.write(teamBook, { bookType: 'xlsx', type: 'buffer', cellStyles: true }));
});

const teamRows = [
  { 'Prize Group': 'Best School', Place: 1, 'Team / Institution': 'Synthetic School A', 'Team Players': 'Synthetic Player One (#1), Synthetic Player Two (#2)', Points: 12, 'Cash Amount': 5000, Trophy: 'Yes', Medal: 'No' },
  { 'Prize Group': 'Best Club', Place: 1, 'Team / Institution': 'Synthetic Club B', 'Team Players': 'Synthetic Player Three (#3), Synthetic Player Four (#4)', Points: 11, 'Cash Amount': 3000, Trophy: 'No', Medal: 'Yes' },
];

describe('XLSX visual spacing and prepared fourth Team Prizes sheet', () => {
  it('centers compact flag/status cells after right-aligned amounts', () => {
    const reports = buildBrandedReportWorkbook({ AllocationCoverage: coverage });
    expect((reports.Sheets.AllocationCoverage['C2'] as { s?: { alignment?: { horizontal?: string } } }).s?.alignment?.horizontal).toBe('right');
    expect((reports.Sheets.AllocationCoverage['D2'] as { s?: { alignment?: { horizontal?: string } } }).s?.alignment?.horizontal).toBe('center');
    const wb = buildBrandedReportWorkbook({ Winners: winners });
    expect((wb.Sheets.Winners['G2'] as { s?: { alignment?: { horizontal?: string } } }).s?.alignment?.horizontal).toBe('center');
  });

  it('styles exact four-sheet Team rows with grouped tints and typed rupee cash without changing rows', () => {
    const base = winners.map(({ Signature: _signature, ...fields }) => fields);
    const wb = buildBrandedReportWorkbook({
      Winners: base, 'Poster Grid': base, 'Arbiter Sheet': winners, 'Team Prizes': teamRows,
    });
    expect(wb.SheetNames).toEqual(['Winners', 'Poster Grid', 'Arbiter Sheet', 'Team Prizes']);
    expect(StyledXLSX.utils.sheet_to_json(wb.Sheets['Team Prizes'])).toEqual(teamRows);
    expect(String(teamRows[0]['Team Players'])).toContain('Synthetic Player One (#1), Synthetic Player Two (#2)');
    expect(String(teamRows[1]['Team Players'])).toContain('Synthetic Player Three (#3), Synthetic Player Four (#4)');
    const team = wb.Sheets['Team Prizes'];
    const styled = (address: string) => team[address] as {
      t: string; v: unknown; s?: { fill?: { fgColor?: { rgb?: string } }; alignment?: { horizontal?: string }; numFmt?: string };
    };
    expect(styled('A2').s?.fill?.fgColor?.rgb).toBe('FBF6E9');
    expect(styled('A3').s?.fill?.fgColor?.rgb).toBe('ECF6F1');
    expect(styled('F2').t).toBe('n');
    expect(styled('F2').v).toBe(5000);
    expect(styled('F2').s?.numFmt).toBe('"₹"#,##0');
    expect(styled('G2').s?.alignment?.horizontal).toBe('center');
    expect(styled('H2').s?.alignment?.horizontal).toBe('center');
    const raw = StyledXLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellStyles: true });
    const back = ReaderXLSX.read(raw, { type: 'buffer' });
    expect(ReaderXLSX.utils.sheet_to_json(back.Sheets['Team Prizes'])).toEqual(teamRows);
  });
});

describe('Prize report-only XLSX scope guard', () => {
  const report = [{ Category: 'Synthetic', Place: 1, Amount: 42 }];
  it('accepts exactly the established three- or four-sheet Final Prize contract', () => {
    expect(isBrandedPrizeReportSheetSet({
      Winners: report, 'Poster Grid': report, 'Arbiter Sheet': report,
    })).toBe(true);
    expect(isBrandedPrizeReportSheetSet({
      Winners: report, 'Poster Grid': report, 'Arbiter Sheet': report, 'Team Prizes': [],
    })).toBe(true);
    expect(isBrandedPrizeReportSheetSet({ Winners: report })).toBe(false);
    expect(isBrandedPrizeReportSheetSet({
      Winners: report, 'Poster Grid': report, 'Arbiter Sheet': report, Errors: report,
    })).toBe(false);
  });

  it('accepts Coverage and RCA but leaves unrelated import diagnostics unbranded', () => {
    expect(isBrandedPrizeReportSheetSet({ AllocationCoverage: report })).toBe(true);
    expect(isBrandedPrizeReportSheetSet({ RCA: report })).toBe(true);
    for (const name of ['Errors', 'Conflicts', 'Players', 'ImportQuality']) {
      expect(isBrandedPrizeReportSheetSet({ [name]: report })).toBe(false);
    }
    expect(isBrandedPrizeReportSheetSet({})).toBe(false);
    expect(isBrandedPrizeReportSheetSet({ AllocationCoverage: report, Errors: report })).toBe(false);
  });
});
