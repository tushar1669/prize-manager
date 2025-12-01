/**
 * RCA (Root Cause Analysis) XLSX export utility for prize allocations.
 * Exports engine vs final allocation comparison for audit/post-mortem.
 */

import { downloadWorkbookXlsx } from './excel';
import type { RcaRow } from '@/types/rca';

/**
 * Export RCA data to XLSX file.
 * Single sheet with one row per prize comparing engine vs final allocation.
 * 
 * @param rcaRows - Array of RCA row objects
 * @param tournamentSlug - Tournament slug for filename
 * @returns true if export succeeded, false otherwise
 */
export function exportRcaToXlsx(
  rcaRows: RcaRow[],
  tournamentSlug: string
): boolean {
  if (!rcaRows || rcaRows.length === 0) {
    console.warn('[rca-export] No RCA data to export');
    return false;
  }

  // Transform RCA rows into flat objects for Excel
  const rows = rcaRows.map(row => ({
    tournament_slug: row.tournament_slug ?? '',
    tournament_title: row.tournament_title ?? '',
    category_name: row.category_name ?? '',
    is_main: row.is_main ? 'Yes' : 'No',
    prize_place: row.prize_place,
    prize_label: row.prize_label ?? '',
    prize_type: capitalize(row.prize_type ?? 'other'),
    amount: row.amount ?? 0,
    
    engine_winner_player_id: row.engine_winner_player_id ?? '',
    engine_winner_name: row.engine_winner_name ?? '',
    engine_winner_rank: row.engine_winner_rank ?? '',
    engine_winner_rating: row.engine_winner_rating ?? '',
    
    final_winner_player_id: row.final_winner_player_id ?? '',
    final_winner_name: row.final_winner_name ?? '',
    final_winner_rank: row.final_winner_rank ?? '',
    final_winner_rating: row.final_winner_rating ?? '',
    
    status: row.status,
    override_reason: row.override_reason ?? '',
    
    reason_code: row.reason_code ?? '',
    reason_details: row.reason_details ?? '',
    diagnosis_summary: row.diagnosis_summary ?? '',
    
    is_unfilled: row.is_unfilled ? 'Yes' : 'No',
    is_blocked_by_one_prize: row.is_blocked_by_one_prize ? 'Yes' : 'No',
    
    candidates_before_one_prize: row.candidates_before_one_prize ?? 0,
    candidates_after_one_prize: row.candidates_after_one_prize ?? 0,
  }));

  // Generate filename with timestamp
  const today = new Date().toISOString().slice(0, 10);
  const safeSlug = (tournamentSlug || 'tournament')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  const filename = `allocation_rca_${safeSlug}_${today}.xlsx`;

  console.log('[rca-export] Exporting', rows.length, 'rows to', filename);

  return downloadWorkbookXlsx(filename, { RCA: rows });
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
