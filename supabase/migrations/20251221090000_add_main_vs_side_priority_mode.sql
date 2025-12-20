-- Add main_vs_side_priority_mode column to rule_config table
-- Values: 'place_first' (default), 'main_first'
ALTER TABLE public.rule_config
ADD COLUMN IF NOT EXISTS main_vs_side_priority_mode text DEFAULT 'place_first';

-- Add a check constraint to ensure valid values
ALTER TABLE public.rule_config
ADD CONSTRAINT rule_config_main_vs_side_priority_mode_check
CHECK (main_vs_side_priority_mode IN ('place_first', 'main_first'));

-- Backfill to preserve legacy prefer_main_on_equal_value behavior
UPDATE public.rule_config
SET main_vs_side_priority_mode = CASE
  WHEN COALESCE(prefer_main_on_equal_value, true) THEN 'main_first'
  ELSE 'place_first'
END;

COMMENT ON COLUMN public.rule_config.main_vs_side_priority_mode IS 'Tie-break mode for main vs side prizes: place_first | main_first';
