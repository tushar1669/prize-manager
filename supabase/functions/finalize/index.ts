import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // 1) Get current max version
    const { data: existingAllocations, error: versionError } = await supabaseClient
      .from('allocations')
      .select('version')
      .eq('tournament_id', tournamentId)
      .order('version', { ascending: false })
      .limit(1);

    const newVersion = (existingAllocations && existingAllocations.length > 0) 
      ? existingAllocations[0].version + 1 
      : 1;

    // 2) Insert new allocations
    const allocationsToInsert = winners.map(w => ({
      tournament_id: tournamentId,
      version: newVersion,
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

    // 3) Update tournament status to 'finalized'
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

    // 4) Clear any open conflicts
    const { error: conflictError } = await supabaseClient
      .from('conflicts')
      .update({ status: 'resolved' })
      .eq('tournament_id', tournamentId)
      .eq('status', 'open');

    if (conflictError) {
      console.warn(`Failed to update conflicts: ${conflictError.message}`);
    }

    console.log(`[finalize] Tournament ${tournamentId} finalized as version ${newVersion}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        version: newVersion,
        allocationsCount: winners.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[finalize] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
