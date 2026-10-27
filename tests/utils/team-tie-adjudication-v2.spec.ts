import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  validateTeamRulingV2, type TeamRulingServerContext,
} from '../../supabase/functions/_shared/teamTieAdjudicationV2';

const team = (key: string) => ({ key, selectedPlayers: [
  { points: 6 }, { points: 6 },
] });
const A = team('A'), B = team('B'), C = team('C'), D = team('D');
const context = (): TeamRulingServerContext => ({
  groupId: 'fixture-group',
  currentAllocationVersion: 6,
  nextAllocationVersion: 7,
  actorId: 'server-authenticated-owner',
  actorIsOwnerOrMaster: true,
  regulationsAttested: true,
  recordedAt: '2026-10-27T00:00:00.000Z',
  partitions: [
    { status: 'resolved', criterion: 'total_points', teams: [A] },
    { status: 'tied', teams: [B, C] },
    { status: 'resolved', criterion: 'total_points', teams: [D] },
  ],
  prizePlaces: [1, 2, 3],
});
const proposal = () => ({
  group_id: 'fixture-group',
  next_allocation_version: 7,
  tied_team_keys: ['B', 'C'],
  ordered_team_keys: ['C', 'B'],
  affected_places: [2, 3],
  method: 'documented_arbiter_ruling',
  regulation_reference: 'Synthetic published regulations §4',
  arbiter_decision_reference: 'Synthetic arbiter ruling #1',
  explanation: 'Verified external arbiter ruling recorded before new allocation',
});

describe('Team Ranking v2 authorized adjudication pre-write contract', () => {
  it('accepts only a real exhausted tie with a cited decision and a NEW allocation version', () => {
    const result = validateTeamRulingV2(proposal(), context());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record).toMatchObject({
      schema_version: 2,
      group_id: 'fixture-group',
      allocation_version: 7,
      supersedes_allocation_version: 6,
      actor_id: 'server-authenticated-owner',
      ordered_team_keys: ['C', 'B'],
      affected_places: [2, 3],
      award_instructions: [
        { place: 2, institution_key: 'C' },
        { place: 3, institution_key: 'B' },
      ],
    });
    expect(result.record).not.toHaveProperty('player_snapshot');
  });

  it('refuses anyone not independently authenticated and authorized by the server', () => {
    expect(validateTeamRulingV2(proposal(), { ...context(), actorIsOwnerOrMaster: false }))
      .toEqual({ ok: false, reason: 'unauthorized' });
    expect(validateTeamRulingV2(proposal(), { ...context(), actorId: null }))
      .toEqual({ ok: false, reason: 'unauthorized' });
  });

  it('does not overwrite any prior/published allocation version', () => {
    expect(validateTeamRulingV2({ ...proposal(), next_allocation_version: 6 }, context()))
      .toEqual({ ok: false, reason: 'stale_version' });
    expect(validateTeamRulingV2(proposal(), { ...context(), nextAllocationVersion: 6 }))
      .toEqual({ ok: false, reason: 'stale_version' });
    expect(validateTeamRulingV2(proposal(), { ...context(), currentAllocationVersion: 8 }))
      .toEqual({ ok: false, reason: 'stale_version' });
  });

  it('refuses arbitrary award reorder or fake/partially selected tie participants', () => {
    expect(validateTeamRulingV2({ ...proposal(), tied_team_keys: ['A', 'B'] }, context()).ok).toBe(false);
    expect(validateTeamRulingV2({ ...proposal(), ordered_team_keys: ['B', 'D'] }, context()).ok).toBe(false);
    expect(validateTeamRulingV2({ ...proposal(), ordered_team_keys: ['B', 'B'] }, context()).ok).toBe(false);
    expect(validateTeamRulingV2(proposal(), {
      ...context(), partitions: [{ status: 'resolved', teams: [A] }, { status: 'resolved', teams: [B] }],
    })).toEqual({ ok: false, reason: 'not_a_tie' });
  });

  it('never treats missing/unverified TB data as a manually adjudicable tie', () => {
    expect(validateTeamRulingV2(proposal(), {
      ...context(),
      partitions: [
        { status: 'resolved', teams: [A] },
        { status: 'blocked', reason: 'missing_tb', teams: [B, C] },
        { status: 'resolved', teams: [D] },
      ],
    })).toEqual({ ok: false, reason: 'incomplete_ranking' });
  });

  it('prohibits omitted/extra/unordered award boundaries and does not guess gaps', () => {
    expect(validateTeamRulingV2({ ...proposal(), affected_places: [2] }, context()))
      .toEqual({ ok: false, reason: 'incorrect_boundary' });
    expect(validateTeamRulingV2({ ...proposal(), affected_places: [3, 2] }, context()))
      .toEqual({ ok: false, reason: 'incorrect_boundary' });
    const gaps = { ...context(), prizePlaces: [1, 3] };
    const correct = { ...proposal(), affected_places: [3] };
    const verdict = validateTeamRulingV2(correct, gaps);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.record.award_instructions).toEqual([
      { place: 3, institution_key: 'B' },
    ]);
  });

  it('requires attested event regulations AND actual arbiter ruling reference', () => {
    expect(validateTeamRulingV2(proposal(), {
      ...context(), regulationsAttested: false,
    })).toEqual({ ok: false, reason: 'invalid_context' });
    for (const patch of [
      { regulation_reference: '  ' },
      { arbiter_decision_reference: '' },
      { explanation: '' },
      { method: 'automatic_lots' },
    ]) {
      expect(validateTeamRulingV2({ ...proposal(), ...patch }, context()))
        .toEqual({ ok: false, reason: 'invalid_ruling' });
    }
  });

  it('keeps the legacy UI out of the v2 resolution pathway', () => {
    const detector = readFileSync('src/utils/teamTieDetection.ts', 'utf8');
    expect(detector).toContain('if (Array.isArray(group.ranking_issues)) return null;');
    const dialog = readFileSync('src/components/allocation/TeamTieBreakDialog.tsx', 'utf8');
    expect(dialog).toContain("supabase.rpc('resolve_team_tie'");
    // There must be no new v2 route wired to the legacy in-place write.
    const writer = readFileSync('supabase/functions/_shared/teamTieAdjudicationV2.ts', 'utf8');
    expect(writer).not.toContain("supabase.rpc('resolve_team_tie'");
    expect(writer).not.toContain('.from(');
  });
});
