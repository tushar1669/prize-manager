-- Publish v2: publications table, RPC, view, and public RLS
-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Publications table to track public versions
CREATE TABLE IF NOT EXISTS public.publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  slug text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  published_by uuid NULL,
  is_active boolean NOT NULL DEFAULT true,
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
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
  p.request_id,
  p.published_at,
  t.created_at
FROM public.tournaments t
JOIN LATERAL (
  SELECT slug, version, request_id, published_at
  FROM public.publications p
  WHERE p.tournament_id = t.id
    AND p.is_active = true
  ORDER BY version DESC
  LIMIT 1
) p ON TRUE
WHERE t.is_published = true;

-- Publish RPC
drop function if exists public.publish_tournament(uuid, text);
CREATE OR REPLACE FUNCTION public.publish_tournament(tournament_id uuid, requested_slug text DEFAULT NULL)
RETURNS TABLE(slug text, version integer, request_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid := tournament_id;
  v_title text;
  v_existing_slug text;
  v_base text;
  v_slug text;
  v_suffix int := 1;
  v_version int := 1;
  v_req uuid := gen_random_uuid();
BEGIN
  SELECT title, public_slug INTO v_title, v_existing_slug
  FROM public.tournaments
  WHERE id = v_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament % not found', v_tournament_id;
  END IF;

  v_base := COALESCE(
    NULLIF(requested_slug, ''),
    NULLIF(v_existing_slug, ''),
    REGEXP_REPLACE(LOWER(COALESCE(v_title, 'tournament')), '[^a-z0-9]+', '-', 'g')
  );
  v_base := COALESCE(NULLIF(TRIM(BOTH '-' FROM v_base), ''), 'tournament');

  v_slug := v_base;
  WHILE EXISTS (
    SELECT 1
    FROM public.publications pub
    WHERE pub.slug = v_slug
      AND pub.is_active = true
      AND pub.tournament_id <> v_tournament_id
  ) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base || '-' || v_suffix::text;
  END LOOP;

  UPDATE public.publications
     SET is_active = false
   WHERE tournament_id = v_tournament_id
     AND is_active = true;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.publications
  WHERE tournament_id = v_tournament_id;

  INSERT INTO public.publications (tournament_id, slug, version, published_by, is_active, request_id)
  VALUES (v_tournament_id, v_slug, v_version, auth.uid(), true, v_req);

  UPDATE public.tournaments
     SET is_published = true,
         public_slug = v_slug,
         status = 'published'
   WHERE id = v_tournament_id;

  RETURN QUERY
  SELECT v_slug, v_version, v_req;
END;
$$;

-- Ensure RLS enabled
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;

-- Public select policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tournaments'
      AND policyname = 'anon_select_published_tournaments'
  ) THEN
    CREATE POLICY anon_select_published_tournaments
    ON public.tournaments
    FOR SELECT
    TO anon
    USING (is_published = true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'publications'
      AND policyname = 'anon_select_active_publications'
  ) THEN
    CREATE POLICY anon_select_active_publications
    ON public.publications
    FOR SELECT
    TO anon
    USING (is_active = true);
  END IF;
END
$$;
