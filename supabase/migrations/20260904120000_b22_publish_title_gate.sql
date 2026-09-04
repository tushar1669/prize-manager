-- =============================================================================
-- 20260904120000_b22_publish_title_gate.sql
-- B22 — placeholder titles and sticky placeholder slugs reaching the public site
--
-- DEFECT (measured 3-4 Sep 2026):
--   Dashboard.tsx:172 "New Tournament" inserts a complete, publishable stub row
--   (title 'Untitled Tournament', start_date = end_date = today) before the
--   organizer types anything.  publish_tournament validates ownership and
--   NOTHING else, so the stub can travel the entire pipeline to a live public
--   page.  Two real customer tournaments reached production this way:
--     16b9cf29  /p/untitled-tournament     (sankalparora5555@gmail.com)
--     51f0b22e  /p/untitled-tournament-2   (shahgfaruqui@gmail.com)
--   Both were repaired by hand on 3-4 Sep.  Nothing stopped a third.
--
--   Second defect, found while reading the function: slug precedence is
--   requested_slug -> EXISTING public_slug -> slugified title.  The existing
--   slug wins, so renaming a tournament never changes its URL.  A tournament
--   published as a stub keeps /p/untitled-tournament forever, even after the
--   organizer fixes the title.
--
-- FIX, in two parts:
--   1. TITLE GATE.  publish_tournament refuses to publish a blank or
--      placeholder title.  Drafts are untouched — organizers work freely and
--      are only stopped at the moment the tournament would become public.
--   2. STUB-SLUG BYPASS.  A public_slug matching ^untitled-tournament(-N)?$ is
--      treated as absent, so a renamed tournament regenerates its slug once.
--
-- DELIBERATELY NOT DONE: regenerating the slug from the title on every
--   republish.  That would break every existing public link the moment an
--   organizer fixed a typo.  Slug stability is correct behaviour; only the
--   PLACEHOLDER slug should be sticky-free.  A deliberate slug change needs a
--   UI and a redirect story and stays Tier 2.
--
-- NO BACKFILL REQUIRED — measured before writing:
--   published tournaments with a blank title            0
--   published tournaments titled 'Untitled Tournament'  0
--   published tournaments with an untitled-* slug       0  (repaired by hand)
--   DRAFTS titled 'Untitled Tournament'                33  <- these are blocked
--                                                            from publishing
--                                                            until named. That
--                                                            is the intent.
--
-- COUPLING TO RECORD (BB5): the gate matches the literal 'Untitled Tournament'
--   written by Dashboard.tsx:172.  If that string changes, the gate silently
--   stops firing.  scripts/backlog_sweep_repo.sh asserts the two still agree.
--
-- One transaction.  Aborts loudly on any pre-flight or post-check mismatch.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- PRE-FLIGHT — assert the audited state before replacing anything.
-- ---------------------------------------------------------------------------
do $pre$
declare
  n_overloads   int;
  n_pub_blank   int;
  n_pub_stub    int;
  n_pub_slug    int;
  v_src         text;
  anon_exec_before boolean;
  auth_exec_before boolean;
begin
  select count(*) into n_overloads
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'publish_tournament';
  if n_overloads <> 1 then
    raise exception 'B22 PRE-FLIGHT: expected exactly 1 publish_tournament overload, found %. Re-audit before running.', n_overloads;
  end if;

  -- the body we are replacing must be the one this migration was written against
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'publish_tournament';
  if v_src not like '%NULLIF(v_existing_slug%' then
    raise exception 'B22 PRE-FLIGHT: publish_tournament body does not contain the expected slug precedence. It has changed since the 3 Sep audit. Stop and re-read it.';
  end if;
  if v_src like '%TITLE_REQUIRED%' then
    raise exception 'B22 PRE-FLIGHT: publish_tournament already contains a title gate. This migration has already run.';
  end if;

  select count(*) into n_pub_blank from public.tournaments
   where is_published and coalesce(btrim(title),'') = '';
  select count(*) into n_pub_stub  from public.tournaments
   where is_published and lower(btrim(title)) = 'untitled tournament';
  select count(*) into n_pub_slug  from public.tournaments
   where is_published and public_slug ~ '^untitled-tournament(-[0-9]+)?$';

  if n_pub_blank <> 0 or n_pub_stub <> 0 then
    raise exception 'B22 PRE-FLIGHT: % published rows have a blank title and % have the placeholder title. The gate would make these unrepublishable. Repair them first.', n_pub_blank, n_pub_stub;
  end if;
  if n_pub_slug <> 0 then
    raise exception 'B22 PRE-FLIGHT: % published rows still carry an untitled-* slug. Repair the data before shipping the code.', n_pub_slug;
  end if;

  -- capture grants so the post-check can prove CREATE OR REPLACE did not widen them (D18/N1)
  select has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
    into anon_exec_before, auth_exec_before
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'publish_tournament';

  create temp table _b22_grants on commit drop as
    select anon_exec_before as anon_before, auth_exec_before as auth_before;

  raise notice 'B22 pre-flight OK (anon_exec=%, authenticated_exec=%)', anon_exec_before, auth_exec_before;
end $pre$;

-- ---------------------------------------------------------------------------
-- The replacement. Identical to the audited body except for the two marked
-- blocks. Everything else — auth, locking, uniqueness loop, version
-- computation, publication insert, return shape — is byte-for-byte unchanged.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- POST-CHECK — the replacement must not have widened EXECUTE, and the two new
-- behaviours must actually be present.
-- ---------------------------------------------------------------------------
do $post$
declare
  anon_now boolean; auth_now boolean;
  anon_was boolean; auth_was boolean;
  v_src text; fails text := '';
begin
  select anon_before, auth_before into anon_was, auth_was from _b22_grants;

  select has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         p.prosrc
    into anon_now, auth_now, v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'publish_tournament';

  if anon_now is distinct from anon_was then
    fails := fails || format(E'\n  - anon EXECUTE changed %s -> %s', anon_was, anon_now); end if;
  if auth_now is distinct from auth_was then
    fails := fails || format(E'\n  - authenticated EXECUTE changed %s -> %s', auth_was, auth_now); end if;
  if v_src not like '%TITLE_REQUIRED%' then
    fails := fails || E'\n  - title gate is not present in the new body'; end if;
  if v_src not like '%untitled-tournament(-[0-9]+)?%' then
    fails := fails || E'\n  - stub-slug bypass is not present in the new body'; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='publish_tournament') <> 1 then
    fails := fails || E'\n  - publish_tournament is now overloaded'; end if;

  if fails <> '' then
    raise exception E'B22 POST-CHECK FAILED — rolling back.%', fails;
  end if;

  raise notice 'B22 post-check passed';
end $post$;

notify pgrst, 'reload schema';

commit;
