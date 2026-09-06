-- supabase/tests/tc0_team_version_checks.sql
--
-- TC0 — team snapshots resolve on publications.allocation_version.
--
-- Run:  supabase db query --linked -f supabase/tests/tc0_team_version_checks.sql
-- Pass: "12 passed, 0 failed" inside an ERROR:. The block always ends in
--       RAISE EXCEPTION, so every fixture unwinds and production is untouched.
--
-- THE DEFECT THIS ENCODES. Two counters were both called "version":
--   team_allocations.version  -- written by `finalize`, counts RESULTS
--   publications.version      -- written by publish,    counts PUBLISHES
-- Both publication triggers and detect_missing_team_snapshots compared the first
-- against the second. Measured 5 Sep 2026: they disagree on 24 of 35 active
-- publications. A tournament with active institution_prize_groups could become
-- permanently unpublishable on a number mismatch alone -- B21, the one-way door.
--
-- THREE MATCHED PAIRS, because no half of one is trustworthy alone:
--   T6 / T7   T6 says a newer team version does not move the pinned result.
--             Passes trivially if the resolver returns nothing at all.
--             T7 says resolving at MAX instead gives a DIFFERENT institution,
--             so the pin is proven load-bearing on this very fixture.
--   T8 / T9   Same publication row, one column apart. T8 pins to a version with
--             no team snapshot and must be REFUSED 23514. T9 pins to a version
--             that has one and must ACTIVATE. T8 alone would pass against a
--             trigger that refuses everything.
--   T10 / T11 T10 is the Option C allowance (NULL pin skips the check).
--             T11 is the control that a tournament with no team groups is
--             untouched by any of this -- 33 of 35 published tournaments.
--
-- T5 asserts the positive side is NON-ZERO, so T6 cannot pass on an empty set.
--
-- COMPARISON IS BY CONTENT, NOT ROW COUNT. The v1 and v2 team fixtures below
-- deliberately have the SAME number of rows and a DIFFERENT winning institution.
-- A row-count assertion passes on both and proves nothing (B18's lesson, and
-- live tournament 3ac176a1 where v7 and v8 both return 41 rows).
--
-- WHAT THIS HARNESS CANNOT REACH, stated rather than implied. publicTeamPrizes
-- is TypeScript on an Edge Function; SQL cannot call it. T6/T7 prove the pin
-- discriminates IN THE DATA. That the deployed reader actually uses the pin was
-- verified separately on 5 Sep by calling the function against
-- glanz-open-haryana-cup (publications.version = 2, allocation_version = 13) and
-- observing pinned_version = 13 in the response. Re-run that call after any
-- publicTeamPrizes deploy; this file will not catch a regression there.
--
-- CC7 ORDER DEPENDENCE: T8/T9/T10 mutate the same publication row that T6/T7
-- read, and T6's inserts create the version T9 pins to. Do not reorder T6..T10.

do $$
declare
  k text; v jsonb := '{}'::jsonb; det jsonb := '{}'::jsonb;
  n_pass int := 0; n_fail int := 0; n_skip int := 0; r text := '';
  verdict text;

  v_owner uuid; v_email text;
  t_team uuid; t_plain uuid;
  c1 uuid; pr1 uuid; pl1 uuid; pl2 uuid;
  c2 uuid; pr2 uuid; pl3 uuid;
  g1 uuid; ip1 uuid;
  pub_team uuid;

  got_pin int; tmp int; msg text;
  pin_key text; max_key text; max_ver int;
  fired_no_snap boolean := false; ok_with_snap boolean := false;
  ok_null_pin boolean := false; ok_plain boolean := false;
  detect_state text := '';

  labels jsonb := jsonb_build_object(
    'T1',  'enforce trigger joins allocation_version, not the publish counter',
    'T2',  'guard trigger joins allocation_version, not the publish counter',
    'T3',  'detect_missing_team_snapshots uses the pin and drops is_master(auth.uid())',
    'T4',  'detect_missing_team_snapshots EXECUTES (no 42883)  <-- the dead diagnostic',
    'T5',  'B21 DOOR: publish SUCCEEDS when the results version != the publish counter',
    'T6',  'a NEW team_allocations version does NOT move the pinned result  <-- THE DEFECT',
    'T7',  'resolving at MAX gives a DIFFERENT institution (pin is load-bearing)',
    'T8',  'activation REFUSED when the pin has no team snapshot (23514)',
    'T9',  'MATCHED PAIR: same row, pin moved to a version that HAS one -> ACTIVATES',
    'T10', 'NULL pin + active team groups -> activation ALLOWED (B18 Option C)',
    'T11', 'CONTROL: a tournament with no active team groups publishes regardless',
    'T12', 'exactly 2 triggers on publications, both still column-scoped'
  );
begin
  ---------------------------------------------------------------------------
  -- FIXTURE CAPTURE — isolated from every case body, so a seeding error is
  -- never mistaken for a failing check.
  ---------------------------------------------------------------------------
  select u.id, u.email into v_owner, v_email
    from auth.users u join public.profiles p on p.id = u.id
   where u.email = 'chess.tushar@gmail.com';

  if v_owner is null then
    raise exception 'TC0 HARNESS: fixture owner chess.tushar@gmail.com unavailable';
  end if;

  -- t_team: a tournament WITH an active institution prize group
  insert into public.tournaments (title, start_date, end_date, status, owner_id)
  values ('TC0 Harness Team Event', current_date, current_date, 'draft', v_owner)
  returning id into t_team;

  insert into public.categories (tournament_id, name, is_active)
  values (t_team, 'Overall', true) returning id into c1;
  insert into public.prizes (category_id, place, cash_amount, is_active)
  values (c1, 1, 1000, true) returning id into pr1;
  insert into public.players (tournament_id, rank, name)
  values (t_team, 1, 'TC0 Alpha') returning id into pl1;
  insert into public.players (tournament_id, rank, name)
  values (t_team, 2, 'TC0 Beta') returning id into pl2;

  -- Allocation version 5, NOT 1. This is deliberate and load-bearing: the first
  -- publish always makes publications.version = 1, so a fixture allocating at v1
  -- accidentally makes the two counters agree -- the exact coincidence that hid
  -- this bug on 11 of 35 live publications. Starting at 5 forces them apart, so
  -- T5 below CANNOT pass against the pre-TC0 code: the old trigger would look for
  -- a team snapshot at version 1, find none, and refuse the publish outright.
  -- That refusal IS B21.
  insert into public.allocations (tournament_id, version, prize_id, player_id)
  values (t_team, 5, pr1, pl1);

  insert into public.institution_prize_groups (tournament_id, name, group_by, team_size)
  values (t_team, 'TC0 Best School', 'club', 2) returning id into g1;
  insert into public.institution_prizes (group_id, place, cash_amount)
  values (g1, 1, 5000) returning id into ip1;

  -- team snapshot AT ALLOCATION VERSION 5 — the version the pin will hold
  insert into public.team_allocations
    (tournament_id, version, group_id, prize_id, place, institution_key, total_points)
  values (t_team, 5, g1, ip1, 1, 'TC0 SCHOOL A', 10);

  -- t_plain: no team groups at all, the 33-of-35 case
  insert into public.tournaments (title, start_date, end_date, status, owner_id)
  values ('TC0 Harness Plain Event', current_date, current_date, 'draft', v_owner)
  returning id into t_plain;
  insert into public.categories (tournament_id, name, is_active)
  values (t_plain, 'Overall', true) returning id into c2;
  insert into public.prizes (category_id, place, cash_amount, is_active)
  values (c2, 1, 100, true) returning id into pr2;
  insert into public.players (tournament_id, rank, name)
  values (t_plain, 1, 'TC0 Gamma') returning id into pl3;
  insert into public.allocations (tournament_id, version, prize_id, player_id)
  values (t_plain, 1, pr2, pl3);

  ---------------------------------------------------------------------------
  -- T1 / T2 / T3 — structural. Comments are stripped before matching, because
  -- prosrc INCLUDES them and these bodies document the very join they no longer
  -- contain. A naive match reads its own explanation and reports the defect
  -- present on a correct function (CC10).
  ---------------------------------------------------------------------------
  select count(*) into tmp from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='enforce_team_snapshots_on_publication_activate'
     and regexp_replace(p.prosrc,'--[^\n]*','','g') ilike '%ta.version = NEW.allocation_version%'
     and regexp_replace(p.prosrc,'--[^\n]*','','g') not ilike '%ta.version = NEW.version%';
  v := v || jsonb_build_object('T1', case when tmp = 1 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T1', format('functions matching pin-join AND NOT counter-join = %s (expect 1)', tmp));

  select count(*) into tmp from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='guard_publication_requires_team_snapshots'
     and regexp_replace(p.prosrc,'--[^\n]*','','g') ilike '%ta.version = new.allocation_version%'
     and regexp_replace(p.prosrc,'--[^\n]*','','g') not ilike '%ta.version = new.version%';
  v := v || jsonb_build_object('T2', case when tmp = 1 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T2', format('functions matching pin-join AND NOT counter-join = %s (expect 1)', tmp));

  select count(*) into tmp from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='detect_missing_team_snapshots'
     and regexp_replace(p.prosrc,'--[^\n]*','','g') ilike '%p.allocation_version%'
     and regexp_replace(p.prosrc,'--[^\n]*','','g') not ilike '%is_master(auth.uid())%'
     and regexp_replace(p.prosrc,'--[^\n]*','','g') not ilike '%a.version = p.version%';
  v := v || jsonb_build_object('T3', case when tmp = 1 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T3', format('functions matching all three conditions = %s (expect 1)', tmp));

  ---------------------------------------------------------------------------
  -- T4 — the diagnostic actually runs. Before TC0 every call raised 42883
  -- (is_master(uuid) does not exist) and /admin/team-snapshots never returned a
  -- row. The assertion is deliberately "NOT 42883" rather than "returns rows":
  -- a non-master caller correctly gets 42501 'forbidden', and that still proves
  -- the body executed and resolved is_master().
  ---------------------------------------------------------------------------
  begin
    perform * from public.detect_missing_team_snapshots();
    detect_state := 'returned rows (caller is master)';
  exception when others then
    detect_state := format('SQLSTATE %s (%s)', SQLSTATE, left(SQLERRM, 40));
  end;
  v := v || jsonb_build_object('T4', case when detect_state not like '%42883%' then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T4', format('%s -- must NOT be 42883', detect_state));

  ---------------------------------------------------------------------------
  -- T5 — publish as the owner. The trigger must ALLOW this: the pin will be
  -- allocation version 1 and a team snapshot exists at 1. Non-zero positive
  -- side, without which T6 passes on an empty resolver.
  ---------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role','authenticated','email', v_email)::text, true);
  perform public.publish_tournament(t_team, null);
  perform public.publish_tournament(t_plain, null);
  reset role;

  select p.id, p.allocation_version into pub_team, got_pin
    from public.publications p where p.tournament_id = t_team and p.is_active;
  v := v || jsonb_build_object('T5', case when got_pin = 5 and pub_team is not null then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T5',
    format('pin = %s (expect 5); active publication present = %s', coalesce(got_pin::text,'NULL'), pub_team is not null));

  ---------------------------------------------------------------------------
  -- T6 / T7 — THE DEFECT. A re-finalize creates allocation version 2 and a team
  -- snapshot at 2 with a DIFFERENT winning school, at an IDENTICAL row count.
  -- The pin still says 1, so the published team result must still be SCHOOL A.
  ---------------------------------------------------------------------------
  insert into public.allocations (tournament_id, version, prize_id, player_id)
  values (t_team, 6, pr1, pl2);
  insert into public.team_allocations
    (tournament_id, version, group_id, prize_id, place, institution_key, total_points)
  values (t_team, 6, g1, ip1, 1, 'TC0 SCHOOL B', 99);

  select ta.institution_key into pin_key
    from public.team_allocations ta
   where ta.tournament_id = t_team
     and ta.version = (select p.allocation_version from public.publications p
                        where p.tournament_id = t_team and p.is_active);

  select max(ta.version) into max_ver from public.team_allocations ta where ta.tournament_id = t_team;
  select ta.institution_key into max_key
    from public.team_allocations ta
   where ta.tournament_id = t_team and ta.version = max_ver;

  v := v || jsonb_build_object('T6', case when pin_key = 'TC0 SCHOOL A' then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T6',
    format('result at pin = %s (must stay "TC0 SCHOOL A")', coalesce(pin_key,'NULL')));

  v := v || jsonb_build_object('T7',
    case when pin_key is not null and max_key is not null and pin_key <> max_key then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T7',
    format('pin -> %s, MAX(v%s) -> %s (must DIFFER, at identical row counts)',
           coalesce(pin_key,'NULL'), coalesce(max_ver::text,'-'), coalesce(max_key,'NULL')));

  ---------------------------------------------------------------------------
  -- T8 / T9 — trigger matched pair on ONE publication row, one column apart.
  -- Version 7 has no team snapshot; version 6 does (inserted by T6).
  ---------------------------------------------------------------------------
  update public.publications set is_active = false where id = pub_team;

  update public.publications set allocation_version = 7 where id = pub_team;
  begin
    update public.publications set is_active = true where id = pub_team;
    fired_no_snap := false;
  exception when others then
    fired_no_snap := (SQLSTATE = '23514'); msg := left(SQLERRM, 45);
  end;
  v := v || jsonb_build_object('T8', case when fired_no_snap then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T8',
    format('refused with 23514 = %s ("%s")', fired_no_snap, coalesce(msg,'-')));

  update public.publications set is_active = false where id = pub_team;
  update public.publications set allocation_version = 6 where id = pub_team;
  begin
    update public.publications set is_active = true where id = pub_team;
    ok_with_snap := true;
  exception when others then
    ok_with_snap := false; msg := left(SQLERRM, 45);
  end;
  v := v || jsonb_build_object('T9', case when ok_with_snap then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T9',
    format('activated at a version WITH a snapshot = %s', ok_with_snap));

  ---------------------------------------------------------------------------
  -- T10 — Option C. A NULL pin means the tournament was published before it had
  -- results. Blocking here would recreate B21 on a different flow: 4 of 39
  -- publications since June were made with zero allocations, all by customers.
  ---------------------------------------------------------------------------
  update public.publications set is_active = false where id = pub_team;
  update public.publications set allocation_version = null where id = pub_team;
  begin
    update public.publications set is_active = true where id = pub_team;
    ok_null_pin := true;
  exception when others then
    ok_null_pin := false; msg := left(SQLERRM, 45);
  end;
  v := v || jsonb_build_object('T10', case when ok_null_pin then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T10',
    format('activated with a NULL pin = %s (expect true)', ok_null_pin));

  ---------------------------------------------------------------------------
  -- T11 — CONTROL. t_plain has no institution_prize_groups, so none of this
  -- machinery may touch it. Guards against the trigger over-firing on the 33
  -- published tournaments that have no team prizes.
  ---------------------------------------------------------------------------
  select count(*) into tmp from public.publications p
   where p.tournament_id = t_plain and p.is_active;
  ok_plain := (tmp = 1);
  v := v || jsonb_build_object('T11', case when ok_plain then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T11',
    format('active publications on a no-team-group tournament = %s (expect 1)', tmp));

  ---------------------------------------------------------------------------
  -- T12 — both triggers still attached and still column-scoped. Column scoping
  -- is what let B18-a backfill allocation_version on 35 live rows without
  -- firing either guard (CC9). If a future change widens the column list, every
  -- backfill starts firing them.
  ---------------------------------------------------------------------------
  select count(*) into tmp from pg_trigger
   where tgrelid = 'public.publications'::regclass and not tgisinternal
     and tgattr is not null and tgattr::text <> '';
  v := v || jsonb_build_object('T12', case when tmp = 2 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T12',
    format('column-scoped non-internal triggers on publications = %s (expect 2)', tmp));

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
  raise exception E'TC0 TEAM VERSION HARNESS%\n\n  % passed, % failed, % skipped  (expect 12 passed, 0 failed)\n  All fixtures rolled back by this exception.',
    r, n_pass, n_fail, n_skip;
end $$;
