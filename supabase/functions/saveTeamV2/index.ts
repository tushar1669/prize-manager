import { createClient } from 'npm:@supabase/supabase-js@2';
import { CORS_HEADERS } from '../_shared/health.ts';
import { parseTeamRankingRuleConfig } from '../_shared/teamRankingV2.ts';
import { prepareInitialUncontestedTeamV2Rows } from '../_shared/teamV2InitialSaveRows.ts';
import { prepareAdjudicatedTeamV2Rows } from '../_shared/teamV2AdjudicatedSaveRows.ts';

/**
 * DRAFT, DISABLED BY DEFAULT. Version-locked, master-only Team v2 Save.
 *
 * The caller may supply only a tournament ID and exact expected version.
 * Independently sourced individual/team scorer responses, not browser awards,
 * are persisted together via a version-locked private RPC. Unchanged Team
 * winners can be saved as a later version while preserving existing individual
 * award history. Official tied-place corrections require a documented ruling,
 * independently revalidated against a fresh owner-only scorer result.
 * This Edge route is NOT a production release or an authenticated QA pass.
 */
const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed', saved: false }, 405);

  // Fail-closed until reviewed SQL, authenticated E2E, legacy-writer fencing,
  // source-freshness and production recovery are demonstrated separately.
  if (Deno.env.get('ENABLE_TEAM_V2_ATOMIC_SAVE') !== '1') {
    return json({ error: 'team_v2_save_not_released', saved: false }, 503);
  }
  const auth = request.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized', saved: false }, 401);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'service_unavailable', saved: false }, 503);
  const db = createClient(url, serviceKey);

  try {
    const requestBody: unknown = await request.json();
    if (!record(requestBody) ||
        Object.keys(requestBody).some(key =>
          !['tournament_id', 'expected_version', 'official_rulings'].includes(key)) ||
        (requestBody.official_rulings !== undefined &&
          (!Array.isArray(requestBody.official_rulings) ||
           requestBody.official_rulings.length > 20)) ||
        !positiveId(requestBody.tournament_id) ||
        typeof requestBody.expected_version !== 'number' ||
        !Number.isSafeInteger(requestBody.expected_version) ||
        requestBody.expected_version < 0 ||
        requestBody.expected_version >= 2147483647) {
      return json({ error: 'invalid_expected_version', saved: false }, 400);
    }
    const tournamentId = requestBody.tournament_id;
    const expectedVersion = requestBody.expected_version;
    const nextVersion = expectedVersion + 1;
    const { data: identity, error: identityError } =
      await db.auth.getUser(auth.slice('Bearer '.length));
    if (identityError || !identity.user) return json({ error: 'unauthorized', saved: false }, 401);
    const actorId = identity.user.id;

    const { data: tournament, error: tournamentError } = await db.from('tournaments')
      .select('id,owner_id').eq('id', tournamentId).maybeSingle();
    if (tournamentError || !tournament) return json({ error: 'not_found', saved: false }, 404);
    const { data: master, error: masterError } = await db.rpc('has_role', {
      _user_id: actorId, _role: 'master',
    });
    if (masterError || (tournament.owner_id !== actorId && master !== true))
      return json({ error: 'forbidden', saved: false }, 403);
    // First rollout is a SERVER-ENFORCED administrator canary, not a UI
    // visibility toggle. Ownership alone cannot enable a money-bearing Save.
    // Remove this gate only in a separately approved general-availability release.
    if (master !== true)
      return json({ error: 'master_only_preview', saved: false }, 403);
    const { data: access, error: accessError } = await db
      .rpc('get_tournament_access_state', { tournament_id: tournamentId }).maybeSingle();
    // The service-role RPC has no auth.uid(), so its response does not
    // recognize the current actor's master entitlement. The role has already
    // been independently checked with the authenticated actor ID above.
    if (accessError || !record(access) ||
        (access.has_full_access !== true && master !== true))
      return json({ error: 'full_access_required', saved: false }, 403);

    const version = async (): Promise<number | null> => {
      const [i, t] = await Promise.all([
        db.from('allocations').select('version')
          .eq('tournament_id', tournamentId).order('version', { ascending: false }).limit(1),
        db.from('team_allocations').select('version')
          .eq('tournament_id', tournamentId).order('version', { ascending: false }).limit(1),
      ]);
      if (i.error || t.error) return null;
      return Math.max(Number(i.data?.[0]?.version ?? 0), Number(t.data?.[0]?.version ?? 0));
    };
    if (await version() !== expectedVersion)
      return json({ error: 'stale_version', saved: false }, 409);

    // All individual + Team scorer input tables are covered; failures block Save.
    const sourceDigest = async (): Promise<string | null> => {
      const { data, error } = await db.rpc('team_v2_source_fingerprint', {
        p_tournament_id: tournamentId,
      });
      return !error && typeof data === 'string' &&
        /^[0-9a-f]{64}$/.test(data) ? data : null;
    };
    const before = await sourceDigest();
    if (!before) return json({ error: 'source_unavailable', saved: false }, 409);

    const [groups, categories] = await Promise.all([
      db.from('institution_prize_groups').select(
        'id,group_by,team_size,female_slots,male_slots,scoring_mode,ranking_rules',
      ).eq('tournament_id', tournamentId).eq('is_active', true),
      db.from('categories').select('id').eq('tournament_id', tournamentId)
        .eq('is_active', true),
    ]);
    if (groups.error || categories.error || !groups.data?.length || !categories.data?.length)
      return json({ error: 'inventory_unavailable', saved: false }, 409);
    const ids = groups.data.map(group => group.id);
    if (groups.data.some(group => {
      const rules = parseTeamRankingRuleConfig(group.ranking_rules);
      return !rules?.organizer_confirmed || !rules.published_reference.trim();
    })) return json({ error: 'published_regulations_required', saved: false }, 409);

    const [teamPrizes, individualPrizes] = await Promise.all([
      db.from('institution_prizes')
        .select('id,group_id,place,cash_amount,has_trophy,has_medal')
        .in('group_id', ids).eq('is_active', true),
      db.from('prizes').select('id').in('category_id', categories.data.map(c => c.id))
        .eq('is_active', true),
    ]);
    if (teamPrizes.error || individualPrizes.error ||
        !teamPrizes.data?.length || !individualPrizes.data?.length)
      return json({ error: 'inventory_unavailable', saved: false }, 409);

    // Neither scorer is allowed to accept rule overrides, manual winner arrays,
    // unverified tie decisions, or caller-controlled candidate order.
    const [individual, team] = await Promise.all([
      db.functions.invoke('allocatePrizes', {
        body: { tournamentId, dryRun: false },
        headers: { Authorization: auth },
      }),
      db.functions.invoke('allocateInstitutionPrizes', {
        body: { tournament_id: tournamentId },
        headers: { Authorization: auth },
      }),
    ]);
    if (individual.error || team.error) return json({ error: 'scorer_unavailable', saved: false }, 409);
    // A browser may submit only official order/reference PROPOSALS; its team
    // keys and award instructions are revalidated against the fresh private
    // scorer, never persisted as client-provided winner rows. No official
    // proposal is needed for a fully resolved tournament.
    const officialRulings = requestBody.official_rulings ?? [];
    const proposal = Array.isArray(officialRulings) && officialRulings.length
      ? prepareAdjudicatedTeamV2Rows(
        individualPrizes.data.map(prize => prize.id),
        individual.data, groups.data, teamPrizes.data, team.data,
        officialRulings, {
          currentAllocationVersion: expectedVersion, actorId,
          actorIsOwnerOrMaster: master === true,
          recordedAt: new Date().toISOString(),
        },
      )
      : prepareInitialUncontestedTeamV2Rows(
        individualPrizes.data.map(prize => prize.id),
        individual.data, groups.data, teamPrizes.data, team.data,
        actorId, nextVersion,
      );
    if (!proposal.ok) return json({ error: proposal.reason, saved: false }, 409);

    // Independent version recheck; DB RPC checks it again under row lock.
    // A full source-revision lock remains a mandatory gate before enabling
    // this draft route in any runtime.
    if (await version() !== expectedVersion)
      return json({ error: 'stale_version', saved: false }, 409);
    const after = await sourceDigest();
    if (!after || after !== before)
      return json({ error: 'source_changed', saved: false }, 409);

    const { data: newVersion, error: commitError } = await db.rpc(
      'commit_team_v2_adjudicated_version', {
        p_tournament_id: tournamentId, p_expected_version: expectedVersion,
        p_actor_id: actorId,
        // Every subsequent version COPIES original individual awards inside
        // the SQL transaction; never recalculate or replace paid winners.
        p_individual_rows: expectedVersion === 0 ? proposal.rows.individual_rows : [],
        p_team_rows: proposal.rows.team_rows, p_rulings: proposal.rows.rulings,
        p_expected_source_fingerprint: before,
      },
    );
    if (commitError || newVersion !== nextVersion)
      return json({ error: 'atomic_save_unavailable_or_rejected', saved: false }, 409);
    return json({ saved: true, allocation_version: nextVersion });
  } catch {
    // No tokens, player names, personal data, scorer payloads or raw errors in logs.
    return json({ error: 'team_v2_save_failed', saved: false }, 500);
  }
});
