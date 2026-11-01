/**
 * supabase.functions.invoke reports any non-2xx reply as a generic
 * "Edge Function returned a non-2xx status code". The finalize function sends
 * a plain-language `hint` (e.g. "This tournament uses Team Prizes V2…"); show
 * that instead. Falls back to the original error when the body has no hint.
 */
export async function finalizeErrorWithHint(error: unknown): Promise<Error> {
  const context = error && typeof error === 'object' ? (error as { context?: unknown }).context : undefined;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body && typeof body.hint === 'string' && body.hint.trim()) {
        const wrapped = new Error(body.hint.trim());
        (wrapped as Error & { code?: string; context?: unknown }).code = typeof body.error === 'string' ? body.error : undefined;
        (wrapped as Error & { context?: unknown }).context = { body };
        return wrapped;
      }
    } catch {
      /* not JSON: keep the original error */
    }
  }
  return error instanceof Error ? error : new Error('Failed to finalize allocations');
}

/**
 * The newest saved allocation version of a tournament, with its row count.
 * Used for Team V2 tournaments, whose versions are written by Team V2 Save.
 */
export async function latestSavedAllocationVersion(
  tournamentId: string | undefined,
): Promise<{ version: number; allocationsCount: number } | null> {
  if (!tournamentId) return null;
  const { supabase } = await import('@/integrations/supabase/client');
  const { data, error } = await supabase.from('allocations').select('version')
    .eq('tournament_id', tournamentId).order('version', { ascending: false }).limit(1).maybeSingle();
  if (error || !data || typeof data.version !== 'number') return null;
  const { count, error: countError } = await supabase.from('allocations')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId).eq('version', data.version);
  if (countError) return null;
  return { version: data.version, allocationsCount: count ?? 0 };
}
