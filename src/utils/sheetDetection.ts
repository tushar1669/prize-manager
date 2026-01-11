// src/utils/sheetDetection.ts
// Multi-sheet header detection for Swiss-Manager files

/**
 * Make headers unique by appending (2), (3), etc. for duplicates.
 * Empty cells get __EMPTY_COL_X placeholders.
 * 
 * This is critical for Swiss-Manager files which often have duplicate "Name" columns.
 * Without deduplication, sheet_to_json() will overwrite values from the first column
 * with the second, causing data loss.
 */
export function withUniqueHeaders(row: unknown[]): string[] {
  const seen = new Map<string, number>();
  return row.map((cell, idx) => {
    const normalized = String(cell ?? '').trim();
    if (normalized.length === 0) {
      return `__EMPTY_COL_${idx}`;
    }
    
    const count = seen.get(normalized) ?? 0;
    seen.set(normalized, count + 1);
    
    if (count === 0) {
      return normalized;
    }
    // Append (2), (3), etc. for duplicates
    return `${normalized} (${count + 1})`;
  });
}

export interface DetectedHeader {
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  confidence: number;
  candidateRows: Array<{ rowIndex: number; score: number; headers: string[] }>;
}

/**
 * Normalize cell content for header detection
 * Handles NBSP, whitespace, control chars, case normalization
 */
function normalizeCell(cell: unknown): string {
  return String(cell || '')
    .trim()
    .replace(/\u00A0/g, ' ') // NBSP → space
    .replace(/\s+/g, '_')     // Collapse whitespace to underscore
    .replace(/[^a-z0-9_]/gi, '') // Drop special chars (keep alphanumeric + underscore)
    .toLowerCase();
}

/**
 * Score a row for likelihood of being a header row
 * Higher score = more likely to be header row
 */
export function scoreHeaderRow(row: unknown[]): number {
  const normalized = row.map(normalizeCell);
  
  let score = 0;
  
  // Core fields (must have at least 2) - 10 points each
  const coreFields = ['rank', 'name', 'sno', 'rtg', 'irtg', 'rating', 'birth', 'dob'];
  const coreHits = coreFields.filter(field =>
    normalized.some(cell => cell.includes(field))
  );
  score += coreHits.length * 10;
  
  // Secondary fields - 3 points each
  const secondaryFields = ['fide', 'gender', 'fed', 'club', 'state', 'city'];
  const secondaryHits = secondaryFields.filter(field =>
    normalized.some(cell => cell.includes(field))
  );
  score += secondaryHits.length * 3;
  
  // Penalties for obvious non-header patterns
  
  // Penalty for year-like values (e.g., "2014", "2025") - likely data row
  if (normalized.some(cell => /^\d{4}$/.test(cell))) {
    score -= 20;
  }
  
  // Penalty for large numbers (>100) - likely data row
  const hasLargeNumbers = row.some(cell => {
    const num = parseFloat(String(cell || ''));
    return !isNaN(num) && num > 100;
  });
  if (hasLargeNumbers) {
    score -= 10;
  }
  
  // Penalty for rows with mostly empty cells
  const nonEmptyCells = row.filter(cell => String(cell || '').trim() !== '').length;
  if (nonEmptyCells < 3) {
    score -= 15;
  }
  
  // Bonus for having typical Swiss-Manager header markers
  if (normalized.some(cell => cell === 'rank')) score += 5;
  if (normalized.some(cell => cell === 'sno' || cell === 'startno')) score += 5;
  if (normalized.some(cell => cell === 'rtg')) score += 5;
  
  return score;
}

/**
 * Detect the header row across all sheets in a workbook
 * Scans first maxRowsToScan rows of each sheet
 */
export function detectHeaderRow(
  sheets: Record<string, unknown[][]>,
  maxRowsToScan: number = 25
): DetectedHeader {
  const candidates: Array<{
    sheetName: string;
    rowIndex: number;
    score: number;
    headers: string[];
  }> = [];
  
  // Scan all sheets
  for (const [sheetName, rows] of Object.entries(sheets)) {
    if (!rows || rows.length === 0) continue;
    
    const scanLimit = Math.min(maxRowsToScan, rows.length);
    
    for (let i = 0; i < scanLimit; i++) {
      const row = rows[i];
      if (!row || row.length < 3) continue; // Skip sparse rows
      
      const score = scoreHeaderRow(row);
      
      // Only consider rows with positive score (threshold: 15 = ~2 core fields)
      if (score > 15) {
        // Use withUniqueHeaders to deduplicate duplicate column names (e.g., "Name", "Name")
        // This prevents sheet_to_json from overwriting first "Name" with second
        const headers = withUniqueHeaders(row);
        
        candidates.push({
          sheetName,
          rowIndex: i,
          score,
          headers
        });
      }
    }
  }
  
  // Sort by score DESC
  candidates.sort((a, b) => b.score - a.score);
  
  if (candidates.length === 0) {
    throw new Error(
      'No valid header row found. Please ensure the file contains player data with Rank and Name columns.'
    );
  }
  
  const best = candidates[0];
  
  console.log('[sheetDetection] Scanned', Object.keys(sheets).length, 'sheets');
  console.log('[sheetDetection] Top candidate:', {
    sheet: best.sheetName,
    row: best.rowIndex,
    score: best.score,
    headers: best.headers.slice(0, 10)
  });
  
  return {
    sheetName: best.sheetName,
    headerRowIndex: best.rowIndex,
    headers: best.headers,
    confidence: best.score,
    candidateRows: candidates.slice(0, 3) // Top 3 for debugging
  };
}
