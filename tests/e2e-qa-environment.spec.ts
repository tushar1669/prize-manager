import { describe, expect, it } from 'vitest';
import { qaBackendProblems, type QaBackendConfig } from '../e2e/utils/qaEnvironment';

const productionUrl = 'https://prod-test.supabase.co';
const qaUrl = 'https://isolated-qa.supabase.co';
const ready: QaBackendConfig = {
  configuredUrl: qaUrl,
  expectedQaUrl: qaUrl,
  email: 'qa@example.invalid',
  password: 'qa-only-fixture-credential',
  productionUrl,
};

describe('authenticated E2E production-safety gate', () => {
  it('rejects missing isolated-backend configuration and credentials', () => {
    const problems = qaBackendProblems({
      ...ready, expectedQaUrl: undefined, email: undefined, password: undefined,
    });
    expect(problems).toContain('PLAYWRIGHT_QA_SUPABASE_URL must identify a dedicated HTTPS Supabase QA project');
    expect(problems).toContain('dedicated PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD are required');
  });

  it('rejects production even when explicitly selected', () => {
    expect(qaBackendProblems({
      ...ready, configuredUrl: productionUrl, expectedQaUrl: productionUrl,
    })).toContain('authenticated QA is prohibited against the production Supabase project');
  });

  it('rejects a production-compiled client with a QA environment variable', () => {
    const problems = qaBackendProblems({ ...ready, configuredUrl: productionUrl });
    expect(problems).toContain('authenticated QA is prohibited against the production Supabase project');
    expect(problems.some(p => p.includes('app backend differs'))).toBe(true);
  });

  it('rejects placeholder credentials and an invalid endpoint', () => {
    const problems = qaBackendProblems({
      ...ready, expectedQaUrl: 'http://isolated-qa.supabase.co',
      email: 'test@example.com', password: 'testpassword123',
    });
    expect(problems).toHaveLength(3);
  });

  it('accepts only an explicitly matched separate QA project with dedicated credentials', () => {
    expect(qaBackendProblems(ready)).toEqual([]);
  });
});
