// Types for Institution/Team Prizes feature

export interface InstitutionPrizeGroup {
  id: string;
  tournament_id: string;
  name: string;
  group_by: string;
  team_size: number;
  female_slots: number;
  male_slots: number;
  scoring_mode: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface InstitutionPrize {
  id?: string;
  group_id: string;
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  is_active: boolean;
  created_at?: string;
  // Local state tracking
  _tempId?: string;
  _status?: 'new' | 'dirty' | 'clean' | 'deleted';
  _error?: string;
}

export interface InstitutionPrizeDelta {
  inserts: Omit<InstitutionPrize, 'id' | '_tempId' | '_status' | '_error'>[];
  updates: (Omit<InstitutionPrize, '_tempId' | '_status' | '_error'> & { id: string })[];
  deletes: string[];
}

// Maps group_by codes to players table columns
export const GROUP_BY_OPTIONS: Array<{
  value: string;
  label: string;
  column: string;
  description: string;
}> = [
  { value: 'club', label: 'School / Academy / Club', column: 'club', description: 'Uses the club field from player data' },
  { value: 'city', label: 'City', column: 'city', description: 'Groups players by their city' },
  { value: 'state', label: 'State', column: 'state', description: 'Groups players by their state' },
  { value: 'group_label', label: 'Swiss Group (Gr column)', column: 'group_label', description: 'Uses the Gr column from Swiss-Manager export' },
  { value: 'type_label', label: 'Swiss Type (Type column)', column: 'type_label', description: 'Uses the Type column from Swiss-Manager export' },
];

export const SCORING_MODE_OPTIONS: Array<{
  value: string;
  label: string;
  description: string;
}> = [
  { value: 'by_top_k_score', label: 'Sum of Top-K Scores', description: 'Sum the scores of the best K players per team' },
  // Future modes can be added here
];
