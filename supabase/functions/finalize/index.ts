import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, hasPingQueryParam, isPingBody, pingResponse } from "../_shared/health.ts";

const BUILD_VERSION = "2025-12-20T20:00:00Z";
const FUNCTION_NAME = "finalize";
const corsHeaders = CORS_HEADERS;

interface FinalizeRequest {
  tournamentId: string;
  winners: Array<{
    prizeId: string;
    playerId: string;
    reasons: string[];
    isManual: boolean;
  }>;
  ping?: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // Health check: ?ping=1 (before reading body)
    if (hasPingQueryParam(req)) {
      console.log(`[${FUNCTION_NAME}] ping via query param`);
      return pingResponse(FUNCTION_NAME, BUILD_VERSION);
    }

    // Read body as text for safe parsing
    const rawBody = await req.text();
    
    // Health check: empty body, "{}", or {"ping": true}
    if (isPingBody(rawBody)) {
      console.log(`[${FUNCTION_NAME}] ping via body`);
      return pingResponse(FUNCTION_NAME, BUILD_VERSION);
    }

    // Safe JSON parse
    let payload: FinalizeRequest;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      console.error(`[${FUNCTION_NAME}] JSON parse error:`, parseError);
      return new Response(
        JSON.stringify({ 
          error: "Invalid JSON payload", 
          hint: "Expected { tournamentId, winners[] }" 
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Validate required fields BEFORE auth
    const { tournamentId, winners } = payload;

    if (!tournamentId || typeof tournamentId !== 'string' || tournamentId.trim() === '') {
      console.error('[finalize] missing tournamentId');
      return new Response(
        JSON.stringify({ 
          error: "Missing tournamentId", 
          hint: "Provide a valid tournamentId in the request body" 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!winners || !Array.isArray(winners)) {
      console.error('[finalize] missing or invalid winners');
      return new Response(
        JSON.stringify({ 
          error: "Missing or invalid winners array", 
          hint: "Provide winners[] in the request body" 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (winners.length === 0) {
      console.error('[finalize] empty winners array');
      return new Response(
        JSON.stringify({ 
          error: "No allocations to finalize", 
          hint: "Run allocation before finalizing" 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Now proceed with auth and DB operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[finalize] missing auth header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', hint: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      console.error('[finalize] auth failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', hint: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: tournamentAccess, error: tournamentAccessError } = await supabaseClient
      .from('tournaments')
      .select('id, owner_id')
      .eq('id', tournamentId)
      .maybeSingle();

    if (tournamentAccessError) {
      console.error('[finalize] tournament access error:', tournamentAccessError.message);
      throw new Error(`Failed to load tournament access: ${tournamentAccessError.message}`);
    }

    if (!tournamentAccess) {
      console.error('[finalize] tournament not found:', tournamentId);
      return new Response(
        JSON.stringify({ error: 'Tournament not found', hint: 'Check the tournament ID' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: isMaster, error: roleError } = await supabaseClient
      .rpc('has_role', { _user_id: user.id, _role: 'master' });

    if (roleError) {
      console.error('[finalize] role check error:', roleError.message);
      throw new Error(`Failed to check user role: ${roleError.message}`);
    }

    if (tournamentAccess.owner_id !== user.id && !isMaster) {
      console.error('[finalize] forbidden - not owner or master');
      return new Response(
        JSON.stringify({ error: 'Forbidden', hint: 'You do not have access to this tournament' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[finalize] Finalizing tournament ${tournamentId} by user ${user.id}`);

    const { data: existingAllocations, error: nextVersionError } = await supabaseClient
      .from('allocations')
      .select('version')
      .eq('tournament_id', tournamentId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (nextVersionError) {
      console.error('[finalize] version fetch error:', nextVersionError.message);
      throw new Error(`Failed to fetch next version: ${nextVersionError.message}`);
    }

    const nextVersion = (existingAllocations?.version ?? 0) + 1;

    console.log(`[finalize] start tId=${tournamentId} winners=${winners.length} version=${nextVersion}`);

    // Insert new allocations
    const allocationsToInsert = winners.map(w => ({
      tournament_id: tournamentId,
      version: nextVersion,
      prize_id: w.prizeId,
      player_id: w.playerId,
      reason_codes: w.reasons,
      is_manual: w.isManual,
      decided_by: user.id,
      decided_at: new Date().toISOString()
    }));

    const { error: insertError } = await supabaseClient
      .from('allocations')
      .insert(allocationsToInsert);

    if (insertError) {
      console.error('[finalize] insert error:', insertError.message);
      throw new Error(`Failed to insert allocations: ${insertError.message}`);
    }

    // Update tournament status to 'finalized'
    const { error: updateError } = await supabaseClient
      .from('tournaments')
      .update({ 
        status: 'finalized',
        updated_at: new Date().toISOString()
      })
      .eq('id', tournamentId);

    if (updateError) {
      console.error('[finalize] update error:', updateError.message);
      throw new Error(`Failed to update tournament: ${updateError.message}`);
    }

    // Clear any open conflicts
    const { error: conflictError } = await supabaseClient
      .from('conflicts')
      .update({ status: 'resolved' })
      .eq('tournament_id', tournamentId)
      .eq('status', 'open');

    if (conflictError) {
      console.warn('[finalize] conflict update warning:', conflictError.message);
    }

    const allocationsCount = winners.length;

    console.log(`[finalize] ok version=${nextVersion} count=${allocationsCount}`);

    return new Response(
      JSON.stringify({
        version: nextVersion,
        allocationsCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    console.error('[finalize] Error:', {
      message: errMsg,
      stack: errStack
    });
    return new Response(
      JSON.stringify({ 
        error: errMsg || 'Internal server error',
        hint: 'Check edge function logs for details'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
