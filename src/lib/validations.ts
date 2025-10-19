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
  brochure_url: z.string().optional()
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
  prefer_main_on_equal_value: z.boolean(),
  prefer_category_rank_on_tie: z.boolean(),
  category_priority_order: z.array(z.string()).optional()
});

export type RuleConfigForm = z.infer<typeof ruleConfigSchema>;

// Category schema
export const categorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(100, "Name must be less than 100 characters"),
  is_main: z.boolean().default(false),
  order_idx: z.number().optional(),
  criteria_json: z.record(z.any()).optional()
});

export type CategoryForm = z.infer<typeof categorySchema>;

// Prize schema
export const prizeSchema = z.object({
  place: z.number().min(1, "Place must be at least 1"),
  cash_amount: z.number().min(0, "Cash amount cannot be negative"),
  has_trophy: z.boolean(),
  has_medal: z.boolean()
}).refine(data => {
  return data.cash_amount > 0 || data.has_trophy || data.has_medal;
}, {
  message: "Prize must have at least cash, trophy, or medal",
  path: ["cash_amount"]
});

export type PrizeForm = z.infer<typeof prizeSchema>;
