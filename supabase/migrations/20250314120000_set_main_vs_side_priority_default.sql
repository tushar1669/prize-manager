-- Set default main_vs_side_priority_mode to main_first
ALTER TABLE public.rule_config
ALTER COLUMN main_vs_side_priority_mode SET DEFAULT 'main_first';

-- Backfill nulls to the new default
UPDATE public.rule_config
SET main_vs_side_priority_mode = 'main_first'
WHERE main_vs_side_priority_mode IS NULL;
