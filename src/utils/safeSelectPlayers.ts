import { supabase } from '@/integrations/supabase/client';

/**
 * Schema sniff helper: try a star-select to detect available columns
 * Returns column names if at least one row exists, null otherwise
 */
async function sniffPlayerColumns(tournament_id?: string): Promise<string[] | null> {
  let q = supabase.from('players').select('*').limit(1);
  if (tournament_id) q = q.eq('tournament_id', tournament_id);
  const { data, error } = await q;
  if (error) return null;
  const sample = (data && data[0]) || null;
  if (!sample) return null; // no rows → cannot sniff; fall back to retry loop
  return Object.keys(sample);
}

/**
 * Safely select columns from players table with automatic fallback.
 * 
 * Strategy:
 * - Tries preferred column set first
 * - On 42703 error (missing column), parses which column failed
 * - Removes that column and retries
 * - Repeats up to 8 times until success or exhaustion
 * - Logs each retry with clear context
 * 
 * @param filters - Supabase query filters (e.g., { tournament_id: 'xxx' } or { ids: [...] })
 * @param preferredCols - Columns to try selecting (falls back gracefully)
 * @param orderBy - Optional order clause
 * @returns { data, count, usedColumns } where usedColumns shows what worked
 */
export async function safeSelectPlayers(
  filters: { tournament_id?: string; ids?: string[] },
  preferredCols: string[] = [
    'id', 'name', 'rank', 'sno', 
    'rating', 'dob', 'gender', 'fide_id', 
    'state', 'city', 'club', 'disability', 'unrated',
    'federation', 'dob_raw'
  ],
  orderBy?: { column: string; ascending: boolean; nullsFirst?: boolean }
): Promise<{ data: any[]; count: number; usedColumns: string[] }> {
  
  // FAST PATH: if we can sniff columns, intersect instead of provoking 400s
  const sniffed = await sniffPlayerColumns(filters.tournament_id);
  if (sniffed && sniffed.length) {
    const lower = new Set(sniffed.map(s => s.toLowerCase()));
    const intersect = preferredCols.filter(c => lower.has(c.toLowerCase()));
    const selectStr = intersect.length ? intersect.join(',') : 'id';

    let q = supabase.from('players').select(selectStr, { count: 'exact', head: false });
    if (filters.tournament_id) q = q.eq('tournament_id', filters.tournament_id);
    if (filters.ids?.length)   q = q.in('id', filters.ids);
    if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending, nullsFirst: orderBy.nullsFirst });

    const { data, error, count } = await q;
    if (!error) {
      console.log('[import] ✓ players safe-select (sniff fast path)', { usedColumns: intersect, count });
      return { data: data ?? [], count: count ?? (data?.length ?? 0), usedColumns: intersect };
    }
    // fall through to retry path if something odd happens
  }

  let cols = [...preferredCols];
  const tried: string[][] = [];
  const maxAttempts = 8;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    tried.push([...cols]);
    const selectStr = cols.join(',');

    // Build query
    let query = supabase
      .from('players')
      .select(selectStr, { count: 'exact', head: false });

    // Apply filters
    if (filters.tournament_id) {
      query = query.eq('tournament_id', filters.tournament_id);
    }
    if (filters.ids && filters.ids.length > 0) {
      query = query.in('id', filters.ids);
    }

    // Apply ordering if specified
    if (orderBy) {
      query = query.order(orderBy.column, { 
        ascending: orderBy.ascending,
        nullsFirst: orderBy.nullsFirst 
      });
    }

    const { data, error, count } = await query;

    // Success!
    if (!error) {
      if (attempt > 0) {
        console.log('[import] ✓ players safe-select succeeded after retries', { 
          attempt: attempt + 1, 
          usedColumns: cols, 
          removedColumns: preferredCols.filter(c => !cols.includes(c)),
          count 
        });
      } else {
        console.log('[import] ✓ players safe-select OK', { usedColumns: cols, count });
      }
      return { data: data ?? [], count: count ?? (data?.length ?? 0), usedColumns: cols };
    }

    // Parse error for missing column
    const errorMsg = (error.message || '').toLowerCase();
    const columnMatch = /column\s+(?:players\.)?([a-z0-9_]+)\s+does not exist/i.exec(errorMsg);
    
    if (error.code === '42703' && columnMatch && columnMatch[1]) {
      const missingCol = columnMatch[1];
      console.info(`[import] ℹ️  players safe-select retry ${attempt + 1}/${maxAttempts} (dropping missing column)`, { 
        missingColumn: missingCol, 
        previousColumns: cols 
      });
      
      // Remove the problematic column and try again
      cols = cols.filter(c => c.toLowerCase() !== missingCol.toLowerCase());
      
      if (cols.length === 0) {
        console.error('[import] ❌ players safe-select exhausted: no columns left');
        return { data: [], count: 0, usedColumns: [] };
      }
      
      continue;
    }

    // Unknown error - give up
    console.error('[import] ❌ players safe-select failed (unknown error)', { 
      attempts: attempt + 1,
      tried,
      errorCode: error.code,
      errorMessage: error.message,
      errorHint: (error as any)?.hint 
    });
    return { data: [], count: 0, usedColumns: [] };
  }

  // Exhausted all attempts
  console.error('[import] ❌ players safe-select exhausted retries', { tried, maxAttempts });
  return { data: [], count: 0, usedColumns: [] };
}

/**
 * Convenience wrapper for fetching players by tournament ID
 */
export async function safeSelectPlayersByTournament(
  tournamentId: string,
  preferredCols?: string[],
  orderBy?: { column: string; ascending: boolean; nullsFirst?: boolean }
) {
  return safeSelectPlayers({ tournament_id: tournamentId }, preferredCols, orderBy);
}

/**
 * Convenience wrapper for fetching players by IDs
 */
export async function safeSelectPlayersByIds(
  playerIds: string[],
  preferredCols?: string[]
) {
  return safeSelectPlayers({ ids: playerIds }, preferredCols);
}
