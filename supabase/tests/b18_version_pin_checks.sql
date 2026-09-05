-- supabase/tests/b18_version_pin_checks.sql
--
-- B18-a — published results are version-pinned.
--
-- Run:  supabase db query --linked -f supabase/tests/b18_version_pin_checks.sql
-- Pass: "16 passed, 0 failed" inside an ERROR:. The block always ends in
--       RAISE EXCEPTION, so every fixture unwinds and production is untouched.
--
-- THE CHECK THAT MATTERS IS P6. It encodes the defect directly: create a NEW,
-- content-different allocation version behind a published page and assert the
-- page DOES NOT MOVE. Before this migration that assertion fails, because
-- get_public_tournament_results followed MAX(allocations.version).
--
-- P6 and P7 are a MATCHED PAIR and neither is trustworthy alone:
--   P6 says a newer version is ignored.  Passes trivially if the reader is broken
--                                        and returns nothing at all.
--   P7 says repinning to that same newer version DOES change the output.
--                                        Fails if the pin is not load-bearing.
-- P5 asserts the positive side is NON-ZERO, so neither can pass on an empty set.
--
-- COMPARISON IS BY CONTENT CHECKSUM, NOT ROW COUNT. The v1 and v2 fixtures below
-- deliberately have the SAME number of rows and a DIFFERENT prize-to-player
-- mapping. A row-count assertion passes on both and proves nothing. This is not
-- hypothetical: on live tournament 3ac176a1, allocation v7 and v8 both return
-- exactly 41 rows with different winners.
--
-- P16 is the CC1 control pair for the backfill's trigger-safety claim. It uses a
-- REAL publication whose team-snapshot guard can actually fire. Using the local
-- fixture would give a control that can never fail (CC4).

do $$
declare
  k text; v jsonb := '{}'::jsonb; det jsonb := '{}'::jsonb;
  n_pass int := 0; n_fail int := 0; n_skip int := 0; r text := '';
  verdict text;

  v_owner uuid; v_email text;
  t_pin uuid; t_nopin uuid; t_unpub uuid;
  c1 uuid; pr1 uuid; pr2 uuid; pl1 uuid; pl2 uuid;
  c3 uuid; pr3 uuid; pl3 uuid;

  sig_v1 text; sig_after_v2 text; sig_pin_v2 text; sig_null text;
  n_v1 int; n_null int; n_unpub int;
  got_pin int; tmp int; args text; msg text;

  ctl_pub uuid; ctl_guard_fired boolean := false; ctl_ours_ok boolean := false;

  labels jsonb := jsonb_build_object(
    'P1',  'publications.allocation_version column exists',
    'P2',  'zero ACTIVE publications carry a NULL pin (backfill held)',
    'P3',  'publish_tournament pins MAX(allocations.version) at publish time',
    'P4',  'publish with ZERO allocations pins NULL (Option C, not a refusal)',
    'P5',  'a pinned published page returns a NON-ZERO number of rows',
    'P6',  'a NEW higher allocation version does NOT move the page  <-- THE DEFECT',
    'P7',  'repinning to that new version DOES move the page (pin is load-bearing)',
    'P8',  'a NULL pin yields ZERO winner rows',
    'P9',  'an UNPUBLISHED tournament still yields ZERO rows',
    'P10', 'publish_tournament has exactly one overload',
    'P11', 'publish_tournament keeps its DEFAULT NULL::text argument',
    'P12', 'anon holds NO EXECUTE on publish_tournament',
    'P13', 'anon RETAINS EXECUTE on get_public_tournament_results',
    'P14', 'neither function is granted to PUBLIC',
    'P15', 'get_public_tournament_results contains no MAX(a.version) fallback',
    'P16', 'allocation_version-only UPDATE does not fire the team-snapshot guard'
  );
begin
  for k in select jsonb_object_keys(labels) loop
    v := v || jsonb_build_object(k,'skipped');
    det := det || jsonb_build_object(k,'(did not run)');
  end loop;

  ---------------------------------------------------------------------------
  -- FIXTURE CAPTURE — isolated from every case body. An exception raised while
  -- building fixtures must not be mistaken for a failing check.
  ---------------------------------------------------------------------------
  select u.id, u.email into v_owner, v_email
    from auth.users u join public.profiles p on p.id = u.id
   where u.email = 'chess.tushar@gmail.com';

  if v_owner is null then
    raise exception 'B18 HARNESS: fixture owner chess.tushar@gmail.com unavailable';
  end if;

  -- t_pin: a normal tournament WITH allocations
  insert into public.tournaments (title, start_date, end_date, status, owner_id)
  values ('B18 Harness Pinned Event', current_date, current_date, 'draft', v_owner)
  returning id into t_pin;

  insert into public.categories (tournament_id, name, is_active)
  values (t_pin, 'Overall', true) returning id into c1;

  insert into public.prizes (category_id, place, cash_amount, is_active)
  values (c1, 1, 1000, true) returning id into pr1;
  insert into public.prizes (category_id, place, cash_amount, is_active)
  values (c1, 2, 500, true) returning id into pr2;

  insert into public.players (tournament_id, rank, name)
  values (t_pin, 1, 'Alpha Player') returning id into pl1;
  insert into public.players (tournament_id, rank, name)
  values (t_pin, 2, 'Beta Player') returning id into pl2;

  -- allocation version 1: Alpha=1st, Beta=2nd
  insert into public.allocations (tournament_id, version, prize_id, player_id)
  values (t_pin, 1, pr1, pl1), (t_pin, 1, pr2, pl2);

  -- t_nopin: published with NOTHING allocated
  insert into public.tournaments (title, start_date, end_date, status, owner_id)
  values ('B18 Harness Unallocated Event', current_date, current_date, 'draft', v_owner)
  returning id into t_nopin;

  -- t_unpub: has allocations, never published
  insert into public.tournaments (title, start_date, end_date, status, owner_id)
  values ('B18 Harness Never Published', current_date, current_date, 'draft', v_owner)
  returning id into t_unpub;
  insert into public.categories (tournament_id, name, is_active)
  values (t_unpub, 'Overall', true) returning id into c3;
  insert into public.prizes (category_id, place, cash_amount, is_active)
  values (c3, 1, 100, true) returning id into pr3;
  insert into public.players (tournament_id, rank, name)
  values (t_unpub, 1, 'Gamma Player') returning id into pl3;
  insert into public.allocations (tournament_id, version, prize_id, player_id)
  values (t_unpub, 1, pr3, pl3);

  -- publish the two that need publishing, as their owner
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role','authenticated','email', v_email)::text, true);
  perform public.publish_tournament(t_pin, null);
  perform public.publish_tournament(t_nopin, null);
  reset role;

  ---------------------------------------------------------------------------
  -- P1 / P2 — structure and backfill
  ---------------------------------------------------------------------------
  select count(*) into tmp from information_schema.columns
   where table_schema='public' and table_name='publications' and column_name='allocation_version';
  v := v || jsonb_build_object('P1', case when tmp = 1 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P1', format('column count = %s', tmp));

  -- NOTE: counts the fixture publications too, which is correct -- both were just
  -- published, so both must already carry a decided pin (t_nopin's is NULL and is
  -- excluded from this check by design; see P4).
  select count(*) into tmp from public.publications p
   where p.is_active and p.allocation_version is null and p.tournament_id <> t_nopin;
  v := v || jsonb_build_object('P2', case when tmp = 0 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P2', format('active pubs with NULL pin = %s (expect 0)', tmp));

  ---------------------------------------------------------------------------
  -- P3 / P4 — what publish_tournament wrote
  ---------------------------------------------------------------------------
  select p.allocation_version into got_pin from public.publications p
   where p.tournament_id = t_pin and p.is_active;
  v := v || jsonb_build_object('P3', case when got_pin = 1 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P3', format('pin = %s (expect 1)', coalesce(got_pin::text,'NULL')));

  select p.allocation_version into got_pin from public.publications p
   where p.tournament_id = t_nopin and p.is_active;
  v := v || jsonb_build_object('P4', case when got_pin is null then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P4',
    format('pin = %s (expect NULL); publish itself must SUCCEED, not be refused',
           coalesce(got_pin::text,'NULL')));

  ---------------------------------------------------------------------------
  -- P5 — positive side is non-zero. Without this, P6 passes on an empty reader.
  ---------------------------------------------------------------------------
  select coalesce(md5(string_agg(sig,'|' order by sig)),'EMPTY'), count(*)
    into sig_v1, n_v1
    from (select x.prize_id::text||':'||coalesce(x.player_name,'')||':'||x.place::text as sig
            from public.get_public_tournament_results(t_pin) x) z;
  v := v || jsonb_build_object('P5', case when n_v1 = 2 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P5', format('rows = %s (expect 2), sig = %s', n_v1, left(sig_v1,12)));

  ---------------------------------------------------------------------------
  -- P6 — THE DEFECT. Create allocation version 2 with the SAME row count and a
  -- DIFFERENT mapping (Alpha and Beta swapped), then assert the page is unmoved.
  --
  -- CC7 ORDER DEPENDENCE: this INSERT is read by P7 below, and P7 then REPINS the
  -- publication. Do not reorder P6, P7 and P8 -- P8 depends on P7 having left the
  -- pin repinned, and P7 depends on this insert existing.
  ---------------------------------------------------------------------------
  insert into public.allocations (tournament_id, version, prize_id, player_id)
  values (t_pin, 2, pr1, pl2), (t_pin, 2, pr2, pl1);

  select coalesce(md5(string_agg(sig,'|' order by sig)),'EMPTY')
    into sig_after_v2
    from (select x.prize_id::text||':'||coalesce(x.player_name,'')||':'||x.place::text as sig
            from public.get_public_tournament_results(t_pin) x) z;

  v := v || jsonb_build_object('P6', case when sig_after_v2 = sig_v1 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P6',
    format('before=%s after=%s (must be EQUAL)', left(sig_v1,12), left(sig_after_v2,12)));

  ---------------------------------------------------------------------------
  -- P7 — matched pair to P6: the pin must actually be load-bearing.
  ---------------------------------------------------------------------------
  update public.publications set allocation_version = 2
   where tournament_id = t_pin and is_active;

  select coalesce(md5(string_agg(sig,'|' order by sig)),'EMPTY')
    into sig_pin_v2
    from (select x.prize_id::text||':'||coalesce(x.player_name,'')||':'||x.place::text as sig
            from public.get_public_tournament_results(t_pin) x) z;

  v := v || jsonb_build_object('P7', case when sig_pin_v2 <> sig_v1 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P7',
    format('pin=1 -> %s, pin=2 -> %s (must DIFFER, at identical row counts)',
           left(sig_v1,12), left(sig_pin_v2,12)));

  ---------------------------------------------------------------------------
  -- P8 — NULL pin shows nothing (Option C)
  ---------------------------------------------------------------------------
  update public.publications set allocation_version = null
   where tournament_id = t_pin and is_active;
  select count(*) into n_null from public.get_public_tournament_results(t_pin);
  v := v || jsonb_build_object('P8', case when n_null = 0 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P8', format('rows with NULL pin = %s (expect 0)', n_null));

  ---------------------------------------------------------------------------
  -- P9 — the pre-existing is_published gate survived the rewrite
  ---------------------------------------------------------------------------
  select count(*) into n_unpub from public.get_public_tournament_results(t_unpub);
  v := v || jsonb_build_object('P9', case when n_unpub = 0 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P9', format('rows for unpublished = %s (expect 0)', n_unpub));

  ---------------------------------------------------------------------------
  -- P10..P15 — structural. B22's harness depends on the signature; B18 must not
  -- disturb it.
  ---------------------------------------------------------------------------
  select count(*) into tmp from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='publish_tournament';
  v := v || jsonb_build_object('P10', case when tmp = 1 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P10', format('overloads = %s', tmp));

  select pg_get_function_arguments(p.oid) into args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='publish_tournament';
  v := v || jsonb_build_object('P11',
    case when args = 'tournament_id uuid, requested_slug text DEFAULT NULL::text'
         then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P11', coalesce(args,'(none)'));

  v := v || jsonb_build_object('P12',
    case when not has_function_privilege('anon','public.publish_tournament(uuid,text)','EXECUTE')
         then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P12', 'anon EXECUTE on publish_tournament must be false');

  v := v || jsonb_build_object('P13',
    case when has_function_privilege('anon','public.get_public_tournament_results(uuid)','EXECUTE')
         then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P13', 'anon EXECUTE on the public reader must stay true');

  -- A PUBLIC grant is an aclitem with an EMPTY grantee, i.e. its text starts '='.
  -- Matching on a comma-joined string is order-dependent and misses the case
  -- where the PUBLIC entry happens to be first.
  select count(*) into tmp
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(coalesce(p.proacl, '{}'::aclitem[])) acl
   where n.nspname='public'
     and p.proname in ('publish_tournament','get_public_tournament_results')
     and acl::text like '=%';
  v := v || jsonb_build_object('P14', case when tmp = 0 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P14', format('PUBLIC grants found across both functions = %s (expect 0)', tmp));

  -- Comment-stripped: prosrc includes comments, and the function body documents
  -- that it has NO MAX(a.version) fallback. A naive match reads that sentence and
  -- reports the defect present on a correct function. Control-tested 5 Sep:
  -- comment-only mention => not matched, real COALESCE fallback => matched.
  select count(*) into tmp from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='get_public_tournament_results'
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ilike '%MAX(a.version)%';
  v := v || jsonb_build_object('P15', case when tmp = 0 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('P15',
    format('MAX(a.version) occurrences in reader CODE = %s (expect 0; a COALESCE fallback reopens B18-a)', tmp));

  ---------------------------------------------------------------------------
  -- P16 — CC1 control pair on the backfill's trigger-safety claim.
  -- Uses a REAL publication whose guard can fire: a tournament with active
  -- institution_prize_groups and no team_allocations. The local fixture has no
  -- team prize groups, so its guard could never fire and the control would be
  -- unfalsifiable (CC4).
  ---------------------------------------------------------------------------
  select p.id into ctl_pub
    from public.publications p join public.tournaments t on t.id = p.tournament_id
   where exists (select 1 from public.institution_prize_groups g
                  where g.tournament_id = t.id and g.is_active)
     and not exists (select 1 from public.team_allocations ta where ta.tournament_id = t.id)
   limit 1;

  if ctl_pub is null then
    v := v || jsonb_build_object('P16','skipped');
    det := det || jsonb_build_object('P16','no publication exists whose team-snapshot guard can fire');
  else
    -- TC0 (5 Sep 2026): the team-snapshot guard now joins
    -- publications.allocation_version instead of publications.version, and a NULL
    -- pin legitimately SKIPS the check (B18 Option C). The control row's pin is
    -- NULL, so as originally written this control could no longer make the guard
    -- fire, and P16 reported FAIL against a correct database. The fix dissolved
    -- its own probe -- exactly the CC4 trap.
    --
    -- Pin the row first so the guard CAN fire. Any non-null pin works: the
    -- selector above already guarantees this tournament has NO team_allocations
    -- at ANY version. This does NOT weaken the check -- P16 still FAILS if the
    -- guard stops firing on an is_active update.
    --
    -- Control-tested 5 Sep 2026 against production, rolled back:
    --   pin = NULL -> guard_fired = false (FAIL, reproduces the observed failure)
    --   pin = 1    -> guard_fired = true  (pass)
    update public.publications set allocation_version = 1 where id = ctl_pub;
    begin
      update public.publications set is_active = true where id = ctl_pub;
      ctl_guard_fired := false;
    exception when others then
      ctl_guard_fired := true; msg := left(SQLERRM, 50);
    end;
    begin
      update public.publications set allocation_version = 999 where id = ctl_pub;
      ctl_ours_ok := true;
    exception when others then
      ctl_ours_ok := false;
    end;
    v := v || jsonb_build_object('P16',
      case when ctl_guard_fired and ctl_ours_ok then 'pass' else 'FAIL' end);
    det := det || jsonb_build_object('P16',
      format('guard fired on is_active = %s (must be true: "%s"); column-only write ok = %s',
             ctl_guard_fired, coalesce(msg,'-'), ctl_ours_ok));
  end if;

  ---------------------------------------------------------------------------
  -- report + force abort
  ---------------------------------------------------------------------------
  for k in select jsonb_object_keys(labels) order by 1 loop
    verdict := v ->> k;
    r := r || format(E'\n  %-5s %-8s %s\n        %s', k, verdict, labels ->> k, det ->> k);
    if verdict = 'pass' then n_pass := n_pass + 1;
    elsif verdict = 'FAIL' then n_fail := n_fail + 1;
    else n_skip := n_skip + 1; end if;
  end loop;

  -- RAISE uses % as the placeholder, never %s: %s substitutes and leaves a stray 's'.
  raise exception E'B18-a VERSION PIN HARNESS%\n\n  % passed, % failed, % skipped  (expect 16 passed, 0 failed)\n  All fixtures rolled back by this exception.',
    r, n_pass, n_fail, n_skip;
end $$;
