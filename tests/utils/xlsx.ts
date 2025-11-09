import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as XLSX from 'xlsx';

/** Create a temporary .xlsx file from a 2D array; returns absolute path. */
export function makeXlsxTmp(rows: (string|number|null)[][], sheetName = 'Players', filename = 'fixture.xlsx'): string {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsx-'));
  const fp = path.join(tmpDir, filename);
  fs.writeFileSync(fp, buf);
  return fp;
}
