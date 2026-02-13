import { describe, expect, it } from 'vitest';

import { buildExportFilenameSlug } from './exportSlug';

describe('buildExportFilenameSlug', () => {
  it('matches existing filename slug sanitization behavior', () => {
    expect(buildExportFilenameSlug('My Tournament 2026!')).toBe('my-tournament-2026');
    expect(buildExportFilenameSlug('---Already-Slug---')).toBe('already-slug');
    expect(buildExportFilenameSlug('')).toBe('tournament');
    expect(buildExportFilenameSlug('A'.repeat(50))).toBe('a'.repeat(40));
  });
});
