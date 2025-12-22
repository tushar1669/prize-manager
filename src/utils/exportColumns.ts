export type ExportColumn<T> = {
  key: string;
  label: string;
  value: (row: T) => unknown;
};

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

export function filterEmptyColumns<T>(rows: T[], columns: ExportColumn<T>[]): ExportColumn<T>[] {
  if (!rows.length) return columns;
  return columns.filter(column => rows.some(row => !isEmptyValue(column.value(row))));
}

export function formatExportValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return String(value);
}
