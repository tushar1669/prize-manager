-- Client write-grant audit, Step 2 (D38).
--
-- publish_tournament was SECURITY DEFINER with NO ownership check, and held
-- EXECUTE for anon as well as authenticated. Any authenticated user could
-- publish ANY tournament by id, under a slug of their choosing.
--
-- Proven 14 Aug 2026 in a rolled-back block: 753b536b (a non-master organizer)
-- published a tournament owned by 6b6a521c as slug 'pwned-by-753b536b' v2.
-- The same block confirmed unpublish_tournament correctly returned
-- 'not authorized' -- the two were asymmetric.
--
-- Impact: private draft tournaments forced public (readable via the
-- anon-executable get_public_tournament_results), slug squatting, since slug
-- uniqueness is global across active publications, and unbounded version churn.
--
-- Fix: fold an owner-or-master predicate into the existing FOR UPDATE lock,
-- mirroring unpublish_tournament exactly. Master carve-out retained so support
-- can publish on a stuck organizer's behalf.
--
-- The only client call site is src/pages/Finalize.tsx:365, which always passes
-- the caller's own route-param tournament id and requested_slug: null. No
-- frontend change is required and none is shipped with this migration.
--
-- N1 / D18: anon and PUBLIC EXECUTE revoked. authenticated is RETAINED because
-- the client genuinely calls this. CREATE OR REPLACE preserves the existing
-- ACL, so the revokes must be explicit.

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

  -- 2) Build base slug
  v_base := COALESCE(
    NULLIF(requested_slug, ''),
    NULLIF(v_existing_slug, ''),
    REGEXP_REPLACE(
      LOWER(COALESCE(v_title, 'tournament')),
      '[^a-z0-9]+',
      '-',
      'g'
    )
  );
  v_base := COALESCE(NULLIF(TRIM(BOTH '-' FROM v_base), ''), 'tournament');

  -- 3) Make slug unique across ACTIVE publications of other tournaments
  v_slug := v_base;

  WHILE EXISTS (
    SELECT 1
    FROM public.publications AS pub
    WHERE pub.slug = v_slug
      AND pub.is_active = true
      AND pub.tournament_id <> v_tournament_id
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

  -- 6) Insert new publication row
  INSERT INTO public.publications (
    tournament_id,
    slug,
    version,
    published_by,
    is_active,
    request_id
  )
  VALUES (
    v_tournament_id,
    v_slug,
    v_version,
    auth.uid(),
    true,
    v_req
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

REVOKE EXECUTE ON FUNCTION public.publish_tournament(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.publish_tournament(uuid, text) FROM anon;

-- Self-verify: fail the migration rather than report success on a partial fix.
DO $$
DECLARE
  v_oid oid;
  v_def text;
BEGIN
  SELECT p.oid, pg_get_functiondef(p.oid) INTO v_oid, v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'publish_tournament';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'publish_tournament not found';
  END IF;

  IF v_def !~ 'not authorized' THEN
    RAISE EXCEPTION 'OWNERSHIP CHECK MISSING from publish_tournament body';
  END IF;

  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'REVOKE INCOMPLETE: anon still holds EXECUTE';
  END IF;

  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'BROKE CLIENT PATH: authenticated lost EXECUTE';
  END IF;

  RAISE NOTICE 'OK: ownership check present, anon=false, authenticated=true';
END $$;
