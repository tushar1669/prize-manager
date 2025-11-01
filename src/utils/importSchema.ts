// src/utils/importSchema.ts
// Centralized header aliases, conflict types, and helper functions for player import

export const HEADER_ALIASES: Record<string, string[]> = {
  // CRITICAL: rank and sno MUST BE SEPARATE (Swiss-Manager has both columns)
  rank: ['rank', 'rk', 'final_rank', 'position', 'pos'], // NO SNo here!
  sno: ['sno', 's_no', 'sno.', 'start_no', 'startno', 'seed', 'seeding', 'sr_no', 'srno'], // Start Number (distinct from rank)
  
  // Rating with priority (Rtg preferred over IRtg for Swiss-Manager)
  rating: ['rtg', 'irtg', 'nrtg', 'rating', 'elo', 'fide_rating', 'std', 'standard'],
  
  name: ['name', 'player_name', 'full_name', 'player', 'playername', 'participant'],
  
  // Swiss-Manager uses "Birth" header (not "DOB")
  dob: ['birth', 'dob', 'date_of_birth', 'birth_date', 'birthdate', 'd.o.b', 'd_o_b'],
  
  // Swiss-Manager uses "fs" for female indicator column
  gender: ['fs', 'gender', 'sex', 'g', 'm/f', 'boy/girl', 'b/g'],
  
  state: ['state', 'province', 'region', 'st', 'association'],
  city: ['city', 'town', 'location', 'place'],
  club: ['club', 'chess_club', 'organization', 'academy', 'team'],
  
  // Swiss-Manager uses "Fide-No." (with period and hyphen)
  fide_id: ['fide-no.', 'fide_no', 'fide-no', 'fideno', 'fide_id', 'fideid', 'fide', 'id'],
  
  // Additional Swiss-Manager fields
  federation: ['fed', 'fed.', 'federation', 'country', 'nat', 'fide_fed'],
  
  disability: ['disability', 'disability_type', 'pwd', 'ph', 'physically_handicapped', 'special_category'],
  special_notes: ['special_notes', 'notes', 'remarks', 'special_needs', 'accommodations', 'comments'],
  
  // Support for unrated flag detection
  unrated: ['unrated', 'urated', 'u_r', 'u-rated', 'u/r', 'not_rated']
};

/**
 * Rating column priority for Swiss-Manager files
 * Prefer Rtg (current rating) over IRtg (initial rating)
 */
export const RATING_COLUMN_PRIORITY = ['rtg', 'irtg', 'nrtg', 'rating', 'elo', 'std'];

/**
 * Unified header normalization for matching
 * Strips punctuation, collapses spaces, converts to lowercase
 * Used consistently across PlayerImport and ColumnMappingDialog
 */
export function normalizeHeaderForMatching(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')  // Remove all punctuation (periods, hyphens, etc.)
    .replace(/\s+/g, '_');     // Collapse spaces to underscore
}

/**
 * Select the best rating column when multiple are present
 * Returns the original column name (preserves case)
 */
export function selectBestRatingColumn(detectedColumns: string[]): string | null {
  const normalized = detectedColumns.map(c => normalizeHeaderForMatching(c));
  
  for (const preferred of RATING_COLUMN_PRIORITY) {
    const idx = normalized.indexOf(normalizeHeaderForMatching(preferred));
    if (idx >= 0) {
      console.log(`[importSchema] Selected rating column: '${detectedColumns[idx]}' (priority: ${preferred})`);
      return detectedColumns[idx]; // Return original case
    }
  }
  
  return null;
}

export type ImportConflictType = 
  | 'duplicate_in_file' 
  | 'already_exists' 
  | 'conflict_different_dob'
  | 'conflict_different_rating';

export interface ImportConflict {
  row: number;
  playerId?: string;
  type: ImportConflictType;
  message: string;
  existingPlayer?: {
    id: string;
    name: string;
    dob?: string | null;
    rating?: number | null;
    fide_id?: string | null;
  };
}

// Normalize name for comparison (lowercase, trim, collapse spaces)
export function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Generate unique key for duplicate detection
export function generatePlayerKey(player: { 
  name: string; 
  dob?: string | null; 
  fide_id?: string | null 
}): string {
  if (player.fide_id) return `fide:${player.fide_id}`;
  if (player.name && player.dob) {
    return `name-dob:${normalizeName(player.name)}|${player.dob}`;
  }
  return `name:${normalizeName(player.name)}`;
}

/**
 * Normalize DOB for API/import
 * Handles: YYYY, YYYY/00/00, YYYY-00-00, YYYY\00\00, full dates
 * Returns: { dob_raw, dob, inferred, inferredReason }
 */
export function normalizeDobForImport(input?: string | null): { 
  dob_raw: string | null; 
  dob: string | null; 
  inferred: boolean;
  inferredReason?: string;
} {
  if (!input) return { dob_raw: null, dob: null, inferred: false };
  
  const raw = String(input).trim();
  if (!raw) return { dob_raw: null, dob: null, inferred: false };
  
  // Pattern 1: Year only (YYYY)
  const yOnlyMatch = /^(\d{4})$/.exec(raw);
  if (yOnlyMatch) {
    const year = yOnlyMatch[1];
    return { 
      dob_raw: raw, 
      dob: `${year}-01-01`, 
      inferred: true,
      inferredReason: 'Year only - assumed Jan 1'
    };
  }
  
  // Pattern 2: YYYY/00/00 or YYYY-00-00 or YYYY\00\00
  const yZeroMatch = /^(\d{4})[\\/\-]00[\\/\-]00$/.exec(raw);
  if (yZeroMatch) {
    const year = yZeroMatch[1];
    return {
      dob_raw: raw,
      dob: `${year}-01-01`,
      inferred: true,
      inferredReason: 'Unknown month/day - assumed Jan 1'
    };
  }

  // Pattern 3: YYYY/MM/00 where month present but day missing
  const yearMonthOnlyMatch = /^(\d{4})[\\/\-](\d{2})[\\/\-]00$/.exec(raw);
  if (yearMonthOnlyMatch) {
    const year = yearMonthOnlyMatch[1];
    const month = yearMonthOnlyMatch[2];
    if (month !== '00') {
      return {
        dob_raw: raw,
        dob: `${year}-${month}-01`,
        inferred: true,
        inferredReason: 'Unknown day - assumed first of month'
      };
    }
  }

  // Pattern 4: Full date - normalize separators
  const normalized = raw.replace(/\//g, '-').replace(/\\/g, '-');
  
  // Validate full date format
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return { 
      dob_raw: raw, 
      dob: normalized, 
      inferred: false 
    };
  }
  
  // Invalid format - let validation catch it
  return { 
    dob_raw: raw, 
    dob: null, 
    inferred: false 
  };
}
