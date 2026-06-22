import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';

const captured: { wb: XLSX.WorkBook | null } = { wb: null };

vi.mock('xlsx', async () => {
  const actual = await vi.importActual<typeof import('xlsx')>('xlsx');
  return {
    ...actual,
    default: actual,
    writeFile: (wb: XLSX.WorkBook) => {
      captured.wb = wb;
    },
  };
});

import { downloadPlayersTemplateXlsx } from '@/utils/excel';

describe('downloadPlayersTemplateXlsx', () => {
  it('Players sheet exposes the canonical 16-column header set in order', () => {
    downloadPlayersTemplateXlsx();
    expect(captured.wb).not.toBeNull();
    const ws = captured.wb!.Sheets['Players'];
    expect(ws).toBeTruthy();
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    expect(rows[0]).toEqual([
      'Rank', 'SNo.', 'Name', 'Rtg', 'Unrated', 'Birth', 'Gender',
      'Fide-No.', 'Federation', 'State', 'City', 'Club',
      'Type', 'Disability', 'Ident', 'Gr',
    ]);
  });
});
