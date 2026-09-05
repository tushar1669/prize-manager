-- supabase/migrations/20260905130000_tc0_team_version_join.sql
--
-- TC0 — TEAM PRIZE VERSION JOIN.
-- Fix the two-counter comparison that makes a team tournament permanently
-- unpublishable (B21).
--
-- DEFECT. Two independent counters are both called "version":
--   allocations.version / team_allocations.version -- incremented by finalize
--   publications.version                           -- incremented by publish
-- Both publication triggers, and detect_missing_team_snapshots, require
--   team_allocations.version = publications.version
-- which compares a RESULTS number against a PUBLISH number. Measured 5 Sep
-- 2026: those two numbers DISAGREE on 24 of 35 active publications
-- (publications.version runs 1-6; allocation_version runs 1-13). The 11 that
-- agree do so by accident -- exactly one finalize per publish.
--
-- CONSEQUENCE. Tournament 74e1bd2b (2 active institution_prize_groups, zero
-- allocations) holds 3 publication rows and not one of them can ever be
-- activated. That is the B21 one-way door, and it is why Team Championship was
-- ordered ahead of GTM.
--
-- FIX. Join on publications.allocation_version -- the column B18-a added for
-- precisely this purpose: "this publication displays results version N".
--
-- NULL RULE (inherits B18 Option C). allocation_version IS NULL means the
-- tournament was published before it had any results. The team check is then
-- SKIPPED and publishing is ALLOWED. Blocking would recreate B21 on a
-- different flow: 4 of 39 publications since June were made with zero
-- allocations, all by customers, results arriving 12 minutes to 5 hours later.
--
-- SECOND DEFECT, same function. detect_missing_team_snapshots calls
-- is_master(auth.uid()), but only a ZERO-ARG is_master() exists, so every call
-- has raised 42883 and /admin/team-snapshots has never returned a row. Switched
-- to is_master(). Verified 5 Sep: master_allowlist has 1 row, 1 verified master
-- role, and they agree -- so this has a reachable working state (CC4).
-- A new is_master(uuid) overload was CONSIDERED AND REJECTED: it would add a
-- SECURITY DEFINER surface (D38) to fix a caller this migration already
-- rewrites.
--
-- published_version now returns allocation_version instead of
-- publications.version. The column NAME is unchanged, so AdminTeamSnapshots.tsx
-- needs no edit -- it prints the value in a table cell and passes only
-- tournament_id to backfillTeamAllocations. The number displayed simply becomes
-- the meaningful one.
--
-- GRANTS DELIBERATELY UNTOUCHED. anon holds EXECUTE on all three of these
-- functions. That is real, pre-existing, and tracked as B7 debt. Revoking it
-- here would place the publish path of 35 live tournaments inside a change
-- whose only purpose is a join fix; detect_missing_team_snapshots fails closed
-- for anon regardless (42501 'forbidden'). CREATE OR REPLACE preserves ACLs.
-- The post-check asserts authenticated RETAINED execute, which is the privilege
-- whose loss would break the admin page.
--
-- KNOWN LIMITATION, recorded not fixed. Both triggers are column-scoped
-- (BEFORE INSERT OR UPDATE OF is_active[, version]), so an allocation_version
-- ONLY write fires neither -- that is what made B18-a's backfill safe (CC9),
-- and it means an owner, who holds full DML on publications, can repin to a
-- version with no team snapshots without the guard firing. Consistent with the
-- existing position in PROJECT_STATE 2: this is stability against accidental
-- drift, NOT tamper-proofing. Widening the trigger's column list would fire it
-- on every future backfill and is out of scope here.
--
-- SCOPE (DD1). Touches only team-engine objects plus the two publication
-- triggers. allocatePrizes, rule_config, conflicts, the allocations table and
-- supabase/functions/finalize are NOT touched. finalize already writes
-- team_allocations at the correct number, which is exactly why it needs no
-- change.
--
-- DRY-RUN (CC11). This file must be executed byte-for-byte and force-aborted
-- before it is applied. Observed dry-run results are recorded in
-- PROJECT_STATE, NOT appended here -- appending them would change the file
-- between dry run and apply, and prosrc-matching guards read comments (CC10).

begin;

-- ---------------------------------------------------------------------------
-- PRE-FLIGHT: assert the audited state. Refuse to run against anything else.
-- ---------------------------------------------------------------------------
do $preflight$
declare n int;
begin
  -- B18-a must be applied; this migration depends on its column.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'publications'
       and column_name = 'allocation_version'
  ) then
    raise exception 'TC0 PREFLIGHT: publications.allocation_version missing -- B18-a not applied';
  end if;

  -- Exactly one is_master, and it must be the zero-arg overload we are calling.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'is_master';
  if n <> 1 then
    raise exception 'TC0 PREFLIGHT: expected exactly 1 is_master overload, found %', n;
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = 'is_master'
       and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    raise exception 'TC0 PREFLIGHT: is_master exists but is not the zero-arg overload';
  end if;

  -- Both triggers must still be attached to publications.
  select count(*) into n from pg_trigger
   where tgrelid = 'public.publications'::regclass and not tgisinternal;
  if n <> 2 then
    raise exception 'TC0 PREFLIGHT: expected 2 triggers on publications, found %', n;
  end if;

  -- All three functions must still carry the OLD join we audited. Comments are
  -- stripped before matching, because prosrc includes them (CC10).
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.proname = 'enforce_team_snapshots_on_publication_activate'
       and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%ta.version = NEW.version%'
  ) then
    raise exception 'TC0 PREFLIGHT: enforce_team_snapshots_on_publication_activate does not carry the audited join';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.proname = 'guard_publication_requires_team_snapshots'
       and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%ta.version = new.version%'
  ) then
    raise exception 'TC0 PREFLIGHT: guard_publication_requires_team_snapshots does not carry the audited join';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.proname = 'detect_missing_team_snapshots'
       and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%is_master(auth.uid())%'
  ) then
    raise exception 'TC0 PREFLIGHT: detect_missing_team_snapshots does not carry the audited is_master(auth.uid()) call';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1/3 — INSERT-or-activate guard. Join the pinned allocation version.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_team_snapshots_on_publication_activate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only enforce when activating (or inserting active) publication
  IF NEW.is_active = true THEN

    -- TC0: a NULL pin means this tournament was published before it had any
    -- results (B18 Option C). Skip the team check and allow the publish.
    IF NEW.allocation_version IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.institution_prize_groups g
      WHERE g.tournament_id = NEW.tournament_id
        AND g.is_active = true
    ) THEN

      -- TC0: join the ALLOCATION version this publication pins. Previously
      -- this compared against NEW.version, which counts publishes, not
      -- results -- the two disagreed on 24 of 35 active publications.
      IF NOT EXISTS (
        SELECT 1
        FROM public.team_allocations ta
        WHERE ta.tournament_id = NEW.tournament_id
          AND ta.version = NEW.allocation_version
      ) THEN
        RAISE EXCEPTION
          'Cannot publish: missing team snapshots for tournament % at allocation version %',
          NEW.tournament_id, NEW.allocation_version
          USING errcode = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2/3 — UPDATE-activation guard. Same join, same NULL rule.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_publication_requires_team_snapshots()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- only when activating publication
  if (tg_op = 'UPDATE')
     and (coalesce(old.is_active, false) = false)
     and (coalesce(new.is_active, false) = true) then

    -- TC0: NULL pin => published before results existed (B18 Option C); allow.
    if new.allocation_version is null then
      return new;
    end if;

    -- if no active team prize groups, allow publish
    if not exists (
      select 1
      from public.institution_prize_groups g
      where g.tournament_id = new.tournament_id
        and g.is_active = true
    ) then
      return new;
    end if;

    -- TC0: join the pinned ALLOCATION version, not new.version.
    if not exists (
      select 1
      from public.team_allocations ta
      where ta.tournament_id = new.tournament_id
        and ta.version = new.allocation_version
    ) then
      raise exception 'Cannot publish: missing team snapshots for tournament %, allocation version %',
        new.tournament_id, new.allocation_version
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3/3 — Diagnostic. Fix the is_master call AND both wrong joins.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_missing_team_snapshots()
 RETURNS TABLE(tournament_id uuid, tournament_title text, published_version integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- TC0: was is_master(auth.uid()). No such overload exists, so every call
  -- raised 42883 and this page has never returned a row.
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.tournament_id,
    t.title,
    p.allocation_version
  FROM public.publications p
  JOIN public.tournaments t ON t.id = p.tournament_id
  WHERE p.is_active = true
    -- TC0: a NULL pin is not "missing snapshots", it is "published before
    -- results existed". Excluded rather than reported (B18 Option C).
    AND p.allocation_version IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.allocations a
      WHERE a.tournament_id = p.tournament_id AND a.version = p.allocation_version
    )
    AND EXISTS (
      SELECT 1 FROM public.institution_prize_groups g
      WHERE g.tournament_id = p.tournament_id AND g.is_active = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.team_allocations ta
      WHERE ta.tournament_id = p.tournament_id AND ta.version = p.allocation_version
    )
  ORDER BY t.title;
END;
$function$;

-- ---------------------------------------------------------------------------
-- POST-CHECK: every assertion below matches CODE, not comments (CC10).
-- ---------------------------------------------------------------------------
do $postcheck$
declare n int; failures text := '';
begin
  -- 1/3 must now join allocation_version, and must NOT retain the old join.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'enforce_team_snapshots_on_publication_activate'
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%ta.version = NEW.allocation_version%';
  if n <> 1 then
    failures := failures || E'\n  - enforce_team_snapshots_on_publication_activate does not join NEW.allocation_version';
  end if;

  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'enforce_team_snapshots_on_publication_activate'
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%ta.version = NEW.version%';
  if n <> 0 then
    failures := failures || E'\n  - enforce_team_snapshots_on_publication_activate STILL carries the publish-counter join in CODE';
  end if;

  -- 2/3 same pair.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'guard_publication_requires_team_snapshots'
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%ta.version = new.allocation_version%';
  if n <> 1 then
    failures := failures || E'\n  - guard_publication_requires_team_snapshots does not join new.allocation_version';
  end if;

  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'guard_publication_requires_team_snapshots'
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%ta.version = new.version%';
  if n <> 0 then
    failures := failures || E'\n  - guard_publication_requires_team_snapshots STILL carries the publish-counter join in CODE';
  end if;

  -- 3/3 is_master call fixed.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'detect_missing_team_snapshots'
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%is_master(auth.uid())%';
  if n <> 0 then
    failures := failures || E'\n  - detect_missing_team_snapshots STILL calls is_master(auth.uid()) in CODE';
  end if;

  -- 3/3 both joins fixed. Neither a.version = p.version nor ta.version =
  -- p.version may survive; both were wrong.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'detect_missing_team_snapshots'
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%a.version = p.version%';
  if n <> 0 then
    failures := failures || E'\n  - detect_missing_team_snapshots STILL joins allocations on p.version in CODE';
  end if;

  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'detect_missing_team_snapshots'
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%p.allocation_version%';
  if n <> 1 then
    failures := failures || E'\n  - detect_missing_team_snapshots does not reference p.allocation_version';
  end if;

  -- Signature must be unchanged, or AdminTeamSnapshots.tsx breaks.
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = 'detect_missing_team_snapshots'
       and pg_get_function_result(p.oid) ilike '%published_version integer%'
  ) then
    failures := failures || E'\n  - detect_missing_team_snapshots result signature changed (published_version lost)';
  end if;

  -- Triggers must still be attached, and still be exactly two.
  select count(*) into n from pg_trigger
   where tgrelid = 'public.publications'::regclass and not tgisinternal;
  if n <> 2 then
    failures := failures || format(E'\n  - expected 2 triggers on publications, found %s', n);
  end if;

  -- The privilege whose loss would break the admin page.
  if not has_function_privilege('authenticated', 'public.detect_missing_team_snapshots()', 'EXECUTE') then
    failures := failures || E'\n  - authenticated LOST EXECUTE on detect_missing_team_snapshots';
  end if;

  if failures <> '' then
    raise exception E'TC0 POST-CHECK FAILED:%', failures;
  end if;
end
$postcheck$;

-- detect_missing_team_snapshots was replaced; PostgREST re-reads the RPC (T6).
notify pgrst, 'reload schema';

commit;
