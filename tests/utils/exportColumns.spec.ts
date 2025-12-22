import { describe, expect, it } from 'vitest';
import { filterEmptyColumns, type ExportColumn } from '@/utils/exportColumns';

type Row = {
  name?: string | null;
  nickname?: string | null;
  rating?: number | null;
};

describe('filterEmptyColumns', () => {
  it('removes columns where all values are empty', () => {
    const rows: Row[] = [
      { name: 'Aditi', nickname: '', rating: null },
      { name: 'Rohan', nickname: '  ', rating: undefined },
    ];

    const columns: ExportColumn<Row>[] = [
      { key: 'name', label: 'Name', value: row => row.name },
      { key: 'nickname', label: 'Nickname', value: row => row.nickname },
      { key: 'rating', label: 'Rating', value: row => row.rating },
    ];

    const filtered = filterEmptyColumns(rows, columns);

    expect(filtered.map(col => col.key)).toEqual(['name']);
  });

  it('keeps columns with at least one non-empty value', () => {
    const rows: Row[] = [
      { name: 'Aditi', nickname: '', rating: null },
      { name: 'Rohan', nickname: 'Ace', rating: undefined },
    ];

    const columns: ExportColumn<Row>[] = [
      { key: 'name', label: 'Name', value: row => row.name },
      { key: 'nickname', label: 'Nickname', value: row => row.nickname },
      { key: 'rating', label: 'Rating', value: row => row.rating },
    ];

    const filtered = filterEmptyColumns(rows, columns);

    expect(filtered.map(col => col.key)).toEqual(['name', 'nickname']);
  });

  it('removes empty location columns from exports', () => {
    type LocationRow = {
      name: string;
      state?: string | null;
      city?: string | null;
      club?: string | null;
    };

    const rows: LocationRow[] = [
      { name: 'Asha', state: '', city: ' ', club: null },
      { name: 'Dev', state: undefined, city: '', club: '' },
    ];

    const columns: ExportColumn<LocationRow>[] = [
      { key: 'name', label: 'Name', value: row => row.name },
      { key: 'state', label: 'State', value: row => row.state },
      { key: 'city', label: 'City', value: row => row.city },
      { key: 'club', label: 'Club', value: row => row.club },
    ];

    const filtered = filterEmptyColumns(rows, columns);

    expect(filtered.map(col => col.key)).toEqual(['name']);
  });
});
