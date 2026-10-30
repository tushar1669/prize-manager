import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateTeamRulingV2, type TeamRulingServerContext } from '../../supabase/functions/_shared/teamTieAdjudicationV2';

const read = (path: string) => readFileSync(path, 'utf8');
const server = read('supabase/functions/prepareTeamRulingV2/index.ts');
const allocator = read('supabase/functions/allocateInstitutionPrizes/index.ts');
const dialog = read('src/components/allocation/TeamV2RulingDialog.tsx');
const teamTab = read('src/components/final-prize/TeamPrizesTabView.tsx');
const panel = read('src/components/allocation/TeamPrizeResultsPanel.tsx');

describe('owner-only v2 ruling review flow — source-only, no payout writer', () => {
  it('visibly places a distinct official ruling action in the existing Team Prizes organizer panel', () => {
    expect(panel).toContain('Review official tie ruling');
    expect(panel).toContain('showDiagnostics && hasFullAccess && onV2RulingRequest');
    expect(panel).toContain('(group.adjudication_ties?.length ?? 0) > 0');
    expect(panel).toContain('data-team-print-hide');
    expect(teamTab).toContain('TeamV2RulingDialog');
    expect(teamTab).toContain('showDiagnostics && hasFullAccess && allocationVersion === undefined');
    expect(read('src/pages/Finalize.tsx')).toContain('allocationVersion={finalizeResult?.version}');
  });

  it('shows clear organizer decision fields, keyboard order, state and explicit not-saved copy', () => {
    for (const content of [
      'Published team-prize regulations',
      'Official arbiter decision reference',
      'Explain the authorized ruling',
      'Affected prize places:',
      'Move ${key} up',
      'Move ${key} down',
      'Check official ruling',
      'Nothing was saved.',
      'Not saved.',
    ]) expect(dialog).toContain(content);
    expect(dialog).toContain("supabase.functions.invoke('prepareTeamRulingV2'");
    expect(dialog).not.toContain("supabase.rpc('resolve_team_tie'");
    expect(dialog).not.toContain('commit_team_v2_adjudicated_version');
  });

  it('recomputes the fresh ranking on the authenticated server with server-sourced access and rules', () => {
    expect(server).toContain('supabase.auth.getUser(token)');
    expect(server).toContain(".from('tournaments').select('id,owner_id')");
    expect(server).toContain("supabase.rpc('has_role'");
    expect(server).toContain('tournament.owner_id !== user.id');
    expect(server).toContain('parseTeamRankingRuleConfig(rulesGroup.ranking_rules)');
    expect(server).toContain("supabase.functions.invoke(");
    expect(server).toContain("'allocateInstitutionPrizes'");
    expect(server).toContain('validateTeamRulingV2({');
    expect(server).toContain('actorId: user.id');
    expect(server).toContain('partitions,');
    expect(server).toContain('prizePlaces: prizePlaces as number[]');
    expect(server).not.toContain("supabase.rpc('resolve_team_tie'");
    expect(server).not.toContain("commit_team_v2_adjudicated_version");
    expect(server).not.toContain(".insert(");
    expect(server).not.toContain(".update(");
    expect(server).not.toContain(".delete(");
    expect(server).toContain('saved: false');
  });

  it('cross-checks all active tournament groups and prizes before trusting a partial scorer preview', () => {
    const groupRead = server.indexOf(".from('institution_prize_groups').select('id')");
    const prizeRead = server.indexOf(".from('institution_prizes').select('id,group_id,place,cash_amount,has_trophy,has_medal')");
    const previewMatch = server.indexOf('const group = preview.groups.find(');
    expect(groupRead).toBeGreaterThan(server.indexOf("'allocateInstitutionPrizes'"));
    expect(prizeRead).toBeGreaterThan(groupRead);
    expect(previewMatch).toBeGreaterThan(prizeRead);
    expect(server).toContain(".eq('tournament_id', tournamentId).eq('is_active', true)");
    expect(server).toContain(".in('group_id', activeIds).eq('is_active', true)");
    expect(server).toContain('verifyTeamV2ReviewPrizeInventory(activeGroups, activePrizes, preview.groups)');
    expect(server).not.toContain('planCompleteTeamV2Awards(');
  });

  it('passes real scorer tied partitions and refuses to label missing-TB blocked sets adjudicable', () => {
    expect(allocator).toContain("if (partition.status !== 'tied') return []");
    expect(allocator).toContain('adjudication_partitions: adjudicationPartitions');
    expect(allocator).toContain('adjudication_ties: adjudicationTies');
    // Official Save needs source-scored player IDs and complete candidate roster,
    // not only points. Missing identities must never be guessed by the browser.
    expect(allocator).toContain('playerId: player.playerId');
    expect(allocator).toContain('sourceHash: player.sourceHash');
    expect(allocator).toContain('individualTieBreaks: player.individualTieBreaks');
    expect(allocator).toContain('adjudication_partitions: adjudicationPartitions');
    expect(allocator).toContain('members: scoredByKey.get(team.key)?.team.map');
    expect(server).toContain('request.proposal.regulation_reference !== rules.published_reference');
  });

  it('the existing server guard rejects an incomplete ranking even when some teams are truly tied', () => {
    const context: TeamRulingServerContext = {
      groupId: 'group', currentAllocationVersion: 0, nextAllocationVersion: 1,
      actorId: 'valid-owner', actorIsOwnerOrMaster: true,
      regulationsAttested: true, recordedAt: '2026-10-27T00:00:00Z',
      prizePlaces: [1, 3],
      partitions: [
        { status: 'tied', teams: [
          { key: 'School A', selectedPlayers: [{ points: 6 }] },
          { key: 'School B', selectedPlayers: [{ points: 6 }] },
        ] },
        { status: 'blocked', reason: 'missing_tb',
          teams: [{ key: 'School C', selectedPlayers: [{ points: 6 }] }] },
      ],
    };
    const proposal = {
      group_id: 'group', next_allocation_version: 1,
      tied_team_keys: ['School A', 'School B'],
      ordered_team_keys: ['School B', 'School A'],
      affected_places: [1],
      method: 'documented_arbiter_ruling',
      regulation_reference: 'published section 3',
      arbiter_decision_reference: 'official ruling 17',
      explanation: 'Procedure authorized under the event regulations',
    };
    expect(validateTeamRulingV2(proposal, context))
      .toEqual({ ok: false, reason: 'incomplete_ranking' });
    expect(validateTeamRulingV2(proposal, {
      ...context, partitions: context.partitions.slice(0, 1),
    }).ok).toBe(true);
  });

  it('does not put organizer-only options or private ranking data on the public Team Prizes page', () => {
    const publicSection = read('src/components/public/PublicTeamPrizesSection.tsx');
    expect(publicSection).not.toContain('onV2RulingRequest');
    expect(publicSection).not.toContain('TeamV2RulingDialog');
    expect(read('supabase/functions/publicTeamPrizes/index.ts')).not.toContain('adjudication_partitions');
    expect(read('supabase/functions/generatePdf/index.ts')).not.toContain('adjudication_partitions');
  });
});
