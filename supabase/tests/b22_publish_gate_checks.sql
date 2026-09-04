-- =============================================================================
-- supabase/tests/b22_publish_gate_checks.sql
-- B22 verification harness — 14 checks, self-aborting, fully rolled back.
--
-- PASS CONDITION: "14 passed, 0 failed, 0 skipped" inside an ERROR:.
--
-- THIS IS THE FIRST HARNESS EVER WRITTEN FOR publish_tournament. B18 rewrites
-- the same function next; it inherits this file rather than editing an
-- unguarded function.
--
-- Every verdict starts as 'skipped' and is overwritten only when its check
-- runs. Skipped is not pass (D39).
--
-- All fixtures are created inside the transaction and unwound by the closing
-- RAISE EXCEPTION. Nothing is committed.
--
-- Run: supabase db query --linked -f supabase/tests/b22_publish_gate_checks.sql
-- =============================================================================

do $b22$
declare
  v jsonb := '{}'::jsonb;
  det jsonb := '{}'::jsonb;
  k text;
  n_pass int := 0; n_fail int := 0; n_skip int := 0;
  report text := '';

  labels jsonb := jsonb_build_object(
    'T1','placeholder title is REFUSED at publish (TITLE_REQUIRED)',
    'T2','MATCHED PAIR: same tournament publishes once renamed',
    'T3','blank title is REFUSED',
    'T4','whitespace-only title is REFUSED',
    'T5','case AND internal-spacing variant of the placeholder is REFUSED',
    'T6','stub slug is regenerated from the title after a rename',
    'T7','NEGATIVE CONTROL: a normal slug SURVIVES a republish (links do not break)',
    'T8','explicit requested_slug still wins over the existing slug',
    'T9','uniqueness loop still appends -2 on a clash with another active pub',
    'T10','publish still sets is_published, status and the active publication',
    'T11','a non-owner non-master is still refused (auth unchanged)',
    'T12','anon holds no EXECUTE on publish_tournament',
    'T13','exactly one publish_tournament overload',
    'T14','no PUBLISHED tournament is left unpublishable by the gate'
  );

  v_owner uuid; v_email text; v_other uuid; v_other_email text;
  t_stub uuid; t_norm uuid; t_clash uuid;
  got_slug text; got_ver int; tmp int; msg text;
  f_pub boolean; f_status text;
begin
  for k in select jsonb_object_keys(labels) loop
    v := v || jsonb_build_object(k,'skipped');
    det := det || jsonb_build_object(k,'(did not run)');
  end loop;

  -- fixture owner: a real user, so has_role / auth checks behave normally
  select u.id, u.email into v_owner, v_email
    from auth.users u
    join public.profiles p on p.id = u.id
   where u.email = 'chess.tushar@gmail.com';
  select u.id, u.email into v_other, v_other_email
    from auth.users u
   where u.id <> v_owner
     and not public.has_role(u.id, 'master'::public.app_role)
   order by u.created_at limit 1;

  if v_owner is null or v_other is null then
    raise exception 'B22 HARNESS: fixture users unavailable (owner=%, other=%)', v_owner, v_other;
  end if;

  ---------------------------------------------------------------------------
  -- fixtures
  ---------------------------------------------------------------------------
  insert into public.tournaments (title, start_date, end_date, status, owner_id)
  values ('Untitled Tournament', current_date, current_date, 'draft', v_owner)
  returning id into t_stub;

  insert into public.tournaments (title, start_date, end_date, status, owner_id)
  values ('B22 Harness Normal Event', current_date, current_date, 'draft', v_owner)
  returning id into t_norm;

  insert into public.tournaments (title, start_date, end_date, status, owner_id)
  values ('B22 Harness Normal Event', current_date, current_date, 'draft', v_owner)
  returning id into t_clash;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text,'role','authenticated','email', v_email)::text, true);

  ---------------------------------------------------------------------------
  -- T1 placeholder title refused
  ---------------------------------------------------------------------------
  begin
    perform public.publish_tournament(t_stub, null);
    v := v || jsonb_build_object('T1','FAIL');
    det := det || jsonb_build_object('T1','published a placeholder-titled tournament');
  exception when others then
    msg := SQLERRM;
    v := v || jsonb_build_object('T1', case when msg like 'TITLE_REQUIRED%' then 'pass' else 'FAIL' end);
    det := det || jsonb_build_object('T1', left(msg,70));
  end;

  ---------------------------------------------------------------------------
  -- T3 blank title / T4 whitespace-only / T5 case variant
  ---------------------------------------------------------------------------
  update public.tournaments set title = '' where id = t_stub;
  begin
    perform public.publish_tournament(t_stub, null);
    v := v || jsonb_build_object('T3','FAIL');
  exception when others then
    v := v || jsonb_build_object('T3', case when SQLERRM like 'TITLE_REQUIRED%' then 'pass' else 'FAIL' end);
    det := det || jsonb_build_object('T3', left(SQLERRM,60));
  end;

  update public.tournaments set title = '    ' where id = t_stub;
  begin
    perform public.publish_tournament(t_stub, null);
    v := v || jsonb_build_object('T4','FAIL');
  exception when others then
    v := v || jsonb_build_object('T4', case when SQLERRM like 'TITLE_REQUIRED%' then 'pass' else 'FAIL' end);
    det := det || jsonb_build_object('T4', left(SQLERRM,60));
  end;

  update public.tournaments set title = '  UNTITLED   tournament ' where id = t_stub;
  begin
    perform public.publish_tournament(t_stub, null);
    v := v || jsonb_build_object('T5','FAIL');
    det := det || jsonb_build_object('T5','case variant slipped through');
  exception when others then
    v := v || jsonb_build_object('T5', case when SQLERRM like 'TITLE_REQUIRED%' then 'pass' else 'FAIL' end);
    det := det || jsonb_build_object('T5', left(SQLERRM,60));
  end;

  ---------------------------------------------------------------------------
  -- T2 MATCHED PAIR: the same row publishes once it has a real name.
  -- The positive side must actually produce a positive, or T1 proves nothing.
  ---------------------------------------------------------------------------
  update public.tournaments set title = 'B22 Harness Renamed Event' where id = t_stub;
  select p.slug, p.version into got_slug, got_ver
    from public.publish_tournament(t_stub, null) p;
  -- version is deliberately NOT asserted here: it depends on whether an
  -- earlier check published this fixture, which made T2 fail as a cascade of
  -- T5 rather than on its own merits. T10 covers the published state.
  v := v || jsonb_build_object('T2',
        case when got_slug = 'b22-harness-renamed-event' then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T2', format('slug=%s version=%s', got_slug, got_ver));

  select is_published, status into f_pub, f_status from public.tournaments where id = t_stub;
  select count(*) into tmp from public.publications where tournament_id = t_stub and is_active;
  v := v || jsonb_build_object('T10',
        case when f_pub and f_status='published' and tmp=1 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T10', format('is_published=%s status=%s active=%s', f_pub, f_status, tmp));

  ---------------------------------------------------------------------------
  -- T6 stub slug is regenerated after a rename
  ---------------------------------------------------------------------------
  update public.tournaments set public_slug = 'untitled-tournament-9',
                                title = 'B22 Harness Stub Recovered'
   where id = t_stub;
  select p.slug into got_slug from public.publish_tournament(t_stub, null) p;
  v := v || jsonb_build_object('T6',
        case when got_slug = 'b22-harness-stub-recovered' then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T6', 'from untitled-tournament-9 -> '||got_slug);

  ---------------------------------------------------------------------------
  -- T7 NEGATIVE CONTROL. A real slug must SURVIVE a rename+republish.
  -- If this fails, the fix breaks every shared public link in existence.
  ---------------------------------------------------------------------------
  select p.slug into got_slug from public.publish_tournament(t_norm, null) p;
  update public.tournaments set title = 'B22 Harness Renamed Again' where id = t_norm;
  select p.slug into got_slug from public.publish_tournament(t_norm, null) p;
  v := v || jsonb_build_object('T7',
        case when got_slug = 'b22-harness-normal-event' then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T7', 'slug after rename = '||got_slug||' (must be the ORIGINAL)');

  ---------------------------------------------------------------------------
  -- T9 uniqueness loop still appends a suffix.
  -- ORDER IS LOad-BEARING: this must run BEFORE T8. The loop only inspects
  -- ACTIVE publications, and T8 republishes t_norm under an explicit slug,
  -- which deactivates the very row t_clash needs to collide with.
  ---------------------------------------------------------------------------
  select p.slug into got_slug from public.publish_tournament(t_clash, null) p;
  v := v || jsonb_build_object('T9', case when got_slug like 'b22-harness-normal-event-%' then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T9', got_slug);

  ---------------------------------------------------------------------------
  -- T8 explicit requested_slug wins (runs last: it dissolves T9's fixture)
  ---------------------------------------------------------------------------
  select p.slug into got_slug from public.publish_tournament(t_norm, 'b22-explicit-slug') p;
  v := v || jsonb_build_object('T8', case when got_slug = 'b22-explicit-slug' then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T8', got_slug);

  ---------------------------------------------------------------------------
  -- T11 auth unchanged
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_other::text,'role','authenticated','email', v_other_email)::text, true);
  begin
    perform public.publish_tournament(t_norm, null);
    v := v || jsonb_build_object('T11','FAIL');
    det := det || jsonb_build_object('T11','a non-owner published someone else''s tournament');
  exception when others then
    v := v || jsonb_build_object('T11', case when SQLERRM like '%not authorized%' then 'pass' else 'FAIL' end);
    det := det || jsonb_build_object('T11', left(SQLERRM,60));
  end;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  ---------------------------------------------------------------------------
  -- T12 / T13 structural
  ---------------------------------------------------------------------------
  select count(*) into tmp from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='publish_tournament'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  v := v || jsonb_build_object('T12', case when tmp = 0 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T12', tmp::text||' overloads anon may execute');

  select count(*) into tmp from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='publish_tournament';
  v := v || jsonb_build_object('T13', case when tmp = 1 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T13', tmp::text||' overloads');

  ---------------------------------------------------------------------------
  -- T14 no live tournament is stranded by the gate
  ---------------------------------------------------------------------------
  select count(*) into tmp from public.tournaments
   where is_published
     and (coalesce(btrim(title),'') = '' or lower(btrim(title)) = 'untitled tournament');
  v := v || jsonb_build_object('T14', case when tmp = 0 then 'pass' else 'FAIL' end);
  det := det || jsonb_build_object('T14', tmp::text||' published rows the gate would now refuse to republish');

  ---------------------------------------------------------------------------
  for k in select jsonb_object_keys(labels) order by 1 loop
    report := report || format(E'\n  %-4s %-8s %-62s  %s', k, v ->> k, labels ->> k, det ->> k);
    if    v ->> k = 'pass' then n_pass := n_pass + 1;
    elsif v ->> k = 'FAIL' then n_fail := n_fail + 1;
    else                        n_skip := n_skip + 1;
    end if;
  end loop;

  raise exception E'B22 PUBLISH-GATE CHECKS%\n\nRESULTS: % passed, % failed, % skipped  (skipped is NOT pass)\nAll fixtures rolled back.',
    report, n_pass, n_fail, n_skip;
end $b22$;
