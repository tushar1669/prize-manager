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
