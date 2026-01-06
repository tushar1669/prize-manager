import { z } from "zod";

// Helper for optional URL fields - validates URL format if provided, allows empty string
const optionalUrl = (maxLen = 500) => 
  z.string()
    .max(maxLen, `URL must be less than ${maxLen} characters`)
    .refine(
      (val) => !val || val === '' || /^https?:\/\/.+/.test(val),
      { message: "Must be a valid URL starting with http:// or https://" }
    )
    .optional()
    .or(z.literal(''));

// Tournament Details schema with comprehensive input validation
export const tournamentDetailsSchema = z.object({
  title: z.string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must be less than 200 characters"),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  venue: z.string().trim().max(200, "Venue must be less than 200 characters").optional(),
  city: z.string().trim().max(100, "City must be less than 100 characters").optional(),
  event_code: z.string().trim().max(50, "Event code must be less than 50 characters").optional(),
  notes: z.string().trim().max(5000, "Notes must be less than 5000 characters").optional(),
  brochure_url: z.string().max(500, "Brochure URL must be less than 500 characters").optional(),
  chessresults_url: optionalUrl(500),
  public_results_url: optionalUrl(500),
  // Metadata fields with sensible limits
  time_control_base_minutes: z.number().int().min(0).max(1440, "Max 1440 minutes").nullable().optional(),
  time_control_increment_seconds: z.number().int().min(0).max(3600, "Max 3600 seconds").nullable().optional(),
  chief_arbiter: z.string().trim().max(200, "Chief arbiter name must be less than 200 characters").optional(),
  tournament_director: z.string().trim().max(200, "Tournament director name must be less than 200 characters").optional(),
  entry_fee_amount: z.number().min(0).max(1000000, "Entry fee seems too high").nullable().optional(),
  cash_prize_total: z.number().min(0).max(100000000, "Prize total seems too high").nullable().optional()
}).refine(data => {
  if (data.start_date && data.end_date) {
    return new Date(data.end_date) >= new Date(data.start_date);
  }
  return true;
}, {
  message: "End date must be after or equal to start date",
  path: ["end_date"]
});

export type TournamentDetailsForm = z.infer<typeof tournamentDetailsSchema>;

// Rule Config schema
export const ruleConfigSchema = z.object({
  strict_age: z.boolean(),
  allow_unrated_in_rating: z.boolean(),
  allow_missing_dob_for_age: z.boolean(),
  max_age_inclusive: z.boolean(),
  main_vs_side_priority_mode: z.enum(['main_first', 'place_first']).optional().default('main_first'),
  // NEW: Age band policy - 'non_overlapping' (default) or 'overlapping'
  age_band_policy: z.enum(['non_overlapping', 'overlapping']).optional(),
  // NEW: Per-player prize cap - defaults to legacy single-prize behaviour
  multi_prize_policy: z.enum(['single', 'main_plus_one_side', 'unlimited']).optional(),
  age_cutoff_policy: z.enum(['JAN1_TOURNAMENT_YEAR', 'TOURNAMENT_START_DATE', 'CUSTOM_DATE']).optional(),
  age_cutoff_date: z.string().nullable().optional()
});

export type RuleConfigForm = z.infer<typeof ruleConfigSchema>;

// Category schema
export const categorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(100, "Name must be less than 100 characters"),
  is_main: z.boolean().default(false),
  order_idx: z.number().optional(),
  category_type: z.string().optional(),
  criteria_json: z.record(z.any()).optional()
});

export type CategoryForm = z.infer<typeof categorySchema>;

// Player Import schema
export const playerImportSchema = z.object({
  rank: z.number().int().min(1, "Rank must be a positive integer"),
  sno: z.number().int().positive().nullable().optional(), // Start Number (distinct from rank)
  name: z.string().trim().min(1, "Name is required and cannot be empty").max(100, "Name must be less than 100 characters"),
  rating: z.number().min(0, "Rating cannot be negative").nullable().optional(),
  dob: z.string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/, 
      "Date must be YYYY-MM-DD"
    )
    .nullable()
    .optional(),
  dob_raw: z.string().max(20, "DOB raw must be less than 20 characters").nullable().optional(),
  gender: z.enum(['M', 'F', 'Other']).nullable().optional(),
  state: z.string().max(50, "State must be less than 50 characters").nullable().optional(),
  city: z.string().max(50, "City must be less than 50 characters").nullable().optional(),
  club: z.string().max(100, "Club must be less than 100 characters").nullable().optional(),
  disability: z.string().max(100, "Disability must be less than 100 characters").nullable().optional(),
  special_notes: z.string().max(500, "Special notes must be less than 500 characters").nullable().optional(),
  fide_id: z.string().max(20, "FIDE ID must be less than 20 characters").nullable().optional(),
  unrated: z.boolean().nullable().optional() // Unrated flag (explicit or inferred)
});

export type PlayerImportRow = z.infer<typeof playerImportSchema>;
