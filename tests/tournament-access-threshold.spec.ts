import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FREE_PLAYER_THRESHOLD,
  freeTierSummaryBody,
  freeTierSummaryLabel,
  printViewUpgradeCopy,
  resolveFreePlayerThreshold,
} from '@/constants/tournamentAccess';

describe('tournament access threshold canonicalization', () => {
  it('keeps the frontend default threshold at 150', () => {
    expect(DEFAULT_FREE_PLAYER_THRESHOLD).toBe(150);
    expect(resolveFreePlayerThreshold(undefined)).toBe(150);
    expect(resolveFreePlayerThreshold(null)).toBe(150);
  });

  it('builds threshold copy from value instead of hardcoded text', () => {
    expect(freeTierSummaryLabel(150)).toContain('150');
    expect(freeTierSummaryBody(150)).toContain('150');
    expect(printViewUpgradeCopy('Poster Grid print', 150)).toContain('150');
  });

  it('pins SQL resolver threshold to a named 150 constant', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20260419110000_canonicalize_free_player_threshold.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('v_free_player_threshold CONSTANT integer := 150;');
    expect(sql).toContain('v_players_count BETWEEN 1 AND v_free_player_threshold');
    expect(sql).toContain('free_player_threshold := v_free_player_threshold;');
  });
});
