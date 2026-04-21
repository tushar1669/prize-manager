import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('organizer onboarding verification corrective migration', () => {
  it('documents and corrects the legacy unverified organizer insert path', () => {
    const legacyPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20251220141141_507aecc1-7771-4cf2-90e6-d8b9ff10c0df.sql',
    );
    const correctivePath = path.resolve(
      process.cwd(),
      'supabase/migrations/20260421150000_reconcile_verified_organizer_onboarding_drift.sql',
    );

    const legacySql = fs.readFileSync(legacyPath, 'utf8');
    const correctiveSql = fs.readFileSync(correctivePath, 'utf8');

    expect(legacySql).toContain("VALUES (NEW.id, 'organizer', false)");
    expect(legacySql).toContain("AND is_verified = false");

    expect(correctiveSql).toContain("VALUES (NEW.id, 'organizer', true)");
    expect(correctiveSql).toContain('DO UPDATE SET is_verified = EXCLUDED.is_verified');
    expect(correctiveSql).toContain("AND is_verified = true");
    expect(correctiveSql).toContain("WHERE role = 'organizer'");
    expect(correctiveSql).toContain('AND is_verified = false');

    expect(correctiveSql).not.toContain("WHERE role = 'master'");
  });
});
