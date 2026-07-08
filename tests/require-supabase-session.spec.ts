import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockRefreshSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRefreshSession: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      refreshSession: mockRefreshSession,
    },
  },
}));

const makeSession = (accessToken: string) => ({
  access_token: accessToken,
  refresh_token: 'refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'user-id', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' },
});

describe('requireSupabaseSession', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRefreshSession.mockReset();
  });

  it('returns ok when an active session exists', async () => {
    const session = makeSession('active-token');
    mockGetSession.mockResolvedValue({ data: { session }, error: null });

    const { requireSupabaseSession } = await import('@/lib/auth/requireSupabaseSession');
    const result = await requireSupabaseSession();

    expect(result).toEqual({ ok: true, session, accessToken: 'active-token' });
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('refreshes once when the initial session is missing', async () => {
    const refreshedSession = makeSession('refreshed-token');
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockRefreshSession.mockResolvedValue({ data: { session: refreshedSession }, error: null });

    const { requireSupabaseSession } = await import('@/lib/auth/requireSupabaseSession');
    const result = await requireSupabaseSession();

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, session: refreshedSession, accessToken: 'refreshed-token' });
  });

  it('returns AUTH_SESSION_REQUIRED when refresh does not produce a session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockRefreshSession.mockResolvedValue({ data: { session: null }, error: null });

    const { requireSupabaseSession } = await import('@/lib/auth/requireSupabaseSession');
    const result = await requireSupabaseSession();

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      errorCode: 'AUTH_SESSION_REQUIRED',
      message: 'Your session expired. Please sign in again.',
    });
  });
});
