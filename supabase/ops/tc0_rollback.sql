-- supabase/ops/tc0_rollback.sql
--
-- ROLLBACK for migration 20260905130000_tc0_team_version_join.sql.
--
-- NOT a migration. An operational script, in the same family as
-- f2_auto_approve_off.sql. Safe to run at any time. Restores the three
-- functions to their EXACT pre-TC0 bodies, captured from the live database on
-- 5 September 2026 via pg_get_functiondef().
--
-- WHAT THIS RESTORES, AND WHAT IT COSTS. Running this puts back the defect TC0
-- removes: both publication triggers, and detect_missing_team_snapshots, go
-- back to comparing team_allocations.version against publications.version --
-- a results counter against a publish counter. Those two numbers disagreed on
-- 24 of 35 active publications when measured. detect_missing_team_snapshots
-- also goes back to calling is_master(auth.uid()), which does not exist, so
-- /admin/team-snapshots returns to raising 42883 on every call.
--
-- Only run this if TC0 caused a regression that cannot be diagnosed quickly.
-- Grants are untouched: CREATE OR REPLACE preserves the existing ACL.

begin;

-- ---------------------------------------------------------------------------
-- PRE-FLIGHT: refuse to run unless TC0 is actually in place.
-- ---------------------------------------------------------------------------
do $preflight$
declare n int;
begin
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'enforce_team_snapshots_on_publication_activate'
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%ta.version = NEW.allocation_version%';
  if n <> 1 then
    raise exception 'TC0 ROLLBACK PREFLIGHT: TC0 is not applied -- nothing to roll back';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1/3 — enforce_team_snapshots_on_publication_activate (pre-TC0 body)
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
    -- Only enforce if there are active team prize groups
    IF EXISTS (
      SELECT 1
      FROM public.institution_prize_groups g
      WHERE g.tournament_id = NEW.tournament_id
        AND g.is_active = true
    ) THEN
      -- Require team_allocations for that pinned publication version
      IF NOT EXISTS (
        SELECT 1
        FROM public.team_allocations ta
        WHERE ta.tournament_id = NEW.tournament_id
          AND ta.version = NEW.version
      ) THEN
        RAISE EXCEPTION
          'Cannot publish: missing team snapshots for tournament % version %',
          NEW.tournament_id, NEW.version
          USING errcode = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2/3 — guard_publication_requires_team_snapshots (pre-TC0 body)
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

    -- if no active team prize groups, allow publish
    if not exists (
      select 1
      from public.institution_prize_groups g
      where g.tournament_id = new.tournament_id
        and g.is_active = true
    ) then
      return new;
    end if;

    -- require team snapshots for the pinned publication version
    if not exists (
      select 1
      from public.team_allocations ta
      where ta.tournament_id = new.tournament_id
        and ta.version = new.version
    ) then
      raise exception 'Cannot publish: missing team snapshots for tournament %, version %',
        new.tournament_id, new.version
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3/3 — detect_missing_team_snapshots (pre-TC0 body, INCLUDING the 42883 bug)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_missing_team_snapshots()
 RETURNS TABLE(tournament_id uuid, tournament_title text, published_version integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.tournament_id,
    t.title,
    p.version
  FROM public.publications p
  JOIN public.tournaments t ON t.id = p.tournament_id
  WHERE p.is_active = true
    AND EXISTS (
      SELECT 1 FROM public.allocations a
      WHERE a.tournament_id = p.tournament_id AND a.version = p.version
    )
    AND EXISTS (
      SELECT 1 FROM public.institution_prize_groups g
      WHERE g.tournament_id = p.tournament_id AND g.is_active = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.team_allocations ta
      WHERE ta.tournament_id = p.tournament_id AND ta.version = p.version
    )
  ORDER BY t.title;
END;
$function$;

-- ---------------------------------------------------------------------------
-- POST-CHECK: prove the old bodies are actually back.
-- ---------------------------------------------------------------------------
do $postcheck$
declare n int; failures text := '';
begin
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'enforce_team_snapshots_on_publication_activate'
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%ta.version = NEW.version%';
  if n <> 1 then
    failures := failures || E'\n  - enforce_team_snapshots_on_publication_activate not restored';
  end if;

  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'guard_publication_requires_team_snapshots'
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%ta.version = new.version%';
  if n <> 1 then
    failures := failures || E'\n  - guard_publication_requires_team_snapshots not restored';
  end if;

  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'detect_missing_team_snapshots'
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%is_master(auth.uid())%';
  if n <> 1 then
    failures := failures || E'\n  - detect_missing_team_snapshots not restored';
  end if;

  select count(*) into n from pg_trigger
   where tgrelid = 'public.publications'::regclass and not tgisinternal;
  if n <> 2 then
    failures := failures || format(E'\n  - expected 2 triggers on publications, found %s', n);
  end if;

  if failures <> '' then
    raise exception E'TC0 ROLLBACK POST-CHECK FAILED:%', failures;
  end if;
end
$postcheck$;

notify pgrst, 'reload schema';

commit;
