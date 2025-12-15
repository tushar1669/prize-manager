-- Add multi_prize_policy column to rule_config table
-- Values: 'single' (default), 'main_plus_one_side', 'unlimited'
ALTER TABLE public.rule_config 
ADD COLUMN IF NOT EXISTS multi_prize_policy text DEFAULT 'single';

-- Add a check constraint to ensure valid values
ALTER TABLE public.rule_config
ADD CONSTRAINT rule_config_multi_prize_policy_check 
CHECK (multi_prize_policy IN ('single', 'main_plus_one_side', 'unlimited'));