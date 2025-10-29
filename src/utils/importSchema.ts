// src/utils/importSchema.ts
// Centralized header aliases, conflict types, and helper functions for player import

export const HEADER_ALIASES: Record<string, string[]> = {
  rank: ['rank', 'sr_no', 's_no', 'sno', 'seed', 'seeding', 'pos', 'position', 'rank#', '#'],
  name: ['name', 'player_name', 'full_name', 'player', 'playername'],
  rating: ['rating', 'elo', 'rtg', 'fide', 'fide_rating', 'elo_rating'],
  dob: ['dob', 'date_of_birth', 'birth_date', 'birthdate', 'd.o.b'],
  gender: ['gender', 'sex', 'g'],
  state: ['state', 'province', 'region', 'st'],
  city: ['city', 'town', 'location'],
  club: ['club', 'chess_club', 'organization', 'academy'],
  disability: ['disability', 'disability_type', 'pwd', 'ph', 'physically_handicapped', 'special_category'],
  special_notes: ['special_notes', 'notes', 'remarks', 'special_needs', 'accommodations', 'comments'],
  fide_id: ['fide_id', 'fideid', 'fide', 'id']
};

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
  
  // Pattern 3: Full date - normalize separators
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
