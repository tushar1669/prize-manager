import { describe, expect, it } from 'vitest';
import { finalizeErrorWithHint } from '@/utils/finalizeError';

const httpError = (body: unknown) => Object.assign(new Error('Edge Function returned a non-2xx status code'), {
  context: new Response(JSON.stringify(body), { status: 409 }),
});

describe('finalize errors show the server explanation, not a generic status code', () => {
  it('uses the hint', async () => {
    const err = await finalizeErrorWithHint(httpError({ error: 'team_v2_save_required', hint: 'This tournament uses Team Prizes V2.' }));
    expect(err.message).toBe('This tournament uses Team Prizes V2.');
    expect((err as Error & { code?: string }).code).toBe('team_v2_save_required');
  });
  it('keeps the original error when there is no hint', async () => {
    const original = httpError({ error: 'x' });
    expect(await finalizeErrorWithHint(original)).toBe(original);
    const plain = new Error('network');
    expect(await finalizeErrorWithHint(plain)).toBe(plain);
  });
});
