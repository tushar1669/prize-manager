-- =============================================================================
-- supabase/tests/g1_publish_state_checks.sql
-- Batch G1 verification harness — 16 checks, self-aborting, fully rolled back.
--
-- PASS CONDITION: "16 passed, 0 failed" inside an ERROR:.
--
-- Every verdict is initialised to 'skipped' and overwritten only when its check
-- actually runs.  Skipped is not pass (D39).
--
-- Run:  supabase db query --linked -f supabase/tests/g1_publish_state_checks.sql
-- Safe to run at any time.  It ends in RAISE EXCEPTION, so nothing it does —
-- including the live unpublish in check 16 — is ever committed.
-- =============================================================================

do $g1$
declare
  v   jsonb := '{}'::jsonb;          -- verdicts
  det jsonb := '{}'::jsonb;          -- detail
  k   text;
  n_pass int := 0; n_fail int := 0; n_skip int := 0;
  report text := '';

  labels jsonb := jsonb_build_object(
    'P1','allocations  public policy keys off is_published, not publications.is_active',
    'P2','prizes       public policy keys off is_published, not publications.is_active',
    'P3','publications public policy keys off is_published, not is_active alone',
    'P4','tournaments  public policy keys off is_published, not status',
    'P5','players      policy untouched (reference shape: no publications join)',
    'P6','PUBLIC roles preserved on all four policies (signed-in visitors keep read)',
    'D1','zero rows where is_published disagrees with an active publication row',
    'D2','zero rows where is_published=false and status=published',
    'D3','zero published rows are archived or soft-deleted (matches the public view)',
    'N1','anon reads 0 tournament rows for an unpublished tournament',
    'N2','anon reads 0 publication rows for an unpublished tournament',
    'N3','anon reads 0 allocation rows for an unpublished tournament',
    'N4','anon reads 0 prize rows for an unpublished tournament',
    'G1','FIXTURE GUARD: anon reads >0 allocations AND prizes AND players when published',
    'G2','anon still reads the tournament and publication rows when published',
    'B1','BEHAVIOURAL: unpublish_tournament flips all three flags and anon read drops to 0'
  );

  v_bad uuid; v_good uuid; v_owner uuid; v_email text;
  bt int; bp int; ba int; bz int;
  gt int; gp int; ga int; gz int; gl int;
  tmp int; q text;
  ub boolean; us text; ua int; u_anon int;
begin
  ---------------------------------------------------------------------------
  -- initialise every key to skipped before any check runs
  ---------------------------------------------------------------------------
  for k in select jsonb_object_keys(labels) loop
    v   := v   || jsonb_build_object(k, 'skipped');
    det := det || jsonb_build_object(k, '(did not run)');
  end loop;

  ---------------------------------------------------------------------------
  -- P1-P4 — the four PUBLIC policies must read tournaments.is_published
  ---------------------------------------------------------------------------
  q := coalesce((select pg_get_expr(polqual, polrelid) from pg_policy
                  where polname='public_read_published_allocations'
                    and polrelid='public.allocations'::regclass), '(absent)');
  v   := v   || jsonb_build_object('P1',
           case when q ilike '%is_published%' and q not ilike '%publications%' then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P1', left(regexp_replace(q,'\s+',' ','g'), 120));

  q := coalesce((select pg_get_expr(polqual, polrelid) from pg_policy
                  where polname='public_read_published_prizes'
                    and polrelid='public.prizes'::regclass), '(absent)');
  v   := v   || jsonb_build_object('P2',
           case when q ilike '%is_published%' and q not ilike '%publications%' then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P2', left(regexp_replace(q,'\s+',' ','g'), 120));

  q := coalesce((select pg_get_expr(polqual, polrelid) from pg_policy
                  where polname='public_read_active_publications'
                    and polrelid='public.publications'::regclass), '(absent)');
  v   := v   || jsonb_build_object('P3',
           case when q ilike '%is_published%' then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P3', left(regexp_replace(q,'\s+',' ','g'), 120));

  q := coalesce((select pg_get_expr(polqual, polrelid) from pg_policy
                  where polname='anyone_read_published_tournaments'
                    and polrelid='public.tournaments'::regclass), '(absent)');
  v   := v   || jsonb_build_object('P4',
           case when q ilike '%is_published%' and q not ilike '%status%' then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P4', left(regexp_replace(q,'\s+',' ','g'), 120));

  ---------------------------------------------------------------------------
  -- P5 — players must remain the reference shape
  ---------------------------------------------------------------------------
  select count(*) into tmp from pg_policy
   where polrelid='public.players'::regclass
     and pg_get_expr(polqual, polrelid) ilike '%publications%';
  v   := v   || jsonb_build_object('P5', case when tmp = 0 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P5', tmp::text || ' publications-keyed policies on players');

  ---------------------------------------------------------------------------
  -- P6 — roles must NOT have been narrowed. Dropping the PUBLIC policies or
  -- restricting them to anon would break signed-in visitors, which is the
  -- failure this batch deliberately avoided.
  ---------------------------------------------------------------------------
  select count(*) into tmp from pg_policy
   where polname in ('public_read_published_allocations','public_read_published_prizes',
                     'public_read_active_publications','anyone_read_published_tournaments')
     and polroles = '{0}';   -- {0} is PUBLIC
  v   := v   || jsonb_build_object('P6', case when tmp = 4 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P6', tmp::text || ' of 4 policies still role PUBLIC');

  ---------------------------------------------------------------------------
  -- D1-D3 — data reconciliation
  ---------------------------------------------------------------------------
  select count(*) into tmp from public.tournaments t
    join public.publications p on p.tournament_id = t.id and p.is_active
   where not t.is_published;
  v   := v   || jsonb_build_object('D1', case when tmp = 0 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('D1', tmp::text || ' drifted rows');

  select count(*) into tmp from public.tournaments
   where not is_published and status = 'published';
  v   := v   || jsonb_build_object('D2', case when tmp = 0 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('D2', tmp::text || ' rows unpublished but status=published');

  select count(*) into tmp from public.tournaments
   where is_published and (is_archived or deleted_at is not null);
  v   := v   || jsonb_build_object('D3', case when tmp = 0 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('D3', tmp::text || ' published rows archived/deleted (view hides these, policy would not)');

  ---------------------------------------------------------------------------
  -- probes.  The negative probe is now "unpublished but HAS a publication row"
  -- because the fix destroys the old "has an ACTIVE publication row" condition.
  -- A probe predicate that the fix dissolves would take the control test dark
  -- exactly when it most needs to keep passing.
  ---------------------------------------------------------------------------
  select t.id into v_bad from public.tournaments t
   where not t.is_published
     and exists (select 1 from public.publications p where p.tournament_id = t.id)
   order by t.id limit 1;

  select t.id, t.owner_id into v_good, v_owner from public.tournaments t
   where t.is_published
     and exists (select 1 from public.allocations a where a.tournament_id = t.id)
     and exists (select 1 from public.prizes pr join public.categories c on c.id = pr.category_id
                  where c.tournament_id = t.id)
     and exists (select 1 from public.players pl where pl.tournament_id = t.id)
   order by t.id limit 1;

  if v_bad is null or v_good is null then
    raise exception 'G1 HARNESS: probe selection failed (bad=%, good=%). Cannot form a matched pair.', v_bad, v_good;
  end if;

  ---------------------------------------------------------------------------
  -- N1-N4 / G1 / G2 — the matched pair, read as anon
  ---------------------------------------------------------------------------
  set local role anon;
  select count(*) into bt from public.tournaments  where id = v_bad;
  select count(*) into bp from public.publications where tournament_id = v_bad;
  select count(*) into ba from public.allocations  where tournament_id = v_bad;
  select count(*) into bz from public.prizes pr join public.categories c on c.id = pr.category_id
                          where c.tournament_id = v_bad;
  select count(*) into gt from public.tournaments  where id = v_good;
  select count(*) into gp from public.publications where tournament_id = v_good;
  select count(*) into ga from public.allocations  where tournament_id = v_good;
  select count(*) into gz from public.prizes pr join public.categories c on c.id = pr.category_id
                          where c.tournament_id = v_good;
  select count(*) into gl from public.players      where tournament_id = v_good;
  reset role;

  v := v || jsonb_build_object('N1', case when bt = 0 then 'pass' else 'FAIL' end);
  v := v || jsonb_build_object('N2', case when bp = 0 then 'pass' else 'FAIL' end);
  v := v || jsonb_build_object('N3', case when ba = 0 then 'pass' else 'FAIL' end);
  v := v || jsonb_build_object('N4', case when bz = 0 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('N1', bt::text) || jsonb_build_object('N2', bp::text)
             || jsonb_build_object('N3', ba::text) || jsonb_build_object('N4', bz::text);

  v := v || jsonb_build_object('G1', case when ga > 0 and gz > 0 and gl > 0 then 'pass' else 'FAIL' end);
  v := v || jsonb_build_object('G2', case when gt > 0 and gp > 0 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('G1', format('allocations=%s prizes=%s players=%s', ga, gz, gl))
             || jsonb_build_object('G2', format('tournaments=%s publications=%s', gt, gp));

  ---------------------------------------------------------------------------
  -- B1 — BEHAVIOURAL. Call the real unpublish_tournament as the real owner on
  -- the real published tournament, then read as anon.  Rolled back with
  -- everything else.  A policy that merely reads correctly is not proof that
  -- the unpublish path drives it correctly.
  ---------------------------------------------------------------------------
  select email into v_email from auth.users where id = v_owner;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated', 'email', v_email)::text, true);
  perform public.unpublish_tournament(v_good);
  reset role;
  perform set_config('request.jwt.claims', null, true);

  select t.is_published, t.status into ub, us from public.tournaments t where t.id = v_good;
  select count(*) into ua from public.publications p where p.tournament_id = v_good and p.is_active;

  set local role anon;
  select count(*) into u_anon from public.allocations where tournament_id = v_good;
  reset role;

  v := v || jsonb_build_object('B1',
         case when ub = false and us = 'draft' and ua = 0 and u_anon = 0 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('B1',
         format('is_published=%s status=%s active_pubs=%s anon_allocations=%s', ub, us, ua, u_anon));

  ---------------------------------------------------------------------------
  -- assemble and unwind
  ---------------------------------------------------------------------------
  for k in select jsonb_object_keys(labels) order by 1 loop
    report := report || format(E'\n  %-4s %-8s %-58s  %s',
                k, v ->> k, labels ->> k, det ->> k);
    if    v ->> k = 'pass'    then n_pass := n_pass + 1;
    elsif v ->> k = 'FAIL'    then n_fail := n_fail + 1;
    else                           n_skip := n_skip + 1;
    end if;
  end loop;

  raise exception E'G1 PUBLISH-STATE CHECKS%\n\n  negative probe %\n  positive probe %\n\nRESULTS: % passed, % failed, % skipped  (skipped is NOT pass)\nEverything above was rolled back.',
    report, v_bad, v_good, n_pass, n_fail, n_skip;
end $g1$;
