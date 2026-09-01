import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guard test for batch G2 (2 September 2026).
 *
 * WHAT WENT WRONG
 * ---------------
 * Three booleans describe one publish state: `tournaments.is_published`,
 * `tournaments.status`, and `publications.is_active`. Before G1 the public RLS
 * policies keyed off the wrong two, so clearing only `is_published` left a
 * tournament fully readable by an unauthenticated caller.
 *
 * `AdminTournaments.tsx` did exactly that. Its hide / archive / softDelete
 * actions ran a raw `supabase.from("tournaments").update({ is_published: false })`
 * and touched neither the publication row nor `status`. Seven archived
 * tournaments — 2,625 allocation rows plus their titles — stayed public. The
 * toast said "Tournament hidden from public". It was not.
 *
 * `unpublish_tournament()` was correct the whole time and was never called from
 * this page. That is the defect this file guards.
 *
 * WHY A SOURCE GUARD RATHER THAN A RENDER TEST
 * --------------------------------------------
 * The defect is "which write path is used", not "what the screen shows". A
 * mechanical guard states that directly and cannot pass for the wrong reason.
 *
 * This guard was verified to FAIL on the pre-G2 file before being trusted:
 * all three assertions below fired against the original source. A guard that
 * has never been observed failing is an assumption, not a check (D35, BB2).
 *
 * If a future action legitimately needs to clear `is_published`, it must go
 * through `unpublish_tournament` too — do not add an exception here without
 * establishing which flag RLS reads today (BB3).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'src/pages/AdminTournaments.tsx');
const source = fs.readFileSync(FILE, 'utf8');

describe('AdminTournaments publish-state writes', () => {
  it('never sets is_published inside a client update payload', () => {
    // Matches `updates: { ... is_published ... }` across newlines.
    const rawWrites = source.match(/updates:\s*\{[^}]*is_published[^}]*\}/g) ?? [];
    expect(rawWrites).toEqual([]);
  });

  it('routes unpublishing through the atomic unpublish_tournament RPC', () => {
    expect(source).toContain('supabase.rpc("unpublish_tournament"');
    expect(source).toContain('tournament_id: id');
  });

  it('marks every visibility-clearing action with unpublish: true', () => {
    // hide, archive and softDelete all remove a tournament from public view.
    const flagged = source.match(/unpublish:\s*true/g) ?? [];
    expect(flagged.length).toBe(3);
  });
});
