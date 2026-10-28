-- Permanent fix: publish_tournament slug uniqueness must also consider
-- public_slug values retained on OTHER tournaments (e.g. after unpublish),
-- not only active rows in public.publications. Previously a stale public_slug
-- on an unpublished tournament caused a unique-constraint violation
-- ("This record already exists") when another tournament published with the
-- same base slug. Now the loop auto-suffixes (base-2, base-3, ...) instead.
-- Rollback: restore the previous WHILE condition that only checked
-- public.publications with is_active = true.
CREATE OR REPLACE FUNCTION public.publish_tournament(tournament_id uuid, requested_slug text DEFAULT NULL::text)
 RETURNS TABLE(slug text, version integer, request_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tournament_id uuid := tournament_id;
  v_title          text;
  v_existing_slug  text;
  v_owner_id       uuid;
  v_uid            uuid := auth.uid();
  v_is_master      boolean;
  v_base           text;
  v_slug           text;
  v_suffix         int := 1;
  v_version        int := 1;
  v_alloc_version  int;
  v_req            uuid := gen_random_uuid();
BEGIN
  -- 0) Authorization. Mirrors unpublish_tournament.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_is_master := public.has_role(v_uid, 'master'::public.app_role);

  -- 1) Fetch tournament details and lock the row
  SELECT t.title, t.public_slug, t.owner_id
    INTO v_title, v_existing_slug, v_owner_id
  FROM public.tournaments AS t
  WHERE t.id = v_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament % not found', v_tournament_id;
  END IF;

  IF NOT (v_owner_id = v_uid OR v_is_master) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- 1b) [B22] TITLE GATE. A tournament may be drafted, imported, allocated and
  --     finalized with the placeholder title, but it may not become PUBLIC with
  --     one. The literal below is written by Dashboard.tsx's New Tournament
  --     button; scripts/backlog_sweep_repo.sh asserts the two still agree.
  IF coalesce(btrim(v_title), '') = '' THEN
    RAISE EXCEPTION 'TITLE_REQUIRED: Give the tournament a name before publishing it.';
  END IF;

  -- internal whitespace is normalised too: btrim alone left
  -- '  UNTITLED   tournament ' slipping through the gate (caught by harness T5).
  IF regexp_replace(lower(btrim(v_title)), '\s+', ' ', 'g') = 'untitled tournament' THEN
    RAISE EXCEPTION 'TITLE_REQUIRED: Replace the placeholder name "Untitled Tournament" with the real event name before publishing.';
  END IF;

  -- 2) Build base slug
  --    [B22] A placeholder-derived slug is treated as ABSENT so a renamed
  --    tournament regenerates once. Any other existing slug still wins, because
  --    changing a live public URL on every republish would break shared links.
  v_base := COALESCE(
    NULLIF(requested_slug, ''),
    CASE
      WHEN v_existing_slug ~ '^untitled-tournament(-[0-9]+)?$' THEN NULL
      ELSE NULLIF(v_existing_slug, '')
    END,
    REGEXP_REPLACE(
      LOWER(COALESCE(v_title, 'tournament')),
      '[^a-z0-9]+',
      '-',
      'g'
    )
  );
  v_base := COALESCE(NULLIF(TRIM(BOTH '-' FROM v_base), ''), 'tournament');

  -- 3) Make slug unique across ACTIVE publications of other tournaments
  --    AND across public_slug values retained on other tournaments
  --    (e.g. left behind after unpublish). Without the second check, a stale
  --    public_slug triggered a unique-constraint violation on step 7.
  v_slug := v_base;

  WHILE EXISTS (
    SELECT 1
    FROM public.publications AS pub
    WHERE pub.slug = v_slug
      AND pub.is_active = true
      AND pub.tournament_id <> v_tournament_id
  ) OR EXISTS (
    SELECT 1
    FROM public.tournaments AS t
    WHERE t.public_slug = v_slug
      AND t.id <> v_tournament_id
  ) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base || '-' || v_suffix::text;
  END LOOP;

  -- 4) Deactivate previous publications for THIS tournament
  UPDATE public.publications AS pub
     SET is_active = false
   WHERE pub.tournament_id = v_tournament_id
     AND pub.is_active = true;

  -- 5) Compute next version for this tournament
  SELECT COALESCE(MAX(pub2.version), 0) + 1
    INTO v_version
  FROM public.publications AS pub2
  WHERE pub2.tournament_id = v_tournament_id;

  -- 5b) [B18-a] Pin the allocation version this publication will display.
  --     NULL when the tournament has no allocations yet -- see the header note.
  SELECT MAX(a.version)
    INTO v_alloc_version
  FROM public.allocations a
  WHERE a.tournament_id = v_tournament_id;

  -- 6) Insert new publication row
  INSERT INTO public.publications (
    tournament_id,
    slug,
    version,
    published_by,
    is_active,
    request_id,
    allocation_version
  )
  VALUES (
    v_tournament_id,
    v_slug,
    v_version,
    auth.uid(),
    true,
    v_req,
    v_alloc_version
  );

  -- 7) Mark tournament as published
  UPDATE public.tournaments AS t
     SET is_published = true,
         public_slug   = v_slug,
         status        = 'published'
   WHERE t.id = v_tournament_id;

  -- 8) Return details
  RETURN QUERY
  SELECT v_slug, v_version, v_req;
END;
$function$;