/**
 * Spreadsheet-only report styling. Keeps row 1 as the original schema/header,
 * retains all source values and sheet names, and never affects player imports.
 */
import * as XLSXStyle from 'xlsx-js-style';

const COLORS = {
  charcoal: '24282D', gold: 'B38A32', teal: '1F6E5B', navy: '0B3D91',
  white: 'FFFFFF', ink: '182C43', rule: 'CDD7E2',
  main: 'FBF6E9', green: 'ECF6F1', blue: 'EDF3FC', warning: 'FFF1E4',
} as const;

const REPORT_ACCENT: Record<string, string> = {
  Winners: COLORS.gold,
  'Poster Grid': COLORS.navy,
  'Arbiter Sheet': COLORS.teal,
  AllocationCoverage: COLORS.teal,
  RCA: '99571F',
};

const WIDTHS: Record<string, number> = {
  'Category Order': 16, 'Category Name': 24, Category: 24,
  Place: 10, Rank: 11, 'Player Name': 34, 'Winner Name': 32,
  Amount: 16, Trophy: 12, Medal: 12, 'Has Trophy': 14, 'Has Medal': 14,
  'Has Gift': 13, 'Gift Items': 34, 'Club/Institution': 28, State: 15,
  Signature: 26, 'Prize Label': 28, 'Prize Type': 18,
  Status: 15, 'Winner Rank': 16, 'Winner Rating': 18,
  Eligible: 14, Available: 14, 'Reason Label': 33, 'Root Cause': 34,
  Diagnosis: 44, 'Suggested Fix': 46, 'Fail Codes': 34,
};

type ExportCell = { s?: Record<string, unknown> };
type ExportSheet = XLSXStyle.WorkSheet & { '!freeze'?: { xSplit: number; ySplit: number } };

function sectionShade(index: number, isMain: boolean): string {
  if (isMain) return COLORS.main;
  return index % 2 === 1 ? COLORS.green : COLORS.blue;
}

function decorateSheet(sheet: XLSXStyle.WorkSheet, rows: Record<string, unknown>[], report: string) {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const accent = REPORT_ACCENT[report] ?? COLORS.gold;
  const sectionMap = new Map<string, number>();
  let nextSection = 0;
  const ruled = {
    bottom: { style: 'thin', color: { rgb: COLORS.rule } },
    right: { style: 'thin', color: { rgb: COLORS.rule } },
  };

  for (const [column, header] of headers.entries()) {
    const address = XLSXStyle.utils.encode_cell({ r: 0, c: column });
    const cell = sheet[address] as ExportCell | undefined;
    if (!cell) continue;
    cell.s = {
      fill: { fgColor: { rgb: column === 0 ? accent : COLORS.charcoal } },
      font: { name: 'Aptos', bold: true, sz: 11, color: { rgb: COLORS.white } },
      alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
      border: ruled,
    };
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const data = rows[rowIndex];
    const groupName = String(data['Category Name'] ?? data.Category ?? '').trim();
    if (!sectionMap.has(groupName)) sectionMap.set(groupName, nextSection++);
    const groupIndex = sectionMap.get(groupName) ?? 0;
    const isMain = data['Is Main'] === 'Yes' ||
      (report !== 'AllocationCoverage' && groupIndex === 0);
    const unfilled = data.Status === 'Unfilled' || report === 'RCA';
    const baseFill = unfilled ? COLORS.warning : sectionShade(groupIndex, isMain);

    for (const [column, header] of headers.entries()) {
      const cell = sheet[XLSXStyle.utils.encode_cell({ r: rowIndex + 1, c: column })] as ExportCell | undefined;
      if (!cell) continue;
      const emphasis = ['Place', 'Rank', 'Winner Rank'].includes(header);
      const isSignature = header === 'Signature';
      const isStatus = header === 'Status';
      const isAmount = header === 'Amount';
      cell.s = {
        fill: { fgColor: { rgb: isSignature ? COLORS.white : baseFill } },
        font: {
          name: 'Aptos', sz: emphasis ? 12 : 10,
          bold: emphasis || isAmount || isStatus,
          color: { rgb: unfilled && isStatus ? '99571F' : COLORS.ink },
        },
        alignment: {
          vertical: 'center',
          horizontal: emphasis ? 'center' : (isAmount ? 'right' : 'left'),
          wrapText: !emphasis && !isAmount,
        },
        border: ruled,
        ...(isAmount ? { numFmt: '"₹"#,##0' } : {}),
      };
    }
  }
  const typed = sheet as ExportSheet;
  typed['!cols'] = headers.map((header) => ({ wch: WIDTHS[header] ?? 21 }));
  typed['!rows'] = Array.from({ length: rows.length + 1 }, (_, index) => ({ hpt: index === 0 ? 31 : 27 }));
  typed['!autofilter'] = { ref: XLSXStyle.utils.encode_range({
    s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 },
  }) };
  // No extra banner row: headers and data addresses must remain backward compatible.
  typed['!freeze'] = { xSplit: 0, ySplit: 1 };
}

/** Pure helper for roundtrip tests and the existing export-only download path. */
export function buildBrandedReportWorkbook(sheets: Record<string, unknown[]>): XLSXStyle.WorkBook {
  const wb = XLSXStyle.utils.book_new();
  for (const [name, rawRows] of Object.entries(sheets)) {
    const rows = (rawRows ?? []) as Record<string, unknown>[];
    const ws = XLSXStyle.utils.json_to_sheet(rows);
    decorateSheet(ws, rows, name);
    XLSXStyle.utils.book_append_sheet(wb, ws, name);
  }
  wb.Props = { Title: 'Prize Manager — Tournament Prize Reports', Subject: 'Prize Manager XLSX Reports' };
  return wb;
}

/** Only used by reports — never the importer/parser code path. */
export function writeBrandedReportWorkbook(filename: string, sheets: Record<string, unknown[]>): void {
  const wb = buildBrandedReportWorkbook(sheets);
  XLSXStyle.writeFile(wb, filename, { bookType: 'xlsx', cellStyles: true });
}
