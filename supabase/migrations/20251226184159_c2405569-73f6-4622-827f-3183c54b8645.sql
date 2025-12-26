-- Fix 1: Recreate published_tournaments view with SECURITY INVOKER
-- This ensures the view respects the RLS policies of the querying user, not the view creator

DROP VIEW IF EXISTS public.published_tournaments;

CREATE VIEW public.published_tournaments
WITH (security_invoker = on)
AS
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
  t.public_slug,
  p.slug AS publication_slug,
  t.event_code,
  t.time_control_base_minutes,
  t.time_control_increment_seconds,
  t.time_control_category,
  t.chief_arbiter,
  t.tournament_director,
  t.entry_fee_amount,
  t.cash_prize_total,
  COALESCE(p.slug, t.public_slug) AS slug,
  p.version,
  p.published_at
FROM tournaments t
LEFT JOIN publications p ON p.tournament_id = t.id AND p.is_active = true
WHERE t.is_published = true 
  AND t.is_archived = false 
  AND t.deleted_at IS NULL;

-- Fix 2: Tighten storage policies to only allow access when tournament is actually published
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Public read published brochures" ON storage.objects;
DROP POLICY IF EXISTS "Public read published exports" ON storage.objects;

-- Create secure policies that check tournament publication status
-- The file path structure is: {tournament_id}/{filename}
CREATE POLICY "Public read published brochures"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'brochures' AND
  EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(name))[1]
    AND t.is_published = true
    AND t.deleted_at IS NULL
  )
);

CREATE POLICY "Public read published exports"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'exports' AND
  EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(name))[1]
    AND t.is_published = true
    AND t.deleted_at IS NULL
  )
);