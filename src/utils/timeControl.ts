/**
 * FIDE-style time control classification
 * Based on estimated time to complete 60 moves
 */

export type TimeControlCategory = 'BLITZ' | 'RAPID' | 'CLASSICAL' | 'UNKNOWN';

/**
 * Classify a time control according to FIDE standards
 * 
 * Formula: totalMinutesFor60Moves = baseMinutes + (incrementSeconds * 60 moves) / 60
 * Simplified: totalMinutesFor60Moves = baseMinutes + incrementSeconds
 * 
 * Classification:
 * - BLITZ: ≤ 10 minutes
 * - RAPID: > 10 and < 60 minutes
 * - CLASSICAL: ≥ 60 minutes
 * - UNKNOWN: missing base time
 * 
 * @param baseMinutes - Base time in minutes (e.g., 5, 15, 90)
 * @param incrementSeconds - Increment in seconds per move (e.g., 3, 10, 30)
 * @returns TimeControlCategory
 */
export function classifyTimeControl(
  baseMinutes: number | null | undefined,
  incrementSeconds: number | null | undefined
): TimeControlCategory {
  // Missing base time
  if (baseMinutes == null || baseMinutes <= 0) {
    return 'UNKNOWN';
  }

  // Calculate total time for 60 moves
  // Each move adds incrementSeconds, so 60 moves add 60 * incrementSeconds seconds
  // Convert to minutes: (60 * incrementSeconds) / 60 = incrementSeconds minutes
  const totalMinutes = baseMinutes + (incrementSeconds ?? 0);

  // FIDE classification
  if (totalMinutes <= 10) {
    return 'BLITZ';
  } else if (totalMinutes < 60) {
    return 'RAPID';
  } else {
    return 'CLASSICAL';
  }
}
