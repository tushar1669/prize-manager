import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type RequireSupabaseSessionResult =
  | { ok: true; session: Session; accessToken: string }
  | {
      ok: false;
      errorCode: 'AUTH_SESSION_REQUIRED';
      message: 'Your session expired. Please sign in again.';
    };

const SESSION_REQUIRED_RESULT = {
  ok: false,
  errorCode: 'AUTH_SESSION_REQUIRED',
  message: 'Your session expired. Please sign in again.',
} as const;

export async function requireSupabaseSession(): Promise<RequireSupabaseSessionResult> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (session?.access_token) {
    return { ok: true, session, accessToken: session.access_token };
  }

  const { data: refreshedData } = await supabase.auth.refreshSession();
  const refreshedSession = refreshedData.session;

  if (refreshedSession?.access_token) {
    return {
      ok: true,
      session: refreshedSession,
      accessToken: refreshedSession.access_token,
    };
  }

  return SESSION_REQUIRED_RESULT;
}
