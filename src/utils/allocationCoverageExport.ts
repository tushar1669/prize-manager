// Allocation coverage XLSX export utility
import { downloadWorkbookXlsx } from './excel';
import type { AllocationCoverageEntry } from '@/types/allocation';
import { getReasonLabel } from '@/types/allocation';

/**
 * Export allocation coverage data to XLSX file
 * Uses the same XLSX helper as player exports
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
    Category: entry.category_name ?? '',
    'Is Main': entry.is_main ? 'Yes' : 'No',
    Place: entry.prize_place,
    'Prize Label': entry.prize_label ?? '',
    'Prize Type': entry.prize_type ?? '',
    Amount: entry.amount ?? 0,
    'Has Trophy': entry.has_trophy ? 'Yes' : 'No',
    'Has Medal': entry.has_medal ? 'Yes' : 'No',
    Status: entry.is_unfilled ? 'Unfilled' : 'Filled',
    'Winner Name': entry.winner_name ?? '',
    'Winner Rank': entry.winner_rank ?? '',
    'Winner Rating': entry.winner_rating ?? '',
    Eligible: entry.candidates_before_one_prize ?? 0,
    Available: entry.candidates_after_one_prize ?? 0,
    'Reason Label': entry.reason_code ? getReasonLabel(entry.reason_code) : '',
    Diagnosis: entry.diagnosis_summary ?? '',
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
