/**
 * Player name display utilities.
 * 
 * IMPORTANT: We always display FULL names. No abbreviation or initial formatting.
 * This helper ensures consistent name display across the application.
 */

export interface PlayerNameOptions {
  /** Maximum characters before truncation (0 = no limit) */
  maxLength?: number;
  /** Fallback text when name is empty/null */
  fallback?: string;
}

export interface PlayerNameSource {
  full_name?: string | null;
  name?: string | null;
}

/**
 * Get the display name for a player.
 * 
 * Returns the full name without any abbreviation.
 * Use CSS truncation + title attribute for layout overflow handling.
 * 
 * @param name - Player name from database
 * @param options - Display options
 * @returns Full name or fallback
 */
export function getPlayerDisplayName(
  source: string | PlayerNameSource | null | undefined,
  options: PlayerNameOptions = {}
): string {
  const { maxLength = 0, fallback = 'Unknown Player' } = options;

  const rawName = typeof source === 'string'
    ? source
    : source?.full_name ?? source?.name;

  const fullName = rawName?.trim() || fallback;
  
  if (maxLength > 0 && fullName.length > maxLength) {
    return fullName.slice(0, maxLength - 1) + '…';
  }
  
  return fullName;
}

/**
 * Check if a name needs truncation at a given length.
 * Useful for determining whether to show a tooltip.
 */
export function nameNeedsTruncation(
  source: string | PlayerNameSource | null | undefined,
  maxLength: number
): boolean {
  const rawName = typeof source === 'string'
    ? source
    : source?.full_name ?? source?.name;

  return (rawName?.trim()?.length ?? 0) > maxLength;
}
