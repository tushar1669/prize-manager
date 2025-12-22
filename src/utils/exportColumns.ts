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

function escapeCsvValue(value: string): string {
  if (value.includes('"')) {
    value = value.replace(/"/g, '""');
  }
  if (/[",\n\r]/.test(value)) {
    return `"${value}"`;
  }
  return value;
}

export function buildCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const header = columns.map(column => escapeCsvValue(column.label)).join(',');
  const lines = rows.map(row =>
    columns
      .map(column => escapeCsvValue(formatExportValue(column.value(row))))
      .join(',')
  );
  return [header, ...lines].join('\n');
}

export function downloadCsvFile(filename: string, csvContent: string) {
  const blob = new Blob(["\uFEFF", csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
