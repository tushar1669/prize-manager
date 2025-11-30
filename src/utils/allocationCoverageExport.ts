// Allocation coverage XLSX export utility
import { downloadWorkbookXlsx } from './excel';
import type { AllocationCoverageEntry } from '@/types/allocation';

/**
 * Export allocation coverage data to XLSX file
 * Uses the same XLSX helper as player exports (NO CSV)
 */
export function exportCoverageToXlsx(
  coverage: AllocationCoverageEntry[],
  tournamentNameOrSlug: string
): boolean {
  if (!coverage || coverage.length === 0) {
    console.warn('[coverage-export] No coverage data to export');
    return false;
  }

  // Transform coverage entries into flat rows for Excel
  const rows = coverage.map(entry => ({
    category_name: entry.category_name ?? '',
    is_main: entry.is_main ? 'Yes' : 'No',
    prize_place: entry.prize_place,
    prize_label: entry.prize_label ?? '',
    prize_type: entry.prize_type ?? '',
    amount: entry.amount ?? 0,
    is_unfilled: entry.is_unfilled ? 'Yes' : 'No',
    is_blocked_by_one_prize: entry.is_blocked_by_one_prize ? 'Yes' : 'No',
    winner_player_id: entry.winner_player_id ?? '',
    winner_name: entry.winner_name ?? '',
    winner_rank: entry.winner_rank ?? '',
    winner_rating: entry.winner_rating ?? '',
    candidates_before_one_prize: entry.candidates_before_one_prize ?? 0,
    candidates_after_one_prize: entry.candidates_after_one_prize ?? 0,
    reason_code: entry.reason_code ?? '',
    raw_fail_codes: (entry.raw_fail_codes ?? []).join(', '),
  }));

  // Generate filename with timestamp
  const today = new Date().toISOString().slice(0, 10);
  const safeSlug = (tournamentNameOrSlug || 'tournament')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  
  const filename = `allocation_coverage_${safeSlug}_${today}.xlsx`;

  console.log('[coverage-export] Exporting', rows.length, 'entries to', filename);
  
  return downloadWorkbookXlsx(filename, { AllocationCoverage: rows });
}
