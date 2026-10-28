import { readFileSync } from 'node:fs';

export type QaBackendConfig = {
  configuredUrl: string;
  expectedQaUrl?: string;
  email?: string;
  password?: string;
  productionUrl: string;
};

function validBackendUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co') &&
      url.pathname === '/' && !url.search && !url.hash;
  } catch {
    return false;
  }
}

/** Authenticated browser tests must never silently point to Prize Manager production. */
export function qaBackendProblems(input: QaBackendConfig): string[] {
  const problems: string[] = [];
  const expected = input.expectedQaUrl?.trim() ?? '';
  if (!expected || !validBackendUrl(expected)) {
    problems.push('PLAYWRIGHT_QA_SUPABASE_URL must identify a dedicated HTTPS Supabase QA project');
  }
  if (!input.email?.trim() || !input.password?.trim() ||
      input.email === 'test@example.com' || input.password === 'testpassword123' ||
      input.password === 'password123') {
    problems.push('dedicated PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD are required');
  }
  if (!input.configuredUrl || !validBackendUrl(input.configuredUrl)) {
    problems.push('the app Supabase backend must be resolved and explicitly validated');
  }
  if (expected === input.productionUrl || input.configuredUrl === input.productionUrl) {
    problems.push('authenticated QA is prohibited against the production Supabase project');
  }
  if (expected && input.configuredUrl !== expected) {
    problems.push('the app backend differs from PLAYWRIGHT_QA_SUPABASE_URL (the client is currently hardcoded)');
  }
  return problems;
}

/**
 * Synchronous preflight: throw BEFORE opening /auth or creating accounts/tournaments.
 * This project currently compiles its Supabase endpoint from a generated source constant,
 * not a VITE_ environment variable. An env var alone does not redirect requests to QA.
 */
export function assertIsolatedQaBackend(): void {
  const clientSource = readFileSync(new URL('../../src/integrations/supabase/client.ts', import.meta.url), 'utf8');
  const configuredUrl = /export const SUPABASE_URL\s*=\s*["']([^"']+)["']/.exec(clientSource)?.[1] ?? '';
  const problems = qaBackendProblems({
    configuredUrl,
    expectedQaUrl: process.env.PLAYWRIGHT_QA_SUPABASE_URL,
    email: process.env.PLAYWRIGHT_TEST_EMAIL,
    password: process.env.PLAYWRIGHT_TEST_PASSWORD,
    productionUrl: 'https://nvjjifnzwrueutbirpde.supabase.co',
  });
  if (problems.length) {
    throw new Error('AUTHENTICATED E2E BLOCKED before any login or test write: ' +
      problems.join('; ') + '. Use an isolated QA backend; do not sign up to production.');
  }
}
