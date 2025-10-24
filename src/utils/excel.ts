// src/utils/excel.ts
// Excel template and error export utilities for player import

import * as XLSX from 'xlsx';

/**
 * Download Excel template with sample player data
 */
export function downloadPlayersTemplateXlsx() {
  const headers = [
    'rank', 'name', 'rating', 'dob', 'gender', 
    'state', 'city', 'club', 'disability', 'special_notes', 'fide_id'
  ];
  
  const sample = [
    [1, 'Aditi Sharma', 1850, '2007-03-17', 'F', 'MH', 'Mumbai', 'Mumbai Chess Club', '', '', ''],
    [2, 'Rohan Iyer', 1720, '2005-11-02', 'M', 'KA', 'Bengaluru', 'Karnataka CA', 'Hearing', 'Front row seat', '5678901'],
    [3, 'Sia Verma', 1500, '2010-08-25', 'F', 'DL', 'New Delhi', '', '', 'Vegetarian lunch', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  
  // Column widths
  (ws as any)['!cols'] = [
    { wch: 6 },  // rank
    { wch: 22 }, // name
    { wch: 8 },  // rating
    { wch: 12 }, // dob
    { wch: 6 },  // gender
    { wch: 6 },  // state
    { wch: 16 }, // city
    { wch: 20 }, // club
    { wch: 12 }, // disability
    { wch: 24 }, // special_notes
    { wch: 12 }  // fide_id
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Players');
  XLSX.writeFile(wb, 'players_template.xlsx');
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
