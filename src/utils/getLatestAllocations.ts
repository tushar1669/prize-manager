import { supabase } from '@/integrations/supabase/client';

export interface LatestAllocationRow {
  player_id: string;
  prize_id: string;
  version: number;
}

export interface LatestAllocationsResult {
  allocations: LatestAllocationRow[];
  version: number | null;
}

export async function getLatestAllocations(tournamentId: string): Promise<LatestAllocationsResult> {
  const { data: latestVersionRow, error: latestError } = await supabase
    .from('allocations')
    .select('version')
    .eq('tournament_id', tournamentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw latestError;
  }

  const version = latestVersionRow?.version ?? null;

  if (!version) {
    return { allocations: [], version: null };
  }

  const { data: allocations, error: allocationError } = await supabase
    .from('allocations')
    .select('player_id, prize_id, version')
    .eq('tournament_id', tournamentId)
    .eq('version', version);

  if (allocationError) {
    throw allocationError;
  }

  return { allocations: allocations || [], version };
}
