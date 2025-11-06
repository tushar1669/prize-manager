-- Publish v2: publications table, RPC, view, and public RLS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Publications table to track public versions
CREATE TABLE IF NOT EXISTS public.publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  slug text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  published_by uuid NULL,
  is_active boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS publications_slug_active_idx
  ON public.publications(slug)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS publications_tournament_version_idx
  ON public.publications(tournament_id, version);

CREATE INDEX IF NOT EXISTS publications_tournament_active_idx
  ON public.publications(tournament_id, is_active);

-- Published tournaments view exposing safe columns
CREATE OR REPLACE VIEW public.published_tournaments AS
SELECT
  t.id,
  t.title,
  t.city,
  t.venue,
  t.start_date,
  t.end_date,
  t.public_slug,
  t.is_published,
  t.notes,
  t.brochure_url,
  t.chessresults_url,
  t.public_results_url,
  p.slug,
  p.version,
  p.published_at,
  t.created_at
FROM public.tournaments t
JOIN LATERAL (
  SELECT slug, version, published_at
  FROM public.publications p
  WHERE p.tournament_id = t.id
    AND p.is_active = true
  ORDER BY version DESC
  LIMIT 1
) p ON TRUE
WHERE t.is_published = true;

-- Ensure RLS enabled
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;

-- Public select policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'publications'
      AND policyname = 'public_read_active_publications'
  ) THEN
    CREATE POLICY public_read_active_publications
    ON public.publications
    FOR SELECT
    USING (is_active = true);
  END IF;
END
$$;

-- RLS policies for organizer access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'publications'
      AND policyname = 'org_publications_access'
  ) THEN
    CREATE POLICY org_publications_access
    ON public.publications
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.tournaments t
        WHERE t.id = publications.tournament_id
          AND (t.owner_id = auth.uid() OR public.has_role(auth.uid(), 'master'))
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.tournaments t
        WHERE t.id = publications.tournament_id
          AND (t.owner_id = auth.uid() OR public.has_role(auth.uid(), 'master'))
      )
    );
  END IF;
END
$$;