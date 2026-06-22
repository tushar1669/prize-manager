import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import { downloadPlayersTemplateXlsx } from '@/utils/excel';

describe('downloadPlayersTemplateXlsx', () => {
  let captured: XLSX.WorkBook | null = null;
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captured = null;
    writeSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation((wb) => {
      captured = wb as XLSX.WorkBook;
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('Players sheet exposes the canonical 16-column header set in order', () => {
    downloadPlayersTemplateXlsx();
    expect(captured).not.toBeNull();
    const wb = captured!;
    const ws = wb.Sheets['Players'];
    expect(ws).toBeTruthy();
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    expect(rows[0]).toEqual([
      'Rank', 'SNo.', 'Name', 'Rtg', 'Unrated', 'Birth', 'Gender',
      'Fide-No.', 'Federation', 'State', 'City', 'Club',
      'Type', 'Disability', 'Ident', 'Gr',
    ]);
  });
});
