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

/**
 * Which allocation version a caller wants.
 *
 * Three distinct modes so that "caller did not specify" (organizer surfaces, default
 * `latest`) can never be confused with "pinned to nothing" (`pinned` with a null
 * version — a tournament published before it had any allocations).
 */
export type AllocationVersionSelector =
  | { mode: 'latest' }
  | { mode: 'pinned'; version: number | null }
  | { mode: 'unresolved' };

export async function getLatestAllocations(
  tournamentId: string,
  selector: AllocationVersionSelector = { mode: 'latest' }
): Promise<LatestAllocationsResult> {
  // Pin not loaded yet — fetch nothing rather than guess.
  if (selector.mode === 'unresolved') {
    return { allocations: [], version: null };
  }

  let version: number | null;

  if (selector.mode === 'pinned') {
    // Published with no allocations: the correct public output is nothing.
    if (selector.version === null) {
      return { allocations: [], version: null };
    }
    version = selector.version;
  } else {
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

    version = latestVersionRow?.version ?? null;
  }

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

  // No fallback to latest when a pinned version returns zero rows — that would
  // silently reopen the MAX() leak this pin exists to close.
  return { allocations: allocations || [], version };
}
