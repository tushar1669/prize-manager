import { z } from "zod";

// Tournament Details schema
export const tournamentDetailsSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  venue: z.string().optional(),
  city: z.string().optional(),
  event_code: z.string().optional(),
  notes: z.string().optional(),
  brochure_url: z.string().optional(),
  chessresults_url: z.string().url().optional().or(z.literal('')),
  public_results_url: z.string().url().optional().or(z.literal('')),
  // New metadata fields (all optional)
  time_control_base_minutes: z.number().int().min(0).nullable().optional(),
  time_control_increment_seconds: z.number().int().min(0).nullable().optional(),
  chief_arbiter: z.string().max(200).optional(),
  tournament_director: z.string().max(200).optional(),
  entry_fee_amount: z.number().min(0).nullable().optional(),
  cash_prize_total: z.number().min(0).nullable().optional()
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
  prefer_main_on_equal_value: z.boolean(),
  prefer_category_rank_on_tie: z.boolean(),
  category_priority_order: z.array(z.string()).optional(),
  // NEW: Age band policy - 'non_overlapping' (default) or 'overlapping'
  age_band_policy: z.enum(['non_overlapping', 'overlapping']).optional()
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
  rank: z.number().min(1, "Rank must be a positive integer"),
  sno: z.number().int().positive().nullable().optional(), // Start Number (distinct from rank)
  name: z.string().trim().min(1, "Name is required and cannot be empty").max(100, "Name must be less than 100 characters"),
  rating: z.number().min(0, "Rating cannot be negative").nullable().optional(),
  dob: z.string()
    .regex(
      /^(\d{4}(-\d{2}-\d{2})?|\d{4}[\\/\-]00[\\/\-]00|\d{4})$/, 
      "Date must be YYYY-MM-DD, YYYY/00/00, or YYYY"
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
