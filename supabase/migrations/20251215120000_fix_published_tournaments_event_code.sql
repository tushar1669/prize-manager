-- Ensure published_tournaments exposes event_code and detail fields used by public pages
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
  t.public_slug,
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

-- Slug lookups rely on these indexes
CREATE UNIQUE INDEX IF NOT EXISTS tournaments_public_slug_key
  ON public.tournaments(public_slug)
  WHERE public_slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS publications_slug_active_idx
  ON public.publications(slug)
  WHERE is_active = true;
