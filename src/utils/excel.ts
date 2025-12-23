// src/utils/excel.ts
// Excel template and error export utilities for player import

import * as XLSX from 'xlsx';
import { getPlayerDisplayName } from './playerName';

type ImportSource = 'swiss-manager' | 'template' | 'unknown';

type PlayerRow = {
  rank?: number | string | null;
  sno?: number | string | null;
  full_name?: string | null;
  name?: string | null;
  rating?: number | string | null;
  unrated?: boolean | string | number | null;
  dob?: string | null;
  dob_raw?: string | null;
  _dobInferred?: boolean | null;
  dob_inferred?: boolean | null;
  gender?: string | null;
  fide_id?: string | null;
  federation?: string | null;
  state?: string | null;
  city?: string | null;
  club?: string | null;
  special_notes?: string | null;
  notes?: string | null;
  [key: string]: unknown;
};

export type ErrorRow = {
  rowIndex: number;
  reason: string;
  original?: Record<string, unknown>;
};

const IST_TIME_ZONE = 'Asia/Kolkata';

function sanitizeFilename(name: string) {
  return name.replace(/[^\w\-.]+/g, '_').slice(0, 80);
}

function sanitizeSheetName(name: string): string {
  // Excel sheet names: max 31 chars, no []:*?/\
  const invalidSheetChars = new RegExp('[\\[\\]:*?/\\\\]', 'g');
  return name
    .replace(invalidSheetChars, '')
    .slice(0, 31);
}

function sanitizeSlug(slug?: string | null): string {
  if (!slug) return 'tournament';
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function formatIstParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

function formatIstTimestampForFile(date: Date): string {
  const { year, month, day, hour, minute } = formatIstParts(date);
  return `${year}${month}${day}-${hour}${minute}IST`;
}

function formatIstIso(date: Date): string {
  const { year, month, day, hour, minute, second } = formatIstParts(date);
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+05:30`;
}

function toExcelDate(dob?: string | null): Date | null {
  if (!dob) return null;
  const [year, month, day] = dob.split('-').map(v => Number(v));
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

export function downloadPlayersXlsx(
  players: PlayerRow[],
  options: { tournamentSlug?: string | null; importSource?: ImportSource } = {}
) {
  if (!players || players.length === 0) {
    console.warn('[excel] No players available for export');
    return;
  }

  const now = new Date();
  const slug = sanitizeSlug(options.tournamentSlug);
  const timestamp = formatIstTimestampForFile(now);
  const generatedAtIst = formatIstIso(now);

  const headers = [
    'Rank',
    'SNo',
    'Name',
    'Rating',
    'Unrated',
    'DOB',
    'DOB_Raw',
    'DOB_Inferred',
    'Gender',
    'FIDE_ID',
    'Federation',
    'State',
    'City',
    'Club',
    'Import_Source',
    'Imported_At',
    'Notes'
  ];

  const rows = players.map(player => {
    const dobDate = toExcelDate(player.dob);
    const unratedValue = player.unrated;
    const importSource: ImportSource = options.importSource ?? 'unknown';
    const sourceValue = importSource === 'unknown' ? 'template' : importSource;

    return [
      player.rank != null ? Number(player.rank) : null,
      player.sno != null && player.sno !== '' ? Number(player.sno) : null,
      getPlayerDisplayName(player as { full_name?: string | null; name?: string | null }),
      player.rating != null && player.rating !== '' ? Number(player.rating) : null,
      unratedValue == null ? null : Boolean(unratedValue),
      dobDate,
      player.dob_raw ?? player.dob ?? null,
      Boolean(player._dobInferred ?? player.dob_inferred),
      player.gender ?? null,
      player.fide_id ?? null,
      player.federation ?? null,
      player.state ?? null,
      player.city ?? null,
      player.club ?? null,
      sourceValue,
      generatedAtIst,
      player.special_notes ?? player.notes ?? null
    ];
  });

  const worksheetData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);

  // Apply date format for DOB column (column F)
  for (let r = 1; r < worksheetData.length; r++) {
    const cellAddress = XLSX.utils.encode_cell({ c: 5, r });
    const cell = ws[cellAddress];
    if (cell && cell.v instanceof Date) {
      cell.z = 'yyyy-mm-dd';
    }
  }

  const worksheetWithCols = ws as XLSX.WorkSheet & { '!cols'?: XLSX.ColInfo[] };
  worksheetWithCols['!cols'] = [
    { wch: 6 }, // Rank
    { wch: 6 }, // SNo
    { wch: 28 }, // Name
    { wch: 8 }, // Rating
    { wch: 9 }, // Unrated
    { wch: 12 }, // DOB
    { wch: 14 }, // DOB_Raw
    { wch: 12 }, // DOB_Inferred
    { wch: 8 }, // Gender
    { wch: 14 }, // FIDE_ID
    { wch: 11 }, // Federation
    { wch: 10 }, // State
    { wch: 16 }, // City
    { wch: 20 }, // Club
    { wch: 16 }, // Import_Source
    { wch: 22 }, // Imported_At
    { wch: 30 } // Notes
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Players');

  const filename = `players_${slug}_${timestamp}.xlsx`;
  XLSX.writeFile(wb, filename);

  console.log('[excel] Players workbook downloaded:', filename, `(rows=${players.length})`);
}

/**
 * Download Excel template with sample player data (v2)
 * Two sheets: Players (data entry) + ReadMe (instructions)
 */
export function downloadPlayersTemplateXlsx() {
  // === SHEET 1: PLAYERS ===
  const headers = [
    'Rank', 'SNo.', 'Name', 'Rtg', 'Unrated', 'Birth', 'Gender', 
    'Fide-No.', 'Federation', 'State', 'City', 'Club'
  ];
  
  const sample = [
    [1, 57, 'Aditi Sharma', 1850, 'No', '2007/00/00', 'F', '35012345', 'IND', 'MH', 'Pune', 'XYZ Chess'],
  ];

  const wsPlayers = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  
  // Column widths
  const playersWorksheet = wsPlayers as XLSX.WorkSheet & {
    '!cols'?: XLSX.ColInfo[];
    '!freeze'?: { xSplit: number; ySplit: number };
    '!autofilter'?: { ref: string };
  };
  playersWorksheet['!cols'] = [
    { wch: 6 },  // Rank
    { wch: 7 },  // SNo.
    { wch: 28 }, // Name
    { wch: 7 },  // Rtg
    { wch: 9 },  // Unrated
    { wch: 14 }, // Birth
    { wch: 8 },  // Gender
    { wch: 12 }, // Fide-No.
    { wch: 10 }, // Federation
    { wch: 12 }, // State
    { wch: 14 }, // City
    { wch: 20 }  // Club
  ];

  // Freeze top row and enable filter
  playersWorksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  playersWorksheet['!autofilter'] = { ref: 'A1:L1' };

  // === SHEET 2: README ===
  const readmeContent = [
    ['PLAYER IMPORT TEMPLATE v2 - INSTRUCTIONS'],
    [''],
    ['PURPOSE'],
    ['Use this sheet to list tournament players. This format is optimized for auto-mapping and age-based prize eligibility.'],
    [''],
    ['COLUMN GUIDE'],
    ['Column', 'Required?', 'Description'],
    ['Rank', 'Yes', 'Final tournament position (1, 2, 3...). Do NOT use Start Number here.'],
    ['SNo.', 'No', 'Start Number / Seed (distinct from Rank). Optional.'],
    ['Name', 'Yes', 'Player full name (minimum 2 characters).'],
    ['Rtg', 'No', 'Current rating (0-3000). Leave blank or enter 0 if unrated.'],
    ['Unrated', 'No', 'Yes/No. Optional - system can infer if rating is 0 and FIDE ID missing.'],
    ['Birth', 'Yes*', 'Date of birth. Formats: YYYY/00/00 (year only), YYYY, or YYYY-MM-DD. *Required for age categories.'],
    ['Gender', 'No', 'M for Male, F for Female.'],
    ['Fide-No.', 'No', 'FIDE ID (5-10 digits). Leave blank if unknown.'],
    ['Federation', 'No', 'Country code (e.g., IND). Optional.'],
    ['State', 'No', 'State/province. Optional.'],
    ['City', 'No', 'City name. Optional.'],
    ['Club', 'No', 'Chess club or academy. Optional.'],
    [''],
    ['HOW TO EXPORT FROM SWISS-MANAGER'],
    ['1. Open your tournament in Swiss-Manager.'],
    ['2. Use the Excel/Export ranking list option (naming varies by version).'],
    ['3. Ensure columns include: Rank, SNo., Name, Rtg (or IRtg), Birth, fs (gender), Fide-No.'],
    ['4. If using this template, copy/paste ONLY player rows (not headers) into the "Players" sheet starting at Row 2.'],
    [''],
    ['HOW TO USE THIS TEMPLATE'],
    ['1. Keep headers exactly as provided (do not rename or reorder).'],
    ['2. Enter one player per row starting from Row 2.'],
    ['3. For DOB with unknown month/day, use YYYY/00/00 or just YYYY (system converts to YYYY-01-01).'],
    ['4. If rating is unknown, leave Rtg blank or enter 0. Optionally set Unrated = Yes.'],
    ['5. Gender: use M for Male, F for Female.'],
    ['6. Save as .xlsx and upload to the tournament portal.'],
    [''],
    ['COMMON PITFALLS'],
    ['• Do NOT swap Rank and SNo. - they are different! Rank = final position, SNo. = seed/start number.'],
    ['• Do NOT rename column headers (case-sensitive: "Birth" not "DOB", "Rtg" not "Rating").'],
    ['• Avoid merged cells or extra blank rows above the header row.'],
    ['• If pasting from Swiss-Manager, use "Paste Values" (not formatted paste) to avoid cell styling issues.'],
    [''],
    ['SWISS-MANAGER AUTO-DETECTION'],
    ['The system automatically detects Swiss-Manager "Interim Ranking List" files:'],
    ['• Scans first 25 rows to find the header row (typically row 20).'],
    ['• Maps columns: Rank → rank, SNo. → sno, Name → name, Rtg → rating, Birth → dob, fs → gender, Fide-No. → fide_id.'],
    ['• Prefers "Rtg" over "IRtg" when both are present (current rating, not initial).'],
    ['• Normalizes DOB formats: YYYY/00/00 → YYYY-01-01 (preserves original in dob_raw field).'],
    [''],
    ['SUPPORT'],
    ['If you see import errors, download the error report in the app, fix the marked rows, and re-upload.'],
    ['For questions, contact tournament support with your file attached.'],
  ];

  const wsReadme = XLSX.utils.aoa_to_sheet(readmeContent);
  
  // Column widths for ReadMe
  (wsReadme as unknown)['!cols'] = [
    { wch: 20 },  // Column 1
    { wch: 12 },  // Column 2
    { wch: 80 }   // Column 3 (wide for descriptions)
  ];

  // === ASSEMBLE WORKBOOK ===
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsPlayers, 'Players');
  XLSX.utils.book_append_sheet(wb, wsReadme, 'ReadMe');
  
  XLSX.writeFile(wb, 'players_template_v2.xlsx');
  
  console.log('[excel] Template v2 downloaded: Players + ReadMe sheets');
}

/**
 * Download Swiss-Manager mapping reference workbook
 * Shows exact Swiss-Manager headers with sample data for operator cross-checking
 */
export function downloadSwissManagerReferenceXlsx() {
  // === SHEET 1: SWISS-MANAGER REF ===
  const headers = [
    'Rank', 'SNo.', 'Name', 'Rtg', 'IRtg', 'Birth', 'fs', 
    'Fide-No.', 'Federation', 'State', 'City', 'Club'
  ];
  
  const sampleData = [
    [1, 57, 'Aditi Sharma', 1850, 1780, '2007/00/00', 'F', '35012345', 'IND', 'MH', 'Pune', 'XYZ Chess'],
    [12, 101, 'Rohan Iyer', 1720, 0, '2005/00/00', '', '', 'IND', 'KA', 'Bengaluru', ''],
    [28, 64, 'Sia Verma', 1500, 1450, '2010/00/00', 'F', '', 'IND', 'DL', 'New Delhi', ''],
  ];

  const wsRef = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
  
  // Column widths
  (wsRef as unknown)['!cols'] = [
    { wch: 6 },  // Rank
    { wch: 7 },  // SNo.
    { wch: 28 }, // Name
    { wch: 7 },  // Rtg
    { wch: 7 },  // IRtg
    { wch: 14 }, // Birth
    { wch: 4 },  // fs
    { wch: 12 }, // Fide-No.
    { wch: 11 }, // Federation
    { wch: 12 }, // State
    { wch: 14 }, // City
    { wch: 20 }  // Club
  ];

  // Freeze top row and enable filter
  (wsRef as unknown)['!freeze'] = { xSplit: 0, ySplit: 1 };
  (wsRef as unknown)['!autofilter'] = { ref: 'A1:L1' };

  // === SHEET 2: README ===
  const readmeContent = [
    ['SWISS-MANAGER MAPPING REFERENCE'],
    [''],
    ['HOW TO EXPORT FROM SWISS-MANAGER'],
    ['1. Open your tournament in Swiss-Manager.'],
    ['2. Use the Export Ranking or Export Interim Ranking to Excel option.'],
    ['3. Ensure these columns appear in your export: Rank, SNo., Name, Rtg, IRtg, Birth, fs, Fide-No., Federation, State, City, Club.'],
    ['4. Do NOT edit header names in the exported file.'],
    [''],
    ['HOW TO USE THIS REFERENCE WITH OUR IMPORTER'],
    ['Our app automatically detects the header row (typically around row 20 in Swiss-Manager exports) and maps columns as follows:'],
    [''],
    ['FIELD MAPPING RULES (Swiss-Manager → App Field):'],
    ['• rank ← Rank (final tournament position; NEVER SNo.)'],
    ['• sno ← SNo. (start number/seed)'],
    ['• name ← Name (player full name)'],
    ['• rating ← Rtg (current rating; when both Rtg & IRtg exist, we ALWAYS prefer Rtg)'],
    ['• dob ← Birth (supports YYYY/00/00, YYYY, or YYYY-MM-DD formats)'],
    ['• gender ← fs (F = Female; blank or empty = unknown)'],
    ['• fide_id ← Fide-No. (punctuation preserved)'],
    ['• federation ← Federation (country code, e.g., IND)'],
    ['• state ← State (state/province)'],
    ['• city ← City (city name)'],
    ['• club ← Club (chess club or academy)'],
    [''],
    ['UNRATED PLAYER HANDLING:'],
    ['• Rtg may be blank or 0 for unrated players.'],
    ['• The app can infer "unrated" status when rating=0 and FIDE ID is missing.'],
    ['• Values like "", "-", "NA" in rating fields are treated as not-rated signals when feature is enabled.'],
    ['• IRtg (initial rating) is informational only; we use Rtg for current rating.'],
    [''],
    ['WHEN TO USE THIS VS. PLAYERS TEMPLATE'],
    ['• Use this REFERENCE to cross-check auto-mapping from native Swiss-Manager export files.'],
    ['• Use players_template_v2.xlsx to hand-enter players or paste cleaned data with organizer-friendly headers.'],
    [''],
    ['EXAMPLE USE CASE'],
    ['1. Export your Interim Ranking List from Swiss-Manager.'],
    ['2. Upload the exported .xlsx file directly to our import page.'],
    ['3. The app will auto-detect the header row and map columns using the rules above.'],
    ['4. If any columns are not auto-detected, use the manual column mapping dialog.'],
    ['5. Review the preview and proceed with import.'],
    [''],
    ['SUPPORT'],
    ['If auto-detection fails or mappings look incorrect, contact support with your Swiss-Manager export file attached.'],
  ];

  const wsReadme = XLSX.utils.aoa_to_sheet(readmeContent);
  
  // Column widths for ReadMe
  (wsReadme as unknown)['!cols'] = [
    { wch: 100 }  // Single wide column for instructions
  ];

  // === ASSEMBLE WORKBOOK ===
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsRef, 'SwissManagerRef');
  XLSX.utils.book_append_sheet(wb, wsReadme, 'ReadMe');
  
  XLSX.writeFile(wb, 'swiss_manager_mapping_reference.xlsx');
  
  console.log('[excel] Swiss-Manager reference downloaded: SwissManagerRef + ReadMe sheets');
}

/**
 * Generic multi-sheet Excel downloader (base utility)
 */
export function downloadWorkbookXlsx(
  filename: string,
  sheets: Record<string, unknown[]>
): boolean {
  try {
    const wb = XLSX.utils.book_new();
    for (const [sheetName, rows] of Object.entries(sheets)) {
      const ws = XLSX.utils.json_to_sheet(rows ?? []);
      const safeName = sanitizeSheetName(sheetName || 'Sheet1');
      XLSX.utils.book_append_sheet(wb, ws, safeName);
    }
    // Force .xlsx extension
    let safeFilename = filename;
    if (!/\.xlsx$/i.test(safeFilename)) {
      safeFilename = safeFilename.replace(/\.[^.]+$/, '') + '.xlsx';
    }
    XLSX.writeFile(wb, safeFilename, { bookType: 'xlsx' });
    console.log('[excel] downloadWorkbookXlsx:', safeFilename);
    return true;
  } catch (e) {
    console.error('[excel] downloadWorkbookXlsx failed', e);
    return false;
  }
}

/**
 * Download errors as Excel workbook
 */
export async function downloadErrorXlsx(
  errors: ErrorRow[],
  originalRows: Record<string, unknown>[],
  filename?: string
): Promise<boolean> {
  try {
    const count = errors?.length ?? 0;
    console.log('[import] error-xlsx rows=', count);
    if (count === 0) {
      return false;
    }

    const rows = errors.map(error => {
      const source = error.original ?? originalRows?.[error.rowIndex - 1] ?? {};
      return {
        Row: error.rowIndex,
        Reason: error.reason,
        Name: source?.Name ?? source?.name ?? '',
        Rank: source?.Rank ?? source?.rank ?? '',
        Rtg: source?.Rtg ?? source?.rating ?? '',
        'Fide-No.': source?.['Fide-No.'] ?? source?.fide_id ?? '',
        SNo: source?.['SNo.'] ?? source?.sno ?? '',
        DOB: source?.Birth ?? source?.dob ?? '',
        Gender: source?.Gender ?? source?.gender ?? '',
      };
    });

    const today = new Date().toISOString().slice(0, 10);
    const fallback = `import_errors_${today}.xlsx`;
    const safeFilename = sanitizeFilename(filename || fallback);

    return downloadWorkbookXlsx(safeFilename, { Errors: rows });
  } catch (error) {
    console.error('[import] error-xlsx failed', error);
    return false;
  }
}

/**
 * Download conflicts as Excel workbook
 */
export function downloadConflictsXlsx(
  conflicts: Array<{
    keyKind: string;
    key: string;
    reason: string;
    a?: unknown;
    b?: unknown;
  }>,
  filename?: string
): boolean {
  if (!conflicts?.length) return false;
  
  type ConflictRow = { name?: string; dob?: string; fide_id?: string; sno?: string; rank?: number; rating?: number };
  const rows = conflicts.map(c => ({
    KeyKind: c.keyKind,
    Key: c.key,
    Reason: c.reason,
    NameA: (c.a as ConflictRow)?.name ?? '',
    DobA: (c.a as ConflictRow)?.dob ?? '',
    FideA: (c.a as ConflictRow)?.fide_id ?? '',
    SNoA: (c.a as ConflictRow)?.sno ?? '',
    RankA: (c.a as ConflictRow)?.rank ?? '',
    RatingA: (c.a as ConflictRow)?.rating ?? '',
    NameB: (c.b as ConflictRow)?.name ?? '',
    DobB: (c.b as ConflictRow)?.dob ?? '',
    FideB: (c.b as ConflictRow)?.fide_id ?? '',
    SNoB: (c.b as ConflictRow)?.sno ?? '',
    RankB: (c.b as ConflictRow)?.rank ?? '',
    RatingB: (c.b as ConflictRow)?.rating ?? '',
  }));

  const today = new Date().toISOString().slice(0, 10);
  const fallback = `conflicts_${today}.xlsx`;
  const safeFilename = sanitizeFilename(filename || fallback);
  
  return downloadWorkbookXlsx(safeFilename, { Conflicts: rows });
}

/**
 * Download cleaned/normalized player data as Excel (.xlsx)
 * Exports post-mapping, normalized rows (state extracted, DOB normalized, rank gaps filled)
 */
export function downloadCleanedPlayersXlsx(
  players: Array<Record<string, unknown>>,
  tournamentSlug?: string | null
): boolean {
  if (!players || players.length === 0) {
    console.warn('[excel] No players to export');
    return false;
  }

  const now = new Date();
  const slug = sanitizeSlug(tournamentSlug);
  const timestamp = formatIstTimestampForFile(now);

  // Friendly column headers matching DB field names
  const headers = [
    'rank',
    'sno',
    'name',
    'rating',
    'unrated',
    'dob',
    'dob_raw',
    'gender',
    'fide_id',
    'federation',
    'state',
    'city',
    'club',
    'disability',
    'special_notes'
  ];

  const rows = players.map(player => {
    const dobDate = toExcelDate(player.dob as string | undefined);
    
    return [
      player.rank != null ? Number(player.rank) : null,
      player.sno != null && player.sno !== '' ? Number(player.sno) : null,
      getPlayerDisplayName(player as { full_name?: string | null; name?: string | null }),
      player.rating != null && player.rating !== '' ? Number(player.rating) : null,
      player.unrated != null ? Boolean(player.unrated) : null,
      dobDate,
      player.dob_raw ?? player.dob ?? null,
      player.gender ?? null,
      player.fide_id ?? null,
      player.federation ?? null,
      player.state ?? null,
      player.city ?? null,
      player.club ?? null,
      player.disability ?? null,
      player.special_notes ?? null
    ];
  });

  const worksheetData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);

  // Apply date format for DOB column (column F)
  for (let r = 1; r < worksheetData.length; r++) {
    const cellAddress = XLSX.utils.encode_cell({ c: 5, r });
    const cell = ws[cellAddress];
    if (cell && cell.v instanceof Date) {
      cell.z = 'yyyy-mm-dd';
    }
  }

  // Set column widths
  (ws as unknown)['!cols'] = [
    { wch: 6 },  // rank
    { wch: 6 },  // sno
    { wch: 28 }, // name
    { wch: 8 },  // rating
    { wch: 9 },  // unrated
    { wch: 12 }, // dob
    { wch: 14 }, // dob_raw
    { wch: 8 },  // gender
    { wch: 14 }, // fide_id
    { wch: 11 }, // federation
    { wch: 10 }, // state
    { wch: 16 }, // city
    { wch: 20 }, // club
    { wch: 14 }, // disability
    { wch: 30 }  // special_notes
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Players');

  const filename = `${slug}-cleaned_${timestamp}.xlsx`;
  XLSX.writeFile(wb, filename);

  console.log(`[export.xlsx] rows=${players.length} columns=${headers.length}`);
  console.log('[excel] Cleaned players workbook downloaded:', filename);
  return true;
}
