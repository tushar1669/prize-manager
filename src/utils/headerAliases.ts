// src/utils/headerAliases.ts
// Canonical → variant aliases for import parsing (header auto-mapping)

export const ALIASES: Record<string, string[]> = {
  // CRITICAL: rank and sno MUST BE SEPARATE (Swiss-Manager has both columns)
  rank: ['rank', 'rk', 'final_rank', 'position', 'pos'], // NO SNo here!
  sno: ['sno', 's_no', 'sno.', 'start_no', 'startno', 'seed', 'seeding', 'sr_no', 'srno'], // Start Number (distinct from rank)

  // Rating with priority (Rtg preferred over IRtg for Swiss-Manager)
  rating: ['rtg', 'irtg', 'nrtg', 'rating', 'elo', 'fide_rating', 'std', 'standard'],

  name: ['name', 'player_name', 'player', 'playername', 'participant'],
  full_name: ['full_name', 'full name', 'fullname', 'name.1', 'name_1', 'name1', 'name (full)'],

  // Swiss-Manager uses "Birth" header (not "DOB")
  dob: ['birth', 'dob', 'date_of_birth', 'birth_date', 'birthdate', 'd.o.b', 'd_o_b'],

  // Generic gender aliases (including Swiss-Manager's 'fs' column)
  gender: ['gender', 'sex', 'g', 'm/f', 'boy/girl', 'b/g', 'fs'],

  state: ['state', 'province', 'region', 'st', 'association'],
  city: ['city', 'town', 'location', 'place'],
  club: ['club', 'chess_club', 'organization', 'academy', 'team'],

  // Swiss-Manager uses "Fide-No." (with period and hyphen)
  fide_id: ['fide-no.', 'fide_no', 'fide-no', 'fideno', 'fide_id', 'fideid', 'fide', 'id'],

  // Swiss-Manager Ident column (contains state codes, e.g., IND/KA/10203)
  ident: ['ident', 'player-id', 'player_id', 'pid', 'id_no'],

  // Additional Swiss-Manager fields
  federation: ['federation', 'country', 'nat', 'nationality', 'fide_fed'], // Full federation name
  fed_code: ['fed', 'fed.', 'fid'], // 3-letter FIDE federation code
  gr: ['gr'],

  // Swiss-Manager Type column (generic category: PC, S60, F14, U15, Section A, etc.)
  type: ['type'],

  disability: ['disability', 'disability_type', 'pwd', 'ph', 'physically_handicapped', 'special_category'],
  special_notes: ['special_notes', 'notes', 'remarks', 'special_needs', 'accommodations', 'comments'],

  // Support for unrated flag detection
  unrated: ['unrated', 'urated', 'u_r', 'u-rated', 'u/r', 'not_rated'],
};
