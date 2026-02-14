import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, hasPingQueryParam, isPingBody, pingResponse } from "../_shared/health.ts";

const BUILD_VERSION = "2025-12-20T20:00:00Z";
const FUNCTION_NAME = "generatePdf";
const MISSING_ACCESS_RPC_MESSAGE = 'Database migrations not deployed (missing get_tournament_access_state)';

const corsHeaders = CORS_HEADERS;

interface GeneratePdfRequest {
  tournamentId: string;
  version: number;
}

// Team prize types matching allocateInstitutionPrizes response
interface TeamPlayerInfo {
  player_id: string;
  name: string;
  rank: number;
  points: number;
  gender: string | null;
}

interface WinnerInstitution {
  key: string;
  label: string;
  total_points: number;
  rank_sum: number;
  best_individual_rank: number;
  players: TeamPlayerInfo[];
}

interface GroupConfig {
  group_by: string;
  team_size: number;
  female_slots: number;
  male_slots: number;
  scoring_mode: string;
}

interface PrizeWithWinner {
  id: string;
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  is_active: boolean;
  winner_institution: WinnerInstitution | null;
}

interface GroupResponse {
  group_id: string;
  name: string;
  config: GroupConfig;
  prizes: PrizeWithWinner[];
  eligible_institutions: number;
  ineligible_institutions: number;
  ineligible_reasons: string[];
}

interface TeamPrizeResults {
  groups: GroupResponse[];
  players_loaded: number;
  max_rank: number;
}

type CachedTeamPrizes = {
  data: TeamPrizeResults | null;
  error: string | null;
  expiresAt: number;
};

const TEAM_PRIZE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const teamPrizeCache = new Map<string, CachedTeamPrizes>();

const GROUP_BY_LABELS: Record<string, string> = {
  club: 'School / Academy / Club',
  city: 'City',
  state: 'State',
  group_label: 'Swiss Group (Gr)',
  type_label: 'Swiss Type',
};

function isMissingAccessStateRpc(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  return message.includes('get_tournament_access_state') && message.toLowerCase().includes('does not exist');
}

function getPlaceOrdinal(place: number): string {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';
  return `${place}th`;
}

async function loadTeamPrizes(
  supabaseClient: SupabaseClient,
  tournamentId: string,
  authHeader: string
) {
  const cacheKey = `${tournamentId}:latest`;
  const now = Date.now();
  const cached = teamPrizeCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached;
  }

  let teamPrizeResults: TeamPrizeResults | null = null;
  let teamPrizeError: string | null = null;

  try {
    const { count, error: countError } = await supabaseClient
      .from('institution_prize_groups')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('is_active', true);

    if (countError) {
      console.error('[generatePdf] Error checking team prizes:', countError);
      teamPrizeError = countError.message || 'Unknown error';
    } else if ((count || 0) > 0) {
      console.log(`[generatePdf] Found ${count} active team prize groups, calling allocator`);

      const { data: teamData, error: teamError } = await supabaseClient.functions.invoke(
        'allocateInstitutionPrizes',
        {
          body: { tournament_id: tournamentId },
          headers: { Authorization: authHeader }
        }
      );

      if (teamError) {
        console.error('[generatePdf] Team prize allocation error:', teamError);
        teamPrizeError = teamError.message || 'Unknown error';
      } else {
        teamPrizeResults = teamData as TeamPrizeResults;
        console.log(`[generatePdf] Team prizes loaded: ${teamPrizeResults.groups.length} groups`);
      }
    } else {
      console.log('[generatePdf] No active team prize groups');
    }
  } catch (e: unknown) {
    console.error('[generatePdf] Exception loading team prizes:', e);
    teamPrizeError = e instanceof Error ? e.message : 'Unknown error';
  }

  const cacheEntry: CachedTeamPrizes = {
    data: teamPrizeResults,
    error: teamPrizeError,
    expiresAt: now + TEAM_PRIZE_CACHE_TTL_MS,
  };

  teamPrizeCache.set(cacheKey, cacheEntry);
  return cacheEntry;
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
      .maybeSingle() as { data: { has_full_access: boolean } | null; error: unknown };

    if (accessStateError) {
      if (isMissingAccessStateRpc(accessStateError)) {
        return new Response(
          JSON.stringify({ code: 'backend_migration_missing', message: MISSING_ACCESS_RPC_MESSAGE }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Failed to resolve tournament access: ${(accessStateError as Error).message}`);
    }

    if (!accessState?.has_full_access) {
      return new Response(
        JSON.stringify({
          error: 'upgrade_required_for_export',
          hint: 'PDF/print export is unavailable for tournaments above 100 players without active Pro entitlement.',
          access: accessState,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      authHeader
    );

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
    const errMsg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Tournament type for generating HTML report
type TournamentInfo = {
  title: string;
  start_date: string;
  end_date: string;
  venue?: string | null;
};

// Allocation row type for HTML report
type AllocationRow = {
  players?: { rank?: number | null; name?: string | null } | null;
  prizes?: {
    categories?: { name?: string | null } | null;
    place?: number | null;
    cash_amount?: number | null;
    has_trophy?: boolean | null;
    has_medal?: boolean | null;
  } | null;
};

function generateHtmlReport(
  tournament: TournamentInfo,
  allocations: AllocationRow[],
  version: number,
  teamPrizes: TeamPrizeResults | null,
  teamPrizeError: string | null
): string {
  // Generate team prizes section HTML
  let teamPrizesHtml = '';
  
  if (teamPrizeError) {
    teamPrizesHtml = `
      <div style="page-break-before: always;"></div>
      <h2>Team / Institution Prizes</h2>
      <p class="meta" style="color: #c53030;">
        Team prizes could not be included due to an error: ${teamPrizeError}<br>
        Please check the online Team Prizes view.
      </p>
    `;
  } else if (teamPrizes && teamPrizes.groups.length > 0) {
    teamPrizesHtml = `
      <div style="page-break-before: always;"></div>
      <h2>Team / Institution Prizes</h2>
      <p class="meta">Team prizes are allocated separately from individual prizes. Players may win both individual and team prizes.</p>
      ${teamPrizes.groups.map(group => {
        const filledPrizes = group.prizes.filter(p => p.winner_institution !== null);
        const groupByLabel = GROUP_BY_LABELS[group.config.group_by] || group.config.group_by;
        
        let genderReq = '';
        if (group.config.female_slots > 0 || group.config.male_slots > 0) {
          const parts = [];
          if (group.config.female_slots > 0) parts.push(`${group.config.female_slots}F`);
          if (group.config.male_slots > 0) parts.push(`${group.config.male_slots}M`);
          genderReq = ` (${parts.join(' + ')} required)`;
        }

        return `
          <h3>${group.name}</h3>
          <p class="meta">
            ${groupByLabel} • Teams of ${group.config.team_size}${genderReq}
            • ${group.eligible_institutions} eligible institution${group.eligible_institutions !== 1 ? 's' : ''}
          </p>
          ${filledPrizes.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Place</th>
                  <th>Institution</th>
                  <th>Points</th>
                  <th>Prize</th>
                </tr>
              </thead>
              <tbody>
                ${filledPrizes.map(prize => {
                  const winner = prize.winner_institution!;
                  const prizeText = [
                    prize.cash_amount > 0 ? `₹${prize.cash_amount}` : '',
                    prize.has_trophy ? '🏆' : '',
                    prize.has_medal ? '🥇' : '',
                  ].filter(Boolean).join(' ') || '—';
                  
                  return `
                    <tr>
                      <td>${getPlaceOrdinal(prize.place)}</td>
                      <td>
                        <strong>${winner.label}</strong>
                        <div style="font-size: 11px; color: #666;">
                          ${winner.players.map(p => `${p.name} (#${p.rank})`).join(', ')}
                        </div>
                      </td>
                      <td>${winner.total_points}</td>
                      <td>${prizeText}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          ` : `
            <p class="meta">No eligible institutions for this group.</p>
          `}
        `;
      }).join('')}
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <title>${tournament.title} - Prize Allocations v${version}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #1F6E5B; }
    h2 { color: #1F6E5B; margin-top: 30px; border-bottom: 2px solid #1F6E5B; padding-bottom: 5px; }
    h3 { color: #333; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #1F6E5B; color: white; }
    .meta { color: #666; margin: 10px 0; }
    @media print {
      body { margin: 20px; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${tournament.title}</h1>
  <div class="meta">
    <p><strong>Date:</strong> ${tournament.start_date} to ${tournament.end_date}</p>
    <p><strong>Venue:</strong> ${tournament.venue || 'N/A'}</p>
    <p><strong>Version:</strong> ${version}</p>
  </div>
  
  <h2>Individual Prize Allocations</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Player</th>
        <th>Category</th>
        <th>Prize</th>
        <th>Cash</th>
        <th>Trophy</th>
        <th>Medal</th>
      </tr>
    </thead>
    <tbody>
      ${allocations.map(a => `
        <tr>
          <td>${a.players?.rank || 'N/A'}</td>
          <td>${a.players?.name || 'N/A'}</td>
          <td>${a.prizes?.categories?.name || 'N/A'}</td>
          <td>Place ${a.prizes?.place || 'N/A'}</td>
          <td>₹${a.prizes?.cash_amount || 0}</td>
          <td>${a.prizes?.has_trophy ? '✓' : '—'}</td>
          <td>${a.prizes?.has_medal ? '✓' : '—'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  
  ${teamPrizesHtml}
  
  <p class="meta">Generated on ${new Date().toLocaleDateString()}</p>
</body>
</html>
  `;
}
