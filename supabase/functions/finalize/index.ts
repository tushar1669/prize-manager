import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://prize-manager.lovable.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

interface FinalizeRequest {
  tournamentId: string;
  winners: Array<{
    prizeId: string;
    playerId: string;
    reasons: string[];
    isManual: boolean;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload: FinalizeRequest = await req.json();
    const { tournamentId, winners } = payload;

    if (!winners || winners.length === 0) {
      console.error('[finalize] error no_winners');
      return new Response(
        '[finalize] error no_winners',
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      );
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization required');
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
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
      throw new Error(`Failed to fetch next version: ${nextVersionError.message}`);
    }

    const nextVersion = (existingAllocations?.version ?? 0) + 1;

    console.log(`[finalize] start tId=${tournamentId} winners=${winners.length}`);

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
      throw new Error(`Failed to update tournament: ${updateError.message}`);
    }

    // Clear any open conflicts
    const { error: conflictError } = await supabaseClient
      .from('conflicts')
      .update({ status: 'resolved' })
      .eq('tournament_id', tournamentId)
      .eq('status', 'open');

    if (conflictError) {
      console.warn(`Failed to update conflicts: ${conflictError.message}`);
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

  } catch (error: any) {
    console.error('[finalize] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
