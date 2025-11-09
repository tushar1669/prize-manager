import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { utils, write } from 'xlsx';

export function writeXlsxTmp(
  name: string,
  headers: string[],
  rows: (string | number | null)[][],
): string {
  const workbook = utils.book_new();
  const worksheet = utils.aoa_to_sheet([headers, ...rows]);
  utils.book_append_sheet(workbook, worksheet, 'Players');

  const buffer = write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const filename = `${name}-${Date.now()}.xlsx`;
  const filePath = path.join(os.tmpdir(), filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
