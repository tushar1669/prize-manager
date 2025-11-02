import { useCallback } from "react";
import * as XLSX from "xlsx";
import { detectHeaderRow } from "@/utils/sheetDetection";
import { isFeatureEnabled } from "@/utils/featureFlags";
import { computeSHA256Hex } from "@/utils/hash";

type Parsed = {
  data: any[];
  headers: string[];
  sheetName?: string;
  headerRow?: number;
  fileHash?: string | null;
};

function normalizeHeaders(headers: any[]): string[] {
  return (headers || [])
    .map(h => String(h ?? '').trim())
    .filter(h => h.length > 0);
}

export function useExcelParser() {
  const parseExcel = useCallback(async (file: File): Promise<Parsed> => {
    try {
      const ab = await file.arrayBuffer();
      let fileHash: string | null = null;
      try {
        fileHash = await computeSHA256Hex(ab);
      } catch (hashErr) {
        console.warn('[parseExcel] hash failed', hashErr);
      }
      const wb = XLSX.read(ab, { type: 'array' });
      
      console.log('[parseExcel] Available sheets:', wb.SheetNames);
      
      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        throw new Error('No sheets found in this workbook.');
      }
      
      // Phase 1: Multi-sheet header detection (feature flag controlled)
      let wsName: string;
      let headerRowIndex: number;
      let headers: string[];
      
      if (isFeatureEnabled('HEADER_DETECTION')) {
        // V2: Auto-detect header row across all sheets (Swiss-Manager support)
        const allSheets: Record<string, any[][]> = {};
        wb.SheetNames.forEach(name => {
          allSheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { 
            header: 1, 
            defval: '', 
            raw: false 
          }) as any[][];
        });
        
        const detected = detectHeaderRow(allSheets, 25);
        wsName = detected.sheetName;
        headerRowIndex = detected.headerRowIndex;
        headers = detected.headers;
        
        console.log(`[detect] headerRow=${headerRowIndex + 1} sheet=${wsName}`);
        console.log('[parseExcel] V2 Header detection:', {
          sheet: wsName,
          row: headerRowIndex,
          confidence: detected.confidence,
          headers: headers.slice(0, 10)
        });
      } else {
        // V1: Legacy behavior (row 1 as header)
        wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const asRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
        
        if (!asRows.length || !asRows[0]) {
          throw new Error('No header row found. Please use the provided template and ensure row 1 has headers.');
        }
        
        headerRowIndex = 0;
        headers = normalizeHeaders(asRows[0]);
        
        console.log(`[detect] headerRow=1 sheet=${wsName} (legacy)`);
        console.log('[parseExcel] V1 Legacy mode (row 1):', headers);
      }
      
      if (!headers.length) {
        throw new Error('Could not detect any headers. Please verify the template.');
      }
      
      const ws = wb.Sheets[wsName];
      
      // Parse data starting AFTER the detected header row
      const data = XLSX.utils.sheet_to_json(ws, {
        header: headers,
        range: headerRowIndex + 1, // Start after header row
        defval: ''
      });

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('No data rows found under the header row. Please ensure your data follows the header.');
      }
      
      console.log('[parseExcel] Parsed', data.length, 'data rows');
      console.log('[parseExcel] Sample row:', data[0]);

      return { 
        data, 
        headers, 
        sheetName: wsName,
        headerRow: headerRowIndex + 1,
        fileHash
      };
    } catch (err) {
      console.error('[parseExcel] Parse error:', err);
      throw new Error(`Parse error: ${err instanceof Error ? err.message : 'Unknown error reading Excel file'}`);
    }
  }, []);

  const parseFile = useCallback((file: File): Promise<Parsed> => {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.csv')) {
      return Promise.reject(new Error('Please upload Excel (.xlsx or .xls). CSV files are not supported.'));
    }
    if (name.endsWith('.xls') || name.endsWith('.xlsx')) return parseExcel(file);
    return Promise.reject(new Error('Unsupported file type. Please upload Excel (.xls or .xlsx).'));
  }, [parseExcel]);

  return { parseFile };
}
