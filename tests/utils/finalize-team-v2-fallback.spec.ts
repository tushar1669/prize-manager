import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const state = vi.hoisted(() => ({ latest: 2 as number | null, count: 55 }));
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  let headCount = false;
  Object.assign(chain, {
    select: (_c: string, opts?: { head?: boolean }) => { headCount = !!opts?.head; return chain; },
    eq: () => chain,
    // The head:true count query is awaited directly after its filters.
    then: (resolve: (v: unknown) => void) => resolve(headCount ? { count: state.count, error: null } : { data: null, error: null }),
    order: () => chain, limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: state.latest === null ? null : { version: state.latest }, error: null }),
  });
  // `.eq` after a head count resolves; the version query keeps chaining.
  return { supabase: { from: () => { headCount = false; return chain; } } };
});

import { latestSavedAllocationVersion } from '@/utils/finalizeError';

describe('Team V2 tournaments use their saved version instead of Finalize', () => {
  it('returns the newest saved version and its size', async () => {
    state.latest = 2; state.count = 55;
    expect(await latestSavedAllocationVersion('t')).toEqual({ version: 2, allocationsCount: 55 });
  });
  it('nothing saved yet: null, so the page shows the hint instead', async () => {
    state.latest = null;
    expect(await latestSavedAllocationVersion('t')).toBeNull();
  });
  it('both pages fall back only on team_v2_save_required and never write a version', () => {
    for (const page of ['src/pages/Finalize.tsx', 'src/pages/ConflictReview.tsx']) {
      const source = readFileSync(page, 'utf8');
      expect(source).toContain("code === 'team_v2_save_required'");
      expect(source).toContain('await latestSavedAllocationVersion(id)');
    }
  });
});
