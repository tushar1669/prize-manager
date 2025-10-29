-- Fix security warning: Add search_path to normalize_dob_input function
CREATE OR REPLACE FUNCTION public.normalize_dob_input(in_raw text)
RETURNS date 
LANGUAGE plpgsql 
IMMUTABLE 
SECURITY DEFINER
SET search_path = public
AS $$
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

-- Fix security warning: Add search_path to trigger function
CREATE OR REPLACE FUNCTION public.players_normalize_dob_trigger()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
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