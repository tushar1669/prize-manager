-- Store latest successful import quality summary for review pages
ALTER TABLE public.tournaments
ADD COLUMN IF NOT EXISTS latest_import_quality jsonb;
