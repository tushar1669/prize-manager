-- supabase/migrations/20260905120000_b18a_version_pin.sql
--
-- B18-a — VERSION-PIN PUBLISHED RESULTS.
--
-- Defect: get_public_tournament_results selects MAX(allocations.version) with no
-- join to publications. Any new allocation version silently becomes the public
-- page. Confirmed live 3 Sep 2026: retitling 16b9cf29 created allocation v7 from
-- a page load and the public page followed it (PROJECT_STATE 12.14).
--
-- Fix: the ACTIVE publication pins the allocation version its page displays.
--
-- DELIBERATELY NO MAX() FALLBACK (Option C, 5 Sep). A publication whose pin is
-- NULL -- a tournament published before it had any allocations -- shows event
-- details and NO winners, until a later publish pins one. Finalize.handlePublish
-- already runs finalize then publish_tournament, so that flow self-heals. A
-- COALESCE(pin, MAX(...)) here would reopen the exact hole this migration closes.
--
-- Alternative considered and rejected: block publishing with zero allocations.
-- Measurement: 20 of 95 publications ever, and 4 of 39 since June, were made with
-- zero allocations at publish time, all by customers, with allocations arriving
-- 12 minutes to 5 hours later. Blocking would reject a real customer action at a
-- rate near 1 in 10, and would break every positive case in
-- b22_publish_gate_checks.sql, whose fixtures carry no allocations.
--
-- Trigger safety (CC1): both triggers on publications are column-scoped --
-- BEFORE INSERT OR UPDATE OF is_active, version, and BEFORE UPDATE OF is_active.
-- The backfill below writes allocation_version only and fires neither. This was
-- not assumed: the guard was observed REJECTING an is_active update on
-- 74e1bd2b's publication, after which the column-only write succeeded on that
-- same row. b18_version_pin_checks.sql case P16 keeps that pair honest.
--
-- Dry-run record (5 Sep, body executed against production and force-aborted):
--   backfilled active pubs = 35, active still NULL = 0
--   probe 3ac176a1: pin=MAX reproduced today's output checksum exactly;
--   pin=7 vs pin=8 produced DIFFERENT checksums at an IDENTICAL row count of 41
--   (row count alone would have missed it); pin=NULL produced 0 rows.

begin;

-- ---------------------------------------------------------------------------
-- PRE-FLIGHT: assert the audited state. Refuse to run against anything else.
-- ---------------------------------------------------------------------------
do $preflight$
declare n int; args text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='publications'
                and column_name='allocation_version') then
    raise exception 'B18 PREFLIGHT: publications.allocation_version already exists';
  end if;

  select count(*) into n from public.publications where is_active;
  if n <> 35 then
    raise exception 'B18 PREFLIGHT: expected 35 active publications, found %', n;
  end if;

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='publish_tournament';
  if n <> 1 then
    raise exception 'B18 PREFLIGHT: expected exactly 1 publish_tournament overload, found %', n;
  end if;

  select pg_get_function_arguments(p.oid) into args
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='publish_tournament';
  if args <> 'tournament_id uuid, requested_slug text DEFAULT NULL::text' then
    raise exception 'B18 PREFLIGHT: publish_tournament signature drifted: %', args;
  end if;

  -- the defect must still be present IN CODE, or this migration is being re-run
  -- blind. Comment-stripped for the same reason as the post-check below.
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='get_public_tournament_results'
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%MAX(a.version)%';
  if n <> 1 then
    raise exception 'B18 PREFLIGHT: get_public_tournament_results does not contain the MAX(a.version) defect';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1) The pin column
-- ---------------------------------------------------------------------------
alter table public.publications add column allocation_version integer;

comment on column public.publications.allocation_version is
  'B18-a. The allocations.version this publication displays. NULL means the '
  'tournament had no allocations when it was published: the public page shows '
  'details and no winners until a later publish pins one. Readers must NOT fall '
  'back to MAX(allocations.version) -- that is the defect B18-a closed.';

-- ---------------------------------------------------------------------------
-- 2) Backfill the active publications to what their pages show TODAY.
--
--    Safe because measured: 9 of 35 had already drifted past the version they
--    were published at, but the (prize_id, player_id) set of every drifted pair
--    is IDENTICAL -- zero symmetric difference, identical row counts. The
--    allocation engine is deterministic, so re-runs reproduce byte-identically
--    when nothing upstream changed. Pinning to current MAX therefore freezes
--    exactly what is on screen now and changes no public page.
--
--    Writes allocation_version only: fires neither publications trigger.
-- ---------------------------------------------------------------------------
update public.publications p
   set allocation_version = (
         select max(a.version) from public.allocations a
          where a.tournament_id = p.tournament_id)
 where p.is_active;

-- ---------------------------------------------------------------------------
-- 3) publish_tournament records the pin at insert.
--
--    Everything else is byte-for-byte the B22 body (migration 20260904120000).
--    The B22 title gate and stub-slug bypass are unchanged and
--    b22_publish_gate_checks.sql must stay 14/14 after this migration.
-- ---------------------------------------------------------------------------
create or replace function public.publish_tournament(
  tournament_id uuid,
  requested_slug text DEFAULT NULL::text
)
returns table(slug text, version integer, request_id uuid)
language plpgsql
security definer
set search_path = public
as $fn$
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
$fn$;

-- ---------------------------------------------------------------------------
-- 4) get_public_tournament_results reads the pin instead of MAX().
--
--    Only the latest_version CTE changed. Everything else -- the is_published
--    gate, access_state preview logic, main-category selection, ordering and the
--    15-column return type -- is byte-for-byte the prior body.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_tournament_results(tournament_id uuid)
returns table(
  prize_id uuid,
  player_name text,
  rank integer,
  rating integer,
  state text,
  category_name text,
  is_main boolean,
  place integer,
  cash_amount integer,
  has_trophy boolean,
  has_medal boolean,
  has_full_access boolean,
  preview_main_limit integer,
  other_categories_locked boolean,
  gift_items jsonb
)
language sql
security definer
set search_path = public
as $fn$
WITH
-- Source of truth: tournaments.is_published (see 20251102_publish_v2.sql).
published_tournament AS (
  SELECT t.id
  FROM public.tournaments t
  WHERE t.id = get_public_tournament_results.tournament_id
    AND t.is_published = true
),
access_state AS (
  SELECT *
  FROM public.get_tournament_access_state(get_public_tournament_results.tournament_id)
),
-- [B18-a] The ACTIVE publication pins the allocation version shown.
-- There is deliberately NO fallback to MAX(a.version): a NULL pin yields no
-- winner rows. Reintroducing a COALESCE here reopens B18-a. Harness case P15
-- fails if MAX( reappears over allocations in this body.
pinned_version AS (
  SELECT p.allocation_version AS version
  FROM public.publications p
  JOIN published_tournament pt ON pt.id = p.tournament_id
  WHERE p.tournament_id = get_public_tournament_results.tournament_id
    AND p.is_active = true
    AND p.allocation_version IS NOT NULL
  ORDER BY p.version DESC
  LIMIT 1
),
chosen_main_category AS (
  SELECT c.id
  FROM public.categories c
  JOIN published_tournament pt ON pt.id = c.tournament_id
  WHERE c.tournament_id = get_public_tournament_results.tournament_id
    AND c.is_active = true
  ORDER BY
    CASE
      WHEN lower(c.name) IN ('overall', 'overall ranking', 'overall results') THEN 0
      ELSE 1
    END,
    CASE WHEN COALESCE(c.is_main, false) THEN 0 ELSE 1 END,
    c.order_idx ASC NULLS LAST,
    c.created_at ASC NULLS LAST,
    c.name ASC,
    c.id ASC
  LIMIT 1
),
base_rows AS (
  SELECT
    a.prize_id,
    COALESCE(NULLIF(TRIM(p.full_name), ''), p.name, 'Unknown') AS player_name,
    p.rank,
    p.rating,
    p.state,
    c.name AS category_name,
    (c.id = cmc.id) AS is_main,
    pr.place,
    COALESCE(pr.cash_amount, 0)::integer AS cash_amount,
    COALESCE(pr.has_trophy, false) AS has_trophy,
    COALESCE(pr.has_medal, false) AS has_medal,
    COALESCE(pr.gift_items, '[]'::jsonb) AS gift_items,
    ROW_NUMBER() OVER (
      PARTITION BY (c.id = cmc.id)
      ORDER BY pr.place ASC, a.prize_id ASC
    ) AS main_rank
  FROM public.allocations a
  JOIN pinned_version pv ON pv.version = a.version
  JOIN public.prizes pr ON pr.id = a.prize_id
  JOIN public.categories c ON c.id = pr.category_id
  JOIN chosen_main_category cmc ON true
  LEFT JOIN public.players p ON p.id = a.player_id
  WHERE a.tournament_id = get_public_tournament_results.tournament_id
    AND a.player_id IS NOT NULL
)
SELECT
  b.prize_id,
  b.player_name,
  b.rank,
  b.rating,
  b.state,
  b.category_name,
  b.is_main,
  b.place,
  b.cash_amount,
  b.has_trophy,
  b.has_medal,
  s.has_full_access,
  s.preview_main_limit,
  NOT s.has_full_access AS other_categories_locked,
  b.gift_items
FROM base_rows b
CROSS JOIN access_state s
WHERE s.has_full_access
   OR (
     s.has_full_access = false
     AND b.is_main = true
     AND b.main_rank <= COALESCE(s.preview_main_limit, 0)
   )
ORDER BY
  b.is_main DESC,
  b.place ASC,
  b.prize_id ASC;
$fn$;

-- ---------------------------------------------------------------------------
-- 5) Grant hygiene (D18): close BOTH paths, PUBLIC and the direct default grant.
--    Reproduces the pre-migration ACL exactly -- verified before writing:
--      publish_tournament            : anon=false, authenticated=true, no PUBLIC
--      get_public_tournament_results : anon=true,  authenticated=true, no PUBLIC
-- ---------------------------------------------------------------------------
revoke all on function public.publish_tournament(uuid, text) from public;
revoke all on function public.publish_tournament(uuid, text) from anon;
grant execute on function public.publish_tournament(uuid, text) to authenticated;

revoke all on function public.get_public_tournament_results(uuid) from public;
grant execute on function public.get_public_tournament_results(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) POST-CHECKS. Raise loudly on any failure; the whole migration unwinds.
-- ---------------------------------------------------------------------------
do $postcheck$
declare n int; args text; failures text := '';
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='publications'
                    and column_name='allocation_version') then
    failures := failures || E'\n  - allocation_version column was not created';
  end if;

  select count(*) into n from public.publications
   where is_active and allocation_version is not null;
  if n <> 35 then
    failures := failures || format(E'\n  - expected 35 backfilled active publications, got %s', n);
  end if;

  select count(*) into n from public.publications
   where is_active and allocation_version is null;
  if n <> 0 then
    failures := failures || format(E'\n  - %s active publications still have a NULL pin', n);
  end if;

  -- publish_tournament signature must be untouched (B22 harness depends on it)
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='publish_tournament';
  if n <> 1 then
    failures := failures || format(E'\n  - publish_tournament overload count is %s, expected 1', n);
  end if;

  select pg_get_function_arguments(p.oid) into args
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='publish_tournament';
  if args <> 'tournament_id uuid, requested_slug text DEFAULT NULL::text' then
    failures := failures || format(E'\n  - publish_tournament signature changed to: %s', args);
  end if;

  -- publish_tournament must now write the pin
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='publish_tournament'
     and p.prosrc ilike '%allocation_version%';
  if n <> 1 then
    failures := failures || E'\n  - publish_tournament does not reference allocation_version';
  end if;

  -- the reader must use the pin and must NOT have kept a MAX() fallback
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='get_public_tournament_results'
     and p.prosrc ilike '%pinned_version%';
  if n <> 1 then
    failures := failures || E'\n  - get_public_tournament_results does not use pinned_version';
  end if;

  -- Strip SQL line comments before matching. prosrc INCLUDES comments, so the
  -- explanatory note inside the function body -- which says there is no
  -- MAX(a.version) fallback -- matched a naive guard looking for exactly that
  -- literal, and this post-check failed on a correct function. Control-tested
  -- 5 Sep: comment-only mention => false, real COALESCE fallback => true.
  -- Note publish_tournament legitimately contains MAX(a.version); this guard is
  -- deliberately scoped to the reader only.
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='get_public_tournament_results'
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%MAX(a.version)%';
  if n <> 0 then
    failures := failures || E'\n  - get_public_tournament_results still contains a MAX(a.version) fallback in CODE';
  end if;

  -- grants
  if has_function_privilege('anon','public.publish_tournament(uuid,text)','EXECUTE') then
    failures := failures || E'\n  - anon holds EXECUTE on publish_tournament';
  end if;
  if not has_function_privilege('authenticated','public.publish_tournament(uuid,text)','EXECUTE') then
    failures := failures || E'\n  - authenticated LOST EXECUTE on publish_tournament';
  end if;
  if not has_function_privilege('anon','public.get_public_tournament_results(uuid)','EXECUTE') then
    failures := failures || E'\n  - anon LOST EXECUTE on get_public_tournament_results (public page would break)';
  end if;

  if failures <> '' then
    raise exception E'B18-a POST-CHECK FAILED:%', failures;
  end if;
end
$postcheck$;

-- PostgREST must learn about publications.allocation_version, because the
-- public pages select it directly in B18-b (T6).
notify pgrst, 'reload schema';

commit;
