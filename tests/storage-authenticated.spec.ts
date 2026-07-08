import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
}));

describe('uploadFileAuthenticated', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('builds a storage upload request with the bearer token and upsert header', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ Key: 'brochures/tournament id/file.pdf' }),
    });

    const { uploadFileAuthenticated } = await import('@/lib/storageAuthenticated');
    const file = new File(['pdf'], 'file.pdf', { type: 'application/pdf' });
    const result = await uploadFileAuthenticated('brochures', 'tournament id/file.pdf', file, 'user-access-token');

    expect(result).toEqual({ path: 'tournament id/file.pdf', error: null });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://project.supabase.co/storage/v1/object/brochures/tournament%20id/file.pdf',
      expect.objectContaining({
        method: 'POST',
        body: file,
        headers: expect.objectContaining({
          Authorization: 'Bearer user-access-token',
          apikey: 'publishable-key',
          'content-type': 'application/pdf',
          'cache-control': '3600',
          'x-upsert': 'true',
        }),
      })
    );
  });

  it('does not upload without an access token', async () => {
    const { uploadFileAuthenticated } = await import('@/lib/storageAuthenticated');
    const file = new File(['pdf'], 'file.pdf', { type: 'application/pdf' });
    const result = await uploadFileAuthenticated('brochures', 'tournament/file.pdf', file, '');

    expect(result.path).toBeNull();
    expect(result.error?.message).toBe('Authenticated upload requires an active session');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses octet-stream when the file does not provide a content type', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const { uploadFileAuthenticated } = await import('@/lib/storageAuthenticated');
    const file = new File(['pdf'], 'file.pdf');
    await uploadFileAuthenticated('brochures', 'tournament/file.pdf', file, 'user-access-token');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'content-type': 'application/octet-stream',
        }),
      })
    );
  });
});
