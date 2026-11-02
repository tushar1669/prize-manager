/**
 * supabase.functions.invoke reports any non-2xx reply as a generic
 * "Edge Function returned a non-2xx status code". The finalize function sends
 * a plain-language `hint` (e.g. "Run allocation before finalizing"); show
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
