-- Add age cutoff policy/date to rule_config table
-- Supports JAN1_TOURNAMENT_YEAR (default), TOURNAMENT_START_DATE, CUSTOM_DATE

ALTER TABLE public.rule_config
ADD COLUMN IF NOT EXISTS age_cutoff_policy text DEFAULT 'JAN1_TOURNAMENT_YEAR',
ADD COLUMN IF NOT EXISTS age_cutoff_date date;

ALTER TABLE public.rule_config
ADD CONSTRAINT rule_config_age_cutoff_policy_check
CHECK (age_cutoff_policy IN ('JAN1_TOURNAMENT_YEAR', 'TOURNAMENT_START_DATE', 'CUSTOM_DATE'));

UPDATE public.rule_config
SET age_cutoff_policy = 'JAN1_TOURNAMENT_YEAR'
WHERE age_cutoff_policy IS NULL;

COMMENT ON COLUMN public.rule_config.age_cutoff_policy IS
'Age eligibility cutoff: JAN1_TOURNAMENT_YEAR | TOURNAMENT_START_DATE | CUSTOM_DATE.';

COMMENT ON COLUMN public.rule_config.age_cutoff_date IS
'Custom age cutoff date (YYYY-MM-DD) used when age_cutoff_policy=CUSTOM_DATE.';
