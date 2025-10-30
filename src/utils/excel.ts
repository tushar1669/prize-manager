// src/utils/excel.ts
// Excel template and error export utilities for player import

import * as XLSX from 'xlsx';

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
  (wsPlayers as any)['!cols'] = [
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
  (wsPlayers as any)['!freeze'] = { xSplit: 0, ySplit: 1 };
  (wsPlayers as any)['!autofilter'] = { ref: 'A1:L1' };

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
  (wsReadme as any)['!cols'] = [
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
 * Download errors as Excel workbook
 */
export function downloadErrorXlsx(rows: Array<{ 
  row: number; 
  error: string 
} & Record<string, any>>) {
  if (rows.length === 0) return;

  // Collect all unique columns from error rows
  const allKeys = new Set<string>(['row', 'error']);
  rows.forEach(r => {
    Object.keys(r).forEach(k => allKeys.add(k));
  });

  const headers = Array.from(allKeys);
  const data = [
    headers,
    ...rows.map(r => headers.map(h => r[h] ?? ''))
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // Auto-size columns
  const maxWidths = headers.map((h, idx) => {
    const colData = data.map(row => String(row[idx] || ''));
    const maxLen = Math.max(...colData.map(s => s.length));
    return { wch: Math.min(maxLen + 2, 50) }; // Cap at 50 chars
  });
  (ws as any)['!cols'] = maxWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Errors');
  XLSX.writeFile(wb, `import_errors_${Date.now()}.xlsx`);
  
  console.log('[import] Error Excel downloaded:', rows.length, 'rows');
}
