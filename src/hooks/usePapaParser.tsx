import { useCallback } from "react";
import Papa from "papaparse";

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
  
  return { parseCSV };
}
