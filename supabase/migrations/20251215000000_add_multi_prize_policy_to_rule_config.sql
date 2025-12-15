-- Add multi_prize_policy column to rule_config to control per-player prize caps
ALTER TABLE public.rule_config
ADD COLUMN IF NOT EXISTS multi_prize_policy text DEFAULT 'single';

COMMENT ON COLUMN public.rule_config.multi_prize_policy IS 'Per-player prize cap policy: single | main_plus_one_side | unlimited';
