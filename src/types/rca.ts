/**
 * RCA (Root Cause Analysis) export types for prize allocations.
 * Used to compare engine-allocated winners vs final committed winners.
 */

import type { AllocationCoverageEntry, UnfilledReasonCode } from './allocation';

/**
 * Status of a prize in the RCA export.
 */
export type RcaStatus = 
  | 'MATCH'            // Engine winner == final winner (or both unfilled)
  | 'OVERRIDDEN'       // Different player in final vs engine
  | 'NO_ELIGIBLE_WINNER'; // No final winner (prize unfilled)

/**
 * A single row in the RCA export.
 */
export interface RcaRow {
  // Tournament context
  tournament_slug: string;
  tournament_title: string;
  
  // Category & prize info
  category_name: string;
  is_main: boolean;
  prize_place: number;
  prize_label: string;
  prize_type: 'cash' | 'trophy' | 'medal' | 'other';
  amount: number | null;
  
  // Engine winner (from Preview allocation)
  engine_winner_player_id: string | null;
  engine_winner_name: string | null;
  engine_winner_rank: number | null;
  engine_winner_rating: number | null;
  
  // Final winner (from committed allocation)
  final_winner_player_id: string | null;
  final_winner_name: string | null;
  final_winner_rank: number | null;
  final_winner_rating: number | null;
  
  // Status comparison
  status: RcaStatus;
  override_reason: string | null;
  
  // Diagnostic info (for unfilled prizes)
  reason_code: UnfilledReasonCode | null;
  reason_details: string | null;
  diagnosis_summary: string | null;
  raw_fail_codes: string[];
  
  // Flags
  is_unfilled: boolean;
  is_blocked_by_one_prize: boolean;
  
  // Additional debug stats
  candidates_before_one_prize: number;
  candidates_after_one_prize: number;
}

/**
 * Winner entry from allocation (matches ConflictReview's Winner interface)
 */
export interface WinnerEntry {
  prizeId: string;
  playerId: string;
  reasons: string[];
  isManual: boolean;
}

/**
 * Player info for populating final winner details
 */
export interface PlayerInfo {
  id: string;
  name?: string | null;
  rank?: number | null;
  rating?: number | null;
}

/**
 * Build RCA rows from coverage data and final winners.
 * 
 * @param coverage - Coverage entries from Preview allocation
 * @param winners - Final winner entries (after Commit)
 * @param players - Player lookup for final winner details
 * @param tournamentSlug - Tournament slug
 * @param tournamentTitle - Tournament title
 * @returns Array of RcaRow objects
 */
export function buildRcaRows(
  coverage: AllocationCoverageEntry[],
  winners: WinnerEntry[],
  players: PlayerInfo[],
  tournamentSlug: string,
  tournamentTitle: string
): RcaRow[] {
  // Build lookup maps
  const winnerByPrize = new Map<string, WinnerEntry>();
  for (const w of winners) {
    winnerByPrize.set(w.prizeId, w);
  }
  
  const playerById = new Map<string, PlayerInfo>();
  for (const p of players) {
    playerById.set(p.id, p);
  }
  
  const rows: RcaRow[] = [];
  
  for (const entry of coverage) {
    const finalWinner = winnerByPrize.get(entry.prize_id);
    const finalPlayer = finalWinner ? playerById.get(finalWinner.playerId) : null;
    
    // Determine status
    let status: RcaStatus;
    if (!finalWinner) {
      status = 'NO_ELIGIBLE_WINNER';
    } else if (entry.winner_player_id === finalWinner.playerId) {
      status = 'MATCH';
    } else {
      status = 'OVERRIDDEN';
    }
    
    // Extract override reason from winner's reasons if it's manual
    let overrideReason: string | null = null;
    if (finalWinner?.isManual && finalWinner.reasons?.length > 0) {
      overrideReason = finalWinner.reasons
        .filter(r => r.includes('override') || r.includes('manual'))
        .join('; ') || null;
    }
    
    rows.push({
      tournament_slug: tournamentSlug,
      tournament_title: tournamentTitle,
      
      category_name: entry.category_name,
      is_main: entry.is_main,
      prize_place: entry.prize_place,
      prize_label: entry.prize_label,
      prize_type: entry.prize_type,
      amount: entry.amount,
      
      engine_winner_player_id: entry.winner_player_id,
      engine_winner_name: entry.winner_name,
      engine_winner_rank: entry.winner_rank,
      engine_winner_rating: entry.winner_rating,
      
      final_winner_player_id: finalWinner?.playerId ?? null,
      final_winner_name: finalPlayer?.name ?? null,
      final_winner_rank: finalPlayer?.rank ?? null,
      final_winner_rating: finalPlayer?.rating ?? null,
      
      status,
      override_reason: overrideReason,
      
      reason_code: entry.reason_code,
      reason_details: entry.reason_details,
      diagnosis_summary: entry.diagnosis_summary ?? null,
      raw_fail_codes: entry.raw_fail_codes ?? [],
      
      is_unfilled: entry.is_unfilled,
      is_blocked_by_one_prize: entry.is_blocked_by_one_prize,
      
      candidates_before_one_prize: entry.candidates_before_one_prize,
      candidates_after_one_prize: entry.candidates_after_one_prize,
    });
  }
  
  return rows;
}
