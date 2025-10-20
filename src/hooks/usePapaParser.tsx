import { useCallback } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export function usePapaParser() {
  const parseCSV = useCallback((file: File): Promise<{ data: any[], headers: string[] }> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          resolve({ 
            data: results.data, 
            headers: results.meta.fields || [] 
          });
        },
        error: (error) => reject(error)
      });
    });
  }, []);
  
  const parseExcel = useCallback(async (file: File): Promise<{ data: any[]; headers: string[] }> => {
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: "array" });
    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
    const headerRow = (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] as string[]) || Object.keys(rows[0] || {});
    return { data: rows, headers: headerRow };
  }, []);

  const parseFile = useCallback((file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) return parseCSV(file);
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseExcel(file);
    return Promise.reject(new Error("Unsupported file type. Upload CSV or Excel (.xls/.xlsx)."));
  }, [parseCSV, parseExcel]);

  return { parseCSV, parseExcel, parseFile };
}
