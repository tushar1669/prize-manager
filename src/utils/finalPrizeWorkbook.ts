import { supabase } from '@/integrations/supabase/client';
import { downloadWorkbookXlsx, sanitizeFilename } from '@/utils/excel';
import { buildFinalPrizeExportRows } from '@/utils/finalPrizeExport';
import { buildTeamPrizeExportRows } from '@/utils/teamPrizeExport';
import { fetchTeamPrizeResults } from '@/components/team-prizes/useTeamPrizeResults';
import type { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';

export type FinalWorkbookResult =
  | { ok: true; filename: string; winnerCount: number; teamCount: number }
  | { ok: false; reason: 'access_denied' | 'no_data' | 'team_data_unavailable' | 'write_failed' };

interface FinalWorkbookOptions {
  tournamentId: string;
  title?: string | null;
  winners: FinalPrizeWinnerRow[];
  hasFullAccess: boolean;
  /** Same team-allocation version selector as the surrounding final view. */
  teamAllocationVersion?: number;
}

/**
 * Both Finalize and Final Prize use this one guarded, four-sheet workbook contract.
 * A Team Prizes sheet is always present, even if a tournament has no team prizes.
 * Never silently omit team awards when their query fails.
 */
export async function downloadFinalPrizeWorkbook({
  tournamentId, title, winners, hasFullAccess, teamAllocationVersion,
}: FinalWorkbookOptions): Promise<FinalWorkbookResult> {
  if (!hasFullAccess) return { ok: false, reason: 'access_denied' };

  let teamRows: ReturnType<typeof buildTeamPrizeExportRows> = [];
  try {
    const { count, error } = await supabase
      .from('institution_prize_groups')
      .select('id', { head: true, count: 'exact' })
      .eq('tournament_id', tournamentId)
      .eq('is_active', true);
    if (error) return { ok: false, reason: 'team_data_unavailable' };

    if ((count ?? 0) > 0) {
      const data = await fetchTeamPrizeResults(tournamentId, teamAllocationVersion);
      if (!data || !Array.isArray(data.groups)) return { ok: false, reason: 'team_data_unavailable' };
      teamRows = buildTeamPrizeExportRows(data, hasFullAccess);
    }
  } catch {
    return { ok: false, reason: 'team_data_unavailable' };
  }

  const winnerRows = buildFinalPrizeExportRows(winners);
  if (!winnerRows.length && !teamRows.length) return { ok: false, reason: 'no_data' };

  const today = new Date().toISOString().slice(0, 10);
  const filename = `${sanitizeFilename(title || 'final_prize')}_final_prizes_${today}.xlsx`;
  const ok = downloadWorkbookXlsx(filename, {
    Winners: winnerRows,
    'Poster Grid': winnerRows,
    'Arbiter Sheet': winnerRows.map(row => ({ ...row, Signature: '' })),
    'Team Prizes': teamRows,
  });
  return ok
    ? { ok: true, filename, winnerCount: winnerRows.length, teamCount: teamRows.length }
    : { ok: false, reason: 'write_failed' };
}
