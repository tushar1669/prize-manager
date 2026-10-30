import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, hasPingQueryParam, isPingBody, pingResponse } from "../_shared/health.ts";
import { exportUpgradeHint, resolveFreePlayerThreshold } from '../_shared/tournamentAccess.ts';
import { buildVersionedTeamPdfResults, type PinnedTeamGroup, type PinnedTeamPrize, type PinnedTeamAllocation } from '../_shared/teamPdfSnapshot.ts';
import { generateHtmlReport, type TeamPrizeResults } from '../_shared/prizePrintableHtml.ts';

const BUILD_VERSION = "2026-10-29-version-pinned-A4-printable-report";
const FUNCTION_NAME = "generatePdf";
const MISSING_ACCESS_RPC_MESSAGE = 'Database migrations not deployed (missing get_tournament_access_state)';

const corsHeaders = CORS_HEADERS;

interface GeneratePdfRequest {
  tournamentId: string;
  version: number;
}

type CachedTeamPrizes = {
  data: TeamPrizeResults | null;
  error: string | null;
  expiresAt: number;
};

const TEAM_PRIZE_CACHE_TTL_MS = 5 * 60 * 1000;
const teamPrizeCache = new Map<string, CachedTeamPrizes>();

function isMissingAccessStateRpc(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  return message.includes('get_tournament_access_state') && message.toLowerCase().includes('does not exist');
}

async function loadTeamPrizes(
  supabaseClient: SupabaseClient,
  tournamentId: string,
  version: number,
): Promise<CachedTeamPrizes> {
  // A version-pinned PDF must never display another version's team ranking.
  const cacheKey = `${tournamentId}:${version}`;
  const now = Date.now();
  const cached = teamPrizeCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached;

  let teamPrizeResults: TeamPrizeResults | null = null;
  let teamPrizeError: string | null = null;

  try {
    const { data: allocations, error: allocationError } = await supabaseClient
      .from('team_allocations')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('version', version);
    if (allocationError) throw new Error('Team allocation version could not be loaded');

    const { data: groups, error: groupsError } = await supabaseClient
      .from('institution_prize_groups')
      .select('id, name, group_by, team_size, female_slots, male_slots, scoring_mode')
      .eq('tournament_id', tournamentId)
      .eq('is_active', true)
      .order('name');
    if (groupsError) throw new Error('Team Prize group definitions could not be loaded');

    const groupRows = (groups ?? []) as PinnedTeamGroup[];
    let prizeRows: PinnedTeamPrize[] = [];
    if (groupRows.length > 0) {
      const { data: prizes, error: prizesError } = await supabaseClient
        .from('institution_prizes')
        .select('id, group_id, place, cash_amount, has_trophy, has_medal')
        .in('group_id', groupRows.map(group => group.id))
        .eq('is_active', true)
        .order('place');
      if (prizesError) throw new Error('Team Prize definitions could not be loaded');
      prizeRows = (prizes ?? []) as PinnedTeamPrize[];
    }

    // The only award source is team_allocations at precisely the requested version.
    // Missing rows are unfilled places, not permission to recompute live rankings.
    teamPrizeResults = buildVersionedTeamPdfResults(
      groupRows, prizeRows, (allocations ?? []) as PinnedTeamAllocation[],
    );
  } catch {
    // Never log player data, nor return a partial export on historical read failure.
    teamPrizeError = 'Version-pinned Team Prize data could not be verified';
  }

  const entry = { data: teamPrizeResults, error: teamPrizeError, expiresAt: now + TEAM_PRIZE_CACHE_TTL_MS };
  if (!teamPrizeError) teamPrizeCache.set(cacheKey, entry);
  return entry;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check: ?ping=1 (before reading body)
  if (hasPingQueryParam(req)) {
    console.log(`[${FUNCTION_NAME}] ping via query param`);
    return pingResponse(FUNCTION_NAME, BUILD_VERSION);
  }

  // Read body as text for safe ping detection
  const rawBody = await req.text();
  if (isPingBody(rawBody)) {
    console.log(`[${FUNCTION_NAME}] ping via body`);
    return pingResponse(FUNCTION_NAME, BUILD_VERSION);
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse from already-read rawBody
    const payload: GeneratePdfRequest = JSON.parse(rawBody);
    const { tournamentId, version } = payload;

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: tournamentAccess, error: tournamentAccessError } = await supabaseClient
      .from('tournaments')
      .select('id, owner_id')
      .eq('id', tournamentId)
      .maybeSingle();

    if (tournamentAccessError) {
      throw new Error(`Failed to load tournament access: ${tournamentAccessError.message}`);
    }

    if (!tournamentAccess) {
      return new Response(
        JSON.stringify({ error: 'Tournament not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: isMaster, error: roleError } = await supabaseClient
      .rpc('has_role', { _user_id: user.id, _role: 'master' });

    if (roleError) {
      throw new Error(`Failed to check user role: ${roleError.message}`);
    }

    if (tournamentAccess.owner_id !== user.id && !isMaster) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    const { data: accessState, error: accessStateError } = await supabaseClient
      .rpc('get_tournament_access_state', { tournament_id: tournamentId })
      .maybeSingle() as { data: { has_full_access: boolean; free_player_threshold?: number | null } | null; error: unknown };

    if (accessStateError) {
      if (isMissingAccessStateRpc(accessStateError)) {
        return new Response(
          JSON.stringify({ code: 'backend_migration_missing', message: MISSING_ACCESS_RPC_MESSAGE }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Failed to resolve tournament access: ${(accessStateError as Error).message}`);
    }

    const freePlayerThreshold = resolveFreePlayerThreshold(accessState?.free_player_threshold);

    if (!accessState?.has_full_access) {
      return new Response(
        JSON.stringify({
          error: 'upgrade_required_for_export',
          hint: exportUpgradeHint(freePlayerThreshold),
          access: accessState,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!Number.isSafeInteger(version) || version < 1) {
      return new Response(
        JSON.stringify({ error: 'invalid_allocation_version' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[generatePdf] Generating PDF for tournament ${tournamentId}, version ${version}`);

    // 1) Fetch tournament details
    const { data: tournament, error: tournamentError } = await supabaseClient
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();

    if (tournamentError) throw new Error(`Tournament not found: ${tournamentError.message}`);

    // 2) Fetch allocations with related data
    const { data: allocations, error: allocationsError } = await supabaseClient
      .from('allocations')
      .select(`
        *,
        prizes:prize_id (
          *,
          categories:category_id (*)
        ),
        players:player_id (*)
      `)
      .eq('tournament_id', tournamentId)
      .eq('version', version);

    if (allocationsError) throw new Error(`Failed to fetch allocations: ${allocationsError.message}`);

    // 3) Check for team prizes and fetch results
    const { data: teamPrizeResults, error: teamPrizeError } = await loadTeamPrizes(
      supabaseClient,
      tournamentId,
      version
    );
    if (teamPrizeError) throw new Error('Version-pinned Team Prize export is unavailable');

    // 4) Generate HTML report
    const htmlContent = generateHtmlReport(tournament, allocations, version, teamPrizeResults, teamPrizeError);

    // 5) Return allocation data as JSON for client-side Excel generation
    const pdfDataUrl = `data:text/html;base64,${btoa(htmlContent)}`;

    console.log(`[generatePdf] Report generated successfully for tournament ${tournamentId}`);

    return new Response(
      JSON.stringify({ 
        pdfUrlSigned: pdfDataUrl,
        allocations,
        tournament,
        version,
        teamPrizes: teamPrizeResults,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[generatePdf] Error:', error);
    return new Response(
      JSON.stringify({ error: 'internal_server_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

