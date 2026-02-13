/**
 * Build a safe slug for export filenames.
 *
 * Intentionally mirrors existing behavior used by export utilities.
 */
export function buildExportFilenameSlug(input: string): string {
  return (input || 'tournament')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

