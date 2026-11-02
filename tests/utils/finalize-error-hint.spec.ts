import { describe, expect, it } from 'vitest';
import { finalizeErrorWithHint } from '@/utils/finalizeError';

const httpError = (body: unknown) => Object.assign(new Error('Edge Function returned a non-2xx status code'), {
  context: new Response(JSON.stringify(body), { status: 409 }),
});

describe('finalize errors show the server explanation, not a generic status code', () => {
  it('uses the hint', async () => {
    const err = await finalizeErrorWithHint(httpError({ error: 'No allocations to finalize', hint: 'Run allocation before finalizing' }));
    expect(err.message).toBe('Run allocation before finalizing');
    expect((err as Error & { code?: string }).code).toBe('No allocations to finalize');
  });
  it('keeps the original error when there is no hint', async () => {
    const original = httpError({ error: 'x' });
    expect(await finalizeErrorWithHint(original)).toBe(original);
    const plain = new Error('network');
    expect(await finalizeErrorWithHint(plain)).toBe(plain);
  });
});
