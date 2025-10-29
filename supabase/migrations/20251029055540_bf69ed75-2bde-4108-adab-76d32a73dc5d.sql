-- Add dob_raw column to preserve original DOB input
ALTER TABLE IF EXISTS public.players
  ADD COLUMN IF NOT EXISTS dob_raw text;

-- Normalization function: converts YYYY or YYYY-00-00 to YYYY-01-01
CREATE OR REPLACE FUNCTION public.normalize_dob_input(in_raw text)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE 
  y int;
  clean_input text;
BEGIN
  -- Handle NULL or empty
  IF in_raw IS NULL OR btrim(in_raw) = '' THEN
    RETURN NULL;
  END IF;

  clean_input := btrim(in_raw);
  
  -- Normalize separators (backslash, forward slash, dash)
  clean_input := replace(clean_input, '\', '-');
  clean_input := replace(clean_input, '/', '-');

  -- Pattern 1: YYYY-00-00 or YYYY/00/00 or YYYY\00\00
  IF clean_input ~ '^\d{4}-00-00$' THEN
    y := substring(clean_input from '^\d{4}')::int;
    RETURN make_date(y, 1, 1);
  END IF;

  -- Pattern 2: YYYY only
  IF clean_input ~ '^\d{4}$' THEN
    y := clean_input::int;
    RETURN make_date(y, 1, 1);
  END IF;

  -- Pattern 3: Try standard date parsing
  BEGIN
    RETURN clean_input::date;
  EXCEPTION WHEN OTHERS THEN
    -- Invalid format - return NULL (will be caught by app validation)
    RETURN NULL;
  END;
END $$;

-- Trigger function: auto-normalize dob from dob_raw
CREATE OR REPLACE FUNCTION public.players_normalize_dob_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Only normalize if dob_raw is provided and dob is NULL
  -- This preserves explicit dob values from the app
  IF NEW.dob_raw IS NOT NULL AND NEW.dob IS NULL THEN
    NEW.dob := public.normalize_dob_input(NEW.dob_raw);
  END IF;
  
  -- If dob is provided but dob_raw is empty, backfill dob_raw
  IF NEW.dob IS NOT NULL AND (NEW.dob_raw IS NULL OR NEW.dob_raw = '') THEN
    NEW.dob_raw := NEW.dob::text;
  END IF;
  
  RETURN NEW;
END $$;

-- Create trigger (drop first for idempotency)
DROP TRIGGER IF EXISTS trg_players_normalize_dob ON public.players;
CREATE TRIGGER trg_players_normalize_dob
  BEFORE INSERT OR UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.players_normalize_dob_trigger();

-- One-time backfill: populate dob_raw from existing dob values
UPDATE public.players
SET dob_raw = dob::text
WHERE dob IS NOT NULL AND (dob_raw IS NULL OR dob_raw = '');

-- Add helpful comments
COMMENT ON COLUMN public.players.dob_raw IS 'Original DOB input (may be YYYY, YYYY-00-00, or full date). Normalized value stored in dob.';
COMMENT ON COLUMN public.players.dob IS 'Normalized DOB for eligibility checks. Partial dates (YYYY or YYYY-00-00) become YYYY-01-01.';