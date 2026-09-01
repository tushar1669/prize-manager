-- supabase/ops/backlog_sweep.sql
--
-- Re-measures every database-checkable backlog claim in PROJECT_STATE §14/§19
-- and prints one named verdict per item. READ-ONLY: the block always ends in
-- RAISE EXCEPTION, so the transaction unwinds and nothing is written.
--
-- Run:  supabase db query --linked -f supabase/ops/backlog_sweep.sql
--
-- Discipline (D39, applied to the backlog itself):
--   * Every item is initialised to 'UNMEASURED' and overwritten only when its
--     check actually runs. An item that errors stays UNMEASURED.
--   * UNMEASURED is never CLOSED. A check that did not run has told you nothing.
--   * The verdict is derived from a measurement, never from the document.
--
-- Reading the output: the exception body lists  ITEM = VERDICT (measured)
-- for every check, then a summary line. OPEN means the defect is still live.

do $$
declare
  r            text := '';
  n_open       int  := 0;
  n_closed     int  := 0;
  n_unmeasured int  := 0;

  -- one entry per check: key, human label, measured value, verdict
  k            text;
  v            text;
  verdict      text;

  m            jsonb := '{}'::jsonb;   -- measured values
  d            jsonb := '{}'::jsonb;   -- verdicts

  tmp_int      bigint;
  tmp_bool     boolean;

  -- anon control-test results
  anon_alloc   bigint := -1;
  anon_prizes  bigint := -1;
  anon_players bigint := -1;
  anon_tourn   bigint := -1;
  anon_pubs    bigint := -1;
  probe_id     uuid;

  labels       jsonb := jsonb_build_object(
    'B7a',  'B7  is_master(uuid) overload exists (detect_missing_team_snapshots depends on it)',
    'B7b',  'B7  anon holds EXECUTE on admin_create_coupon',
    'B7c',  'B7  anon holds EXECUTE on admin_list_coupons',
    'B7d',  'B7  anon holds EXECUTE on redeem_coupon_for_tournament',
    'B7e',  'B7  anon holds EXECUTE on bootstrap_master',
    'B7f',  'B7  untracked functions still present in public (of 9 named)',
    'B1a',  'B1  authenticated holds INSERT/UPDATE/DELETE on coupons',
    'B1b',  'B1  authenticated holds INSERT/UPDATE/DELETE on coupon_redemptions',
    'Y2',   'Y2  anon holds write grants on extraction_review_queue',
    'B17',  'B17 extraction-uploads file_size_limit (bytes)',
    'B18a', 'B18 get_public_tournament_results reads publications',
    'B18b', 'B18 publications.allocation_version column exists',
    'B18c', 'B18 allocations FKs still ON DELETE CASCADE',
    'B5',   'B5  auto-approvals with no audit row',
    'B14',  'B14 outbox rows not in a terminal sent state',
    'B10',  'B10 referral rows with a dangling user reference',
    'X1',   'NEW is_published disagrees with an active publication row',
    'X2',   'NEW allocation rows anon-reachable ONLY via the is_active path',
    'X3',   'NEW anon control read returns prize/allocation rows when unpublished',
    'X4',   'NEW anon can read the tournament row or its publication when unpublished',
    'GTM1', 'GTM published tournaments with a test-like title',
    'GTM2', 'GTM published tournaments (denominator)'
  );
begin
  ----------------------------------------------------------------------------
  -- initialise every key to UNMEASURED before any check runs
  ----------------------------------------------------------------------------
  for k in select jsonb_object_keys(labels) loop
    d := d || jsonb_build_object(k, 'UNMEASURED');
    m := m || jsonb_build_object(k, 'n/a');
  end loop;

  ----------------------------------------------------------------------------
  -- B7 — function-level grants and the missing overload (D38)
  ----------------------------------------------------------------------------
  select count(*) into tmp_int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'is_master' and p.pronargs = 1;
  m := m || jsonb_build_object('B7a', tmp_int::text);
  d := d || jsonb_build_object('B7a', case when tmp_int = 0 then 'OPEN' else 'CLOSED' end);

  select count(*) into tmp_int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='admin_create_coupon' and has_function_privilege('anon', p.oid, 'EXECUTE');
  m := m || jsonb_build_object('B7b', tmp_int::text);
  d := d || jsonb_build_object('B7b', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  select count(*) into tmp_int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='admin_list_coupons' and has_function_privilege('anon', p.oid, 'EXECUTE');
  m := m || jsonb_build_object('B7c', tmp_int::text);
  d := d || jsonb_build_object('B7c', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  select count(*) into tmp_int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='redeem_coupon_for_tournament' and has_function_privilege('anon', p.oid, 'EXECUTE');
  m := m || jsonb_build_object('B7d', tmp_int::text);
  d := d || jsonb_build_object('B7d', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  select count(*) into tmp_int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='bootstrap_master' and has_function_privilege('anon', p.oid, 'EXECUTE');
  m := m || jsonb_build_object('B7e', tmp_int::text);
  d := d || jsonb_build_object('B7e', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  select count(*) into tmp_int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname in (
     'admin_create_coupon','admin_list_coupons','detect_missing_team_snapshots',
     'enforce_team_snapshots_on_publication_activate','guard_publication_requires_team_snapshots',
     'issue_welcome_onboarding_reward','resolve_team_tie','tg_coupons_set_snapshot','tg_referrals_set_snapshot');
  m := m || jsonb_build_object('B7f', tmp_int::text);
  d := d || jsonb_build_object('B7f', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  ----------------------------------------------------------------------------
  -- B1 / Y2 — table-level write grants (RLS restricts rows, never columns: D36)
  ----------------------------------------------------------------------------
  select count(distinct privilege_type) into tmp_int from information_schema.table_privileges
   where table_schema='public' and table_name='coupons' and grantee='authenticated'
     and privilege_type in ('INSERT','UPDATE','DELETE');
  m := m || jsonb_build_object('B1a', tmp_int::text);
  d := d || jsonb_build_object('B1a', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  select count(distinct privilege_type) into tmp_int from information_schema.table_privileges
   where table_schema='public' and table_name='coupon_redemptions' and grantee='authenticated'
     and privilege_type in ('INSERT','UPDATE','DELETE');
  m := m || jsonb_build_object('B1b', tmp_int::text);
  d := d || jsonb_build_object('B1b', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  select count(distinct privilege_type) into tmp_int from information_schema.table_privileges
   where table_schema='public' and table_name='extraction_review_queue' and grantee='anon'
     and privilege_type in ('INSERT','UPDATE','DELETE');
  m := m || jsonb_build_object('Y2', tmp_int::text);
  d := d || jsonb_build_object('Y2', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  ----------------------------------------------------------------------------
  -- B17 — brochure upload cap
  ----------------------------------------------------------------------------
  select file_size_limit into tmp_int from storage.buckets where id = 'extraction-uploads';
  m := m || jsonb_build_object('B17', coalesce(tmp_int::text, 'null'));
  d := d || jsonb_build_object('B17', case when coalesce(tmp_int, 0) <= 10485760 then 'OPEN' else 'CLOSED' end);

  ----------------------------------------------------------------------------
  -- B18 — version pinning and the history cascade (AA3, AA4)
  ----------------------------------------------------------------------------
  select count(*) into tmp_int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='get_public_tournament_results'
     and pg_get_functiondef(p.oid) ilike '%publications%';
  m := m || jsonb_build_object('B18a', tmp_int::text);
  d := d || jsonb_build_object('B18a', case when tmp_int = 0 then 'OPEN' else 'CLOSED' end);

  select count(*) into tmp_int from information_schema.columns
   where table_schema='public' and table_name='publications' and column_name='allocation_version';
  m := m || jsonb_build_object('B18b', tmp_int::text);
  d := d || jsonb_build_object('B18b', case when tmp_int = 0 then 'OPEN' else 'CLOSED' end);

  select count(*) into tmp_int from pg_constraint
   where conrelid = 'public.allocations'::regclass and contype='f' and confdeltype='c';
  m := m || jsonb_build_object('B18c', tmp_int::text);
  d := d || jsonb_build_object('B18c', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  ----------------------------------------------------------------------------
  -- B5 / B14 / B10 — operational counters
  ----------------------------------------------------------------------------
  select count(*) into tmp_int
    from public.tournament_payments tp
    join public.tournament_entitlements te
      on te.tournament_id = tp.tournament_id and te.source = 'auto_upi'
    left join public.payment_auto_approval_audit aa on aa.payment_id = tp.id
   where tp.status = 'approved' and aa.payment_id is null;
  m := m || jsonb_build_object('B5', tmp_int::text);
  d := d || jsonb_build_object('B5', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  select count(*) into tmp_int from public.payment_notification_outbox
   where email_status is distinct from 'sent';
  m := m || jsonb_build_object('B14', tmp_int::text);
  d := d || jsonb_build_object('B14', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  select count(*) into tmp_int from public.referrals r
   where not exists (select 1 from auth.users u where u.id = r.referrer_id)
      or not exists (select 1 from auth.users u where u.id = r.referred_id);
  m := m || jsonb_build_object('B10', tmp_int::text);
  d := d || jsonb_build_object('B10', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  ----------------------------------------------------------------------------
  -- X1/X2/X3 — the two publication flags disagree, and one of them gates RLS
  ----------------------------------------------------------------------------
  select count(*) into tmp_int from public.tournaments t
   where t.is_published <> exists (
     select 1 from public.publications p where p.tournament_id = t.id and p.is_active);
  m := m || jsonb_build_object('X1', tmp_int::text);
  d := d || jsonb_build_object('X1', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  select count(*) into tmp_int from public.allocations a
   where exists (select 1 from public.publications p where p.tournament_id = a.tournament_id and p.is_active)
     and not exists (select 1 from public.tournaments t where t.id = a.tournament_id and t.is_published);
  m := m || jsonb_build_object('X2', tmp_int::text);
  d := d || jsonb_build_object('X2', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  -- X3/X4 are set from the anon control read below. A grant is not an exposure
  -- until a real read returns rows (BB4); the old X3 measured the anon SELECT
  -- grant on allocations, which is legitimate and permanent and so could never
  -- read CLOSED. If no probe exists both stay UNMEASURED, never CLOSED.

  ----------------------------------------------------------------------------
  -- GTM — what an unauthenticated visitor can find
  ----------------------------------------------------------------------------
  select count(*) into tmp_int from public.tournaments
   where is_published and title ~* '(^|\s)(test|trial|demo|sample|untitled|dummy)';
  m := m || jsonb_build_object('GTM1', tmp_int::text);
  d := d || jsonb_build_object('GTM1', case when tmp_int > 0 then 'OPEN' else 'CLOSED' end);

  select count(*) into tmp_int from public.tournaments where is_published;
  m := m || jsonb_build_object('GTM2', tmp_int::text);
  d := d || jsonb_build_object('GTM2', 'INFO');

  ----------------------------------------------------------------------------
  -- Control test: read as anon against an unpublished tournament that still
  -- carries an active publication row. A grant is not an exposure until a real
  -- read returns rows (AA1: a suspect eliminated without a control is not
  -- eliminated -- and neither is one confirmed).
  ----------------------------------------------------------------------------
  select t.id into probe_id
    from public.tournaments t
   where not t.is_published
     and exists (select 1 from public.publications p where p.tournament_id = t.id)
   order by t.id
   limit 1;   -- deliberately NOT 'and p.is_active': G1 clears that flag, and a
              -- probe predicate the fix dissolves would take this control dark
              -- exactly when it most needs to keep passing.

  if probe_id is not null then
    set local role anon;
    select count(*) into anon_alloc  from public.allocations where tournament_id = probe_id;
    select count(*) into anon_prizes from public.prizes pr
      join public.categories c on c.id = pr.category_id where c.tournament_id = probe_id;
    select count(*) into anon_players from public.players where tournament_id = probe_id;
    select count(*) into anon_tourn   from public.tournaments  where id = probe_id;
    select count(*) into anon_pubs    from public.publications where tournament_id = probe_id;
    reset role;

    m := m || jsonb_build_object('X3', (anon_alloc + anon_prizes)::text);
    d := d || jsonb_build_object('X3', case when (anon_alloc + anon_prizes) > 0 then 'OPEN' else 'CLOSED' end);
    m := m || jsonb_build_object('X4', (anon_tourn + anon_pubs)::text);
    d := d || jsonb_build_object('X4', case when (anon_tourn + anon_pubs) > 0 then 'OPEN' else 'CLOSED' end);
  end if;

  ----------------------------------------------------------------------------
  -- assemble the report
  ----------------------------------------------------------------------------
  for k in select jsonb_object_keys(labels) order by 1 loop
    verdict := d ->> k;
    v       := m ->> k;
    r := r || format(E'\n  %-6s %-8s %-6s  %s', k, verdict, v, labels ->> k);
    if    verdict = 'OPEN'       then n_open       := n_open + 1;
    elsif verdict = 'CLOSED'     then n_closed     := n_closed + 1;
    elsif verdict = 'UNMEASURED' then n_unmeasured := n_unmeasured + 1;
    end if;
  end loop;

  raise exception E'BACKLOG SWEEP\n  key    verdict  value   item%\n\nANON CONTROL TEST on unpublished tournament %:\n  allocations=% prizes=% players=% tournaments=% publications=%\n\nSUMMARY: % OPEN, % CLOSED, % UNMEASURED (UNMEASURED is never CLOSED)',
    r, coalesce(probe_id::text,'none found'), anon_alloc, anon_prizes, anon_players,
    anon_tourn, anon_pubs,
    n_open, n_closed, n_unmeasured;
end $$;
