import { describe, expect, it } from 'vitest';
import { buildSupabasePlayerPayload } from '@/utils/playerImportPayload';

describe('buildSupabasePlayerPayload full_name handling', () => {
  it('prefers full_name when both full and short names are provided', () => {
    const payload = buildSupabasePlayerPayload(
      {
        rank: 1,
        name: 'T. Prakhar',
        full_name: 'Tarun Prakhar',
        tags_json: {},
        warnings_json: {},
        _originalIndex: 1,
      } as any,
      'tournament-id'
    );

    expect(payload.name).toBe('T. Prakhar');
    expect(payload.full_name).toBe('Tarun Prakhar');
  });

  it('falls back to name when full_name is missing', () => {
    const payload = buildSupabasePlayerPayload(
      {
        rank: 2,
        name: 'Only Short',
        tags_json: {},
        warnings_json: {},
        _originalIndex: 2,
      } as any,
      'tournament-id'
    );

    expect(payload.full_name).toBe('Only Short');
  });
});
