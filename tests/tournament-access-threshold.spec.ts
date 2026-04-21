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
      'supabase/migrations/20260421133000_reassert_get_tournament_access_state_threshold_150_corrective.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('v_free_player_threshold CONSTANT integer := 150;');
    expect(sql).toContain('v_players_count BETWEEN 1 AND v_free_player_threshold');

    expect(sql).not.toContain('v_players_count BETWEEN 1 AND 100');
    expect(sql).toContain('free_player_threshold integer');
    expect(sql).toContain('free_player_threshold := v_free_player_threshold;');
  });

  it('keeps generated Supabase types aligned with access-state return shape', () => {
    const typesPath = path.resolve(process.cwd(), 'src/integrations/supabase/types.ts');
    const types = fs.readFileSync(typesPath, 'utf8');

    expect(types).toContain('get_tournament_access_state: {');
    expect(types).toContain('free_player_threshold: number');
  });

});
