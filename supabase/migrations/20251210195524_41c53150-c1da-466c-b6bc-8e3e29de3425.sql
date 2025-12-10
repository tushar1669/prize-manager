-- Add age_band_policy column to rule_config table
-- Supports 'non_overlapping' (default for new tournaments) or 'overlapping'

ALTER TABLE public.rule_config 
ADD COLUMN IF NOT EXISTS age_band_policy text DEFAULT 'non_overlapping';

-- Add comment for documentation
COMMENT ON COLUMN public.rule_config.age_band_policy IS 
'Age band policy: ''non_overlapping'' (default) means each child qualifies for only their age band (U8=0-8, U11=9-11, etc.). ''overlapping'' means all Under-X categories are independent (10yo qualifies for U11, U14, U17 simultaneously).';