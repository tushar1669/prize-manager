-- Add non-cash priority mode to tournament rule_config.
ALTER TABLE public.rule_config
ADD COLUMN IF NOT EXISTS non_cash_priority_mode text;

UPDATE public.rule_config
SET non_cash_priority_mode = 'TGM'
WHERE non_cash_priority_mode IS NULL;

ALTER TABLE public.rule_config
ALTER COLUMN non_cash_priority_mode SET DEFAULT 'TGM',
ALTER COLUMN non_cash_priority_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rule_config_non_cash_priority_mode_check'
      AND conrelid = 'public.rule_config'::regclass
  ) THEN
    ALTER TABLE public.rule_config
    ADD CONSTRAINT rule_config_non_cash_priority_mode_check
    CHECK (non_cash_priority_mode IN ('TGM','TMG','GTM','GMT','MTG','MGT'));
  END IF;
END
$$;

COMMENT ON COLUMN public.rule_config.non_cash_priority_mode IS
'Non-cash bundle priority order permutations: TGM|TMG|GTM|GMT|MTG|MGT.';
