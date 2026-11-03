import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Finalize page does not create a new version for already-saved winners', () => {
  const source = readFileSync('src/pages/Finalize.tsx', 'utf8');
  const effect = source.slice(
    source.indexOf('hasAutoFinalizedRef.current = true;'),
    source.indexOf('const publishMutation'),
  );

  it("reuses the saved version when winners came from the database", () => {
    expect(effect).toContain("dataSource === 'db' && dataVersion");
    expect(effect).toContain('setFinalizeResult({ version: dataVersion');
    // The reuse branch comes before, and returns ahead of, the finalize call.
    expect(effect.indexOf('setFinalizeResult')).toBeLessThan(effect.indexOf('finalizeMutation.mutate(winners)'));
    expect(effect).toMatch(/setFinalizeResult\([^)]*\);\s*return;/);
  });

  it('still finalizes winners that did not come from a saved version', () => {
    expect(effect).toContain('finalizeMutation.mutate(winners)');
  });
});
