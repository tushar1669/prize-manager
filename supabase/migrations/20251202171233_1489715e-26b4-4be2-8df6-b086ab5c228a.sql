-- Add archive and soft-delete fields to tournaments table
ALTER TABLE public.tournaments
ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- Add index for common queries filtering by archive/delete status
CREATE INDEX IF NOT EXISTS idx_tournaments_archive_status 
ON public.tournaments (is_archived, deleted_at);

-- Update published_tournaments view to exclude archived/deleted tournaments
DROP VIEW IF EXISTS public.published_tournaments;
CREATE VIEW public.published_tournaments AS
SELECT 
  t.id,
  t.title,
  t.start_date,
  t.end_date,
  t.city,
  t.venue,
  t.notes,
  t.brochure_url,
  t.chessresults_url,
  t.public_results_url,
  t.is_published,
  t.created_at,
  p.slug AS public_slug,
  p.version,
  p.published_at
FROM tournaments t
LEFT JOIN publications p ON p.tournament_id = t.id AND p.is_active = true
WHERE t.is_published = true
  AND t.is_archived = false
  AND t.deleted_at IS NULL;