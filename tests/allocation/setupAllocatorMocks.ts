import { vi } from 'vitest';

vi.mock('npm:@supabase/supabase-js@2', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(async () => ({ data: [], error: null })),
      update: vi.fn(async () => ({ data: [], error: null })),
      insert: vi.fn(async () => ({ data: [], error: null })),
    })),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
  })),
}));
