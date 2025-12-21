-- Add main_vs_side_priority_mode column to rule_config
-- Values: 'place_first' (default, legacy behavior) or 'main_first' (prioritize main category)
ALTER TABLE public.rule_config
ADD COLUMN IF NOT EXISTS main_vs_side_priority_mode text DEFAULT 'place_first';