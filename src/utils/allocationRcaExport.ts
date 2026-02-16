/**
 * RCA (Root Cause Analysis) XLSX export utility for prize allocations.
 * Exports engine vs final allocation comparison for audit/post-mortem.
 */

import { downloadWorkbookXlsx } from './excel';
import { buildExportFilenameSlug } from './exportSlug';
import type { RcaRow } from '@/types/rca';
import { getReasonLabel, type UnfilledReasonCode } from '@/types/allocation';

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

  const unfilledRows = rcaRows.filter(row => row.is_unfilled);
  if (unfilledRows.length === 0) {
    console.warn('[rca-export] No unfilled prize rows to export');
    return false;
  }

  // Transform RCA rows into flat objects for Excel
  const rows = unfilledRows.map(row => ({
    Category: row.category_name ?? '',
    Place: row.prize_place,
    'Prize Label': row.prize_label ?? '',
    'Prize Type': capitalize(row.prize_type ?? 'other'),
    Amount: row.amount ?? 0,
    'Has Gift': row.has_gift ? 'Yes' : 'No',
    'Gift Items': formatGiftItems(row.gift_items),
    'Root Cause': row.reason_code ? getReasonLabel(row.reason_code) : '',
    Diagnosis: row.diagnosis_summary ?? row.reason_details ?? '',
    Eligible: row.candidates_before_one_prize ?? 0,
    Available: row.candidates_after_one_prize ?? 0,
    'Suggested Fix': getSuggestedFix(row.reason_code),
    'Fail Codes': (row.raw_fail_codes ?? []).join(', '),
  }));

  // Generate filename with timestamp
  const today = new Date().toISOString().slice(0, 10);
  const safeSlug = buildExportFilenameSlug(tournamentSlug);

  const filename = `allocation_rca_${safeSlug}_${today}.xlsx`;

  console.log('[rca-export] Exporting', rows.length, 'rows to', filename);

  return downloadWorkbookXlsx(filename, { RCA: rows });
}

function formatGiftItems(items?: Array<{ name?: string; qty?: number }>): string {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items
    .map((item) => {
      const name = String(item?.name ?? '').trim();
      if (!name) return '';
      const qty = Number(item?.qty) || 1;
      return `${name} x${qty}`;
    })
    .filter(Boolean)
    .join('; ');
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function getSuggestedFix(reasonCode: UnfilledReasonCode | null): string {
  switch (reasonCode) {
    case 'BLOCKED_BY_ONE_PRIZE_POLICY':
      return 'Adjust prize amounts, add more prizes, or broaden criteria to increase candidate spread.';
    case 'NO_ELIGIBLE_PLAYERS':
      return 'Verify prize criteria and player import completeness.';
    case 'TOO_STRICT_CRITERIA_RATING':
      return 'Relax the rating requirement or widen rating bounds for this prize.';
    case 'TOO_STRICT_CRITERIA_AGE':
      return 'Relax age criteria and confirm DOB data is complete and valid.';
    case 'TOO_STRICT_CRITERIA_GENDER':
      return 'Relax gender criteria or update category definitions to match intended eligibility.';
    case 'TOO_STRICT_CRITERIA_LOCATION':
      return 'Relax location constraints (state/city/club) or verify player location data quality.';
    case 'TOO_STRICT_CRITERIA_TYPE_OR_GROUP':
      return 'Relax player type/group requirements or adjust group mappings.';
    case 'CATEGORY_INACTIVE':
      return 'Enable the category or remove/reassign this prize.';
    case 'INTERNAL_ERROR':
      return 'Contact support and include the tournament id for investigation.';
    default:
      return '';
  }
}
