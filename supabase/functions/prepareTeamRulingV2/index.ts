import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS } from "../_shared/health.ts";
import { parseTeamRankingRuleConfig, type TeamRankingPartition } from "../_shared/teamRankingV2.ts";
import { validateTeamRulingV2 } from "../_shared/teamTieAdjudicationV2.ts";

/**
 * Authenticated, read-only Team Ranking v2 official-ruling REVIEW.
 * This function NEVER saves awards, executes the draft SQL writer, or calls
 * the legacy in-place resolve_team_tie RPC.
 *
 * The fresh allocation preview and owner/master checks are run SERVER-SIDE.
 * No caller-supplied partitions, prize places, actor IDs, or row payloads
 * are accepted. A future atomic commit route must repeat these checks
 * inside its own transaction before persisting a ruling.
 */
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
});

const record = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const header = req.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !secret) return json({ error: 'service_unavailable' }, 503);
  const supabase = createClient(supabaseUrl, secret);

  try {
    const token = header.slice('Bearer '.length);
    const { data: { user }, error: identityError } = await supabase.auth.getUser(token);
    if (identityError || !user) return json({ error: 'unauthorized' }, 401);

    const request: unknown = await req.json();
    if (!record(request) || typeof request.tournament_id !== 'string' ||
        typeof request.group_id !== 'string' || !record(request.proposal)) {
      return json({ error: 'invalid_request' }, 400);
    }
    const tournamentId = request.tournament_id;
    const groupId = request.group_id;

    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments').select('id,owner_id').eq('id', tournamentId).maybeSingle();
    if (tournamentError || !tournament) return json({ error: 'not_found' }, 404);

    const { data: master, error: masterError } = await supabase.rpc('has_role', {
      _user_id: user.id, _role: 'master',
    });
    if (masterError || (tournament.owner_id !== user.id && master !== true)) {
      return json({ error: 'forbidden' }, 403);
    }

    const { data: rulesGroup, error: groupError } = await supabase
      .from('institution_prize_groups')
      .select('id,tournament_id,ranking_rules,is_active')
      .eq('id', groupId).eq('tournament_id', tournamentId)
      .eq('is_active', true).maybeSingle();
    if (groupError || !rulesGroup) return json({ error: 'invalid_group' }, 404);

    const rules = parseTeamRankingRuleConfig(rulesGroup.ranking_rules);
    if (!rules?.organizer_confirmed || !rules.published_reference.trim() ||
        request.proposal.regulation_reference !== rules.published_reference) {
      return json({ error: 'published_regulations_required' }, 409);
    }

    // Invoking our own authenticated allocation engine obtains a fresh,
    // SERVER-scored set of partitions and active prize places. Never trust
    // client-side display order or user-submitted winner arrays.
    const { data: preview, error: scorerError } = await supabase.functions.invoke(
      'allocateInstitutionPrizes', {
        body: { tournament_id: tournamentId },
        headers: { Authorization: header },
      },
    );
    if (scorerError || !record(preview) || !Array.isArray(preview.groups)) {
      return json({ error: 'ranking_unavailable' }, 409);
    }
    // A fresh scorer response can still be incomplete. Cross-check its
    // group/prize inventory against separately queried, active DB records.
    // This is a read-only review fence, NOT an atomic Save trust boundary.
    const { data: activeGroups, error: activeError } = await supabase
      .from('institution_prize_groups').select('id')
      .eq('tournament_id', tournamentId).eq('is_active', true);
    if (activeError || !activeGroups || activeGroups.length === 0) {
      return json({ error: 'ranking_unavailable' }, 409);
    }
    const activeIds = activeGroups.map(g => g.id);
    const { data: activePrizes, error: prizeError } = await supabase
      .from('institution_prizes').select('id,group_id')
      .in('group_id', activeIds).eq('is_active', true);
    if (prizeError || !activePrizes) return json({ error: 'ranking_unavailable' }, 409);

    const expected = new Map(activeIds.map(id => [id, [] as string[]]));
    for (const prize of activePrizes) expected.get(prize.group_id)?.push(prize.id);
    const actualIds = preview.groups.map((g: unknown) =>
      record(g) && typeof g.group_id === 'string' ? g.group_id : null);
    if (actualIds.length !== activeIds.length ||
        new Set(actualIds).size !== activeIds.length ||
        actualIds.some((id: unknown) => typeof id !== 'string' ||
          !expected.has(id as string)) ||
        preview.groups.some((g: unknown) => {
          if (!record(g) || !Array.isArray(g.prizes)) return true;
          const allowed = expected.get(g.group_id as string);
          if (!allowed) return true;
          const ids = g.prizes.map((p: unknown) =>
            record(p) && typeof p.id === 'string' ? p.id : null);
          return ids.length !== allowed.length ||
            new Set(ids).size !== allowed.length ||
            ids.some((id: unknown) => typeof id !== 'string' ||
              !allowed.includes(id as string));
        })) return json({ error: 'ranking_unavailable' }, 409);

    const group = preview.groups.find((g: unknown) =>
      record(g) && g.group_id === groupId);
    if (!record(group) ||
        !Array.isArray(group.adjudication_partitions) ||
        !Array.isArray(group.prizes) ||
        group.adjudication_rules_reference !== rules.published_reference) {
      return json({ error: 'ranking_unavailable' }, 409);
    }

    // Freeze a version reference for this REVIEW, not for a write.
    // The future atomic DB procedure must independently lock and compare
    // this version before any write is possible.
    const [individuals, teams] = await Promise.all([
      supabase.from('allocations').select('version')
        .eq('tournament_id', tournamentId).order('version', { ascending: false }).limit(1),
      supabase.from('team_allocations').select('version')
        .eq('tournament_id', tournamentId).order('version', { ascending: false }).limit(1),
    ]);
    if (individuals.error || teams.error) return json({ error: 'version_unavailable' }, 409);
    const currentVersion = Math.max(
      Number(individuals.data?.[0]?.version ?? 0),
      Number(teams.data?.[0]?.version ?? 0),
    );

    // A server-scorer result is authoritative only for this instant; no
    // persistence decision is made here. Validator also refuses 'blocked'
    // partitions caused by unverified/missing TB evidence.
    const partitions = group.adjudication_partitions as TeamRankingPartition[];
    const prizePlaces = group.prizes.map((prize: unknown) =>
      record(prize) ? prize.place : null);
    const check = validateTeamRulingV2({
      ...request.proposal,
      group_id: groupId,
      next_allocation_version: currentVersion + 1,
    }, {
      groupId,
      currentAllocationVersion: currentVersion,
      nextAllocationVersion: currentVersion + 1,
      actorId: user.id,
      actorIsOwnerOrMaster: true,
      regulationsAttested: true,
      recordedAt: new Date().toISOString(),
      partitions,
      prizePlaces: prizePlaces as number[],
    });
    if (!check.ok) return json({ error: check.reason, saved: false }, 409);

    // Only a safe review summary goes back to the organizer; never private
    // scorer source data or a privileged DB writer payload.
    return json({
      ok: true,
      saved: false,
      requires_final_commit: true,
      review: {
        group_id: groupId,
        expected_existing_version: currentVersion,
        proposed_new_version: check.record.allocation_version,
        affected_places: check.record.affected_places,
        ordered_team_keys: check.record.ordered_team_keys,
        regulation_reference: check.record.regulation_reference,
        arbiter_decision_reference: check.record.arbiter_decision_reference,
      },
    });
  } catch {
    // Do not log the request, teams, names, player details or tokens.
    return json({ error: 'ruling_review_failed' }, 400);
  }
});
