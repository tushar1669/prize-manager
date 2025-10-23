import { useCallback } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type Parsed = { data: any[]; headers: string[] };

function normalizeHeaders(headers: any[]): string[] {
  return (headers || [])
    .map(h => String(h ?? '').trim())
    .filter(h => h.length > 0);
}

export function usePapaParser() {
  const parseCSV = useCallback((file: File): Promise<Parsed> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          const headers = normalizeHeaders(results.meta.fields || []);
          resolve({ data: results.data as any[], headers });
        },
        error: (err) => reject(err)
      });
    });
  }, []);

  const parseExcel = useCallback(async (file: File): Promise<Parsed> => {
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: 'array' });
      
      // 🔍 DIAGNOSTIC: Log available sheets
      console.log('[parseExcel] Available sheets:', wb.SheetNames);
      
      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        throw new Error('No sheets found in this workbook.');
      }
      
      const wsName = wb.SheetNames[0];
      console.log('[parseExcel] Selected sheet:', wsName);
      
      const ws = wb.Sheets[wsName];

      // Get first row as headers
      const asRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
      
      // 🔍 DIAGNOSTIC: Log raw first row
      console.log('[parseExcel] Raw first row:', asRows[0]);
      
      if (!asRows.length || !asRows[0] || (Array.isArray(asRows[0]) && asRows[0].every((c: any) => String(c ?? '').trim() === ''))) {
        throw new Error('No header row found. Please use the provided template and ensure row 1 has headers.');
      }
      
      const headers = normalizeHeaders(asRows[0] || []);
      
      // 🔍 DIAGNOSTIC: Log normalized headers
      console.log('[parseExcel] Normalized headers:', headers);
      
      if (!headers.length) {
        throw new Error('Could not detect any headers. Please verify the template.');
      }

      // Get data as objects using inferred headers
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
      
      // 🔍 DIAGNOSTIC: Log first 3 data rows
      console.log('[parseExcel] First 3 data rows:', data.slice(0, 3));
      console.log('[parseExcel] Total rows:', data.length);

      return { data, headers };
    } catch (err) {
      console.error('[parseExcel] XLSX.read error:', err);
      throw new Error(`Parse error: ${err instanceof Error ? err.message : 'Unknown error reading Excel file'}`);
    }
  }, []);

  const parseFile = useCallback((file: File): Promise<Parsed> => {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.csv')) {
      return Promise.reject(new Error('CSV is temporarily disabled. Please upload an Excel (.xls/.xlsx) file.'));
    }
    if (name.endsWith('.xls') || name.endsWith('.xlsx')) return parseExcel(file);
    return Promise.reject(new Error('Unsupported file type. Please upload Excel (.xls/.xlsx).'));
  }, [parseExcel]);

  return { parseFile };
}
