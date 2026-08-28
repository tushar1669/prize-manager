-- =====================================================================
-- F3-C0 harness - list_auto_approvals()
-- Run: supabase db query --linked -f supabase/tests/f3c_read_checks.sql
-- Pass condition: "13 passed, 0 failed" inside an ERROR:.
-- One self-aborting statement. Everything rolls back, including the
-- deliberate write in V12/V13.
--
-- MATCHED PAIRS - keep them together:
--   V4/V5   master served / non-master refused. Without V4, V5 would
--           pass even if the function raised unconditionally.
--   V2/V6   anon lacks the grant / the grant layer actually refuses.
--   V12/V13 X1: the entitlement predicate survives a reviewed_by stamp,
--           and the naive reviewed_by IS NULL predicate does not.
-- =====================================================================
do $v$
declare
  v_oid oid; v_secdef boolean; v_config text; v_nargs int;
  v_master uuid; v_master_email text;
  v_other uuid;  v_other_email text;
  v_json jsonb; v_expected int; v_sample uuid;
  v_err text; v_state text; v_n int;
  v_audit_before int; v_ent_before int; v_pay_before int;
  v_pass int := 0; v_fail int := 0; v_out text := ''; v_ok boolean;
begin
  -- ---------- CAPTURE FIRST (never inside a case body) ----------
  select ur.user_id, p.email into v_master, v_master_email
    from user_roles ur join profiles p on p.id = ur.user_id
   where ur.role = 'master' and ur.is_verified = true
   order by ur.user_id limit 1;
  if v_master is null then raise exception 'SETUP: no verified master account'; end if;

  select p.id, p.email into v_other, v_other_email
    from profiles p
   where p.id not in (select user_id from user_roles where role = 'master')
     and p.email is not null
   order by p.id limit 1;
  if v_other is null then raise exception 'SETUP: no non-master account'; end if;

  select count(distinct te.source_ref) into v_expected
    from tournament_entitlements te join tournament_payments tp on tp.id = te.source_ref
   where te.source = 'auto_upi';

  select te.source_ref into v_sample
    from tournament_entitlements te join tournament_payments tp on tp.id = te.source_ref
   where te.source = 'auto_upi' order by te.starts_at desc limit 1;

  select count(*) into v_audit_before from payment_auto_approval_audit;
  select count(*) into v_ent_before   from tournament_entitlements;
  select count(*) into v_pay_before   from tournament_payments;

  select p.oid, p.prosecdef, coalesce(p.proconfig::text,''), p.pronargs
    into v_oid, v_secdef, v_config, v_nargs
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'list_auto_approvals';

  -- V1
  v_ok := v_oid is not null and v_nargs = 0 and v_secdef and v_config like '%search_path=public%';
  if v_ok then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  v_out := v_out || format('  V1  zero-arg, SECURITY DEFINER, search_path pinned  | %s%s',
                           case when v_ok then 'pass' else 'FAIL' end, chr(10));

  -- V2 (control for V6)
  v_ok := (not has_function_privilege('anon', v_oid, 'EXECUTE'))
          and has_function_privilege('authenticated', v_oid, 'EXECUTE')
          and not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                           where p.oid = v_oid and a.grantee = 0 and a.privilege_type = 'EXECUTE');
  if v_ok then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  v_out := v_out || format('  V2  anon+PUBLIC no EXECUTE, authenticated yes      | %s%s',
                           case when v_ok then 'pass' else 'FAIL' end, chr(10));

  -- V3
  v_ok := (select count(*) from pg_policies where schemaname = 'public'
             and tablename in ('payment_auto_approval_audit','payment_invariant_verdicts')) = 0
          and not has_table_privilege('authenticated','public.payment_auto_approval_audit','SELECT')
          and not has_table_privilege('authenticated','public.payment_invariant_verdicts','SELECT')
          and not has_table_privilege('anon','public.payment_auto_approval_audit','SELECT')
          and not has_table_privilege('anon','public.payment_invariant_verdicts','SELECT');
  if v_ok then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  v_out := v_out || format('  V3  locked tables untouched (0 policies, 0 grants) | %s%s',
                           case when v_ok then 'pass' else 'FAIL' end, chr(10));

  -- V4 CONTROL for V5
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_master_email)::text, true);
  begin v_json := public.list_auto_approvals(); v_err := null;
  exception when others then v_err := sqlerrm; v_json := null; end;
  execute 'reset role';
  v_ok := v_err is null and jsonb_typeof(v_json) = 'array' and jsonb_array_length(v_json) = v_expected;
  if v_ok then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  v_out := v_out || format('  V4  CONTROL master served, %s row(s)               | %s%s',
                           coalesce(jsonb_array_length(v_json),-1),
                           case when v_ok then 'pass' else 'FAIL '||coalesce(v_err,'') end, chr(10));

  -- V5
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v_other::text,'role','authenticated','email',v_other_email)::text, true);
  begin perform public.list_auto_approvals(); v_err := '(served)';
  exception when others then v_err := sqlerrm; end;
  execute 'reset role';
  v_ok := v_err = 'not_master';
  if v_ok then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  v_out := v_out || format('  V5  non-master refused with exactly not_master     | %s%s',
                           case when v_ok then 'pass' else 'FAIL (got '||v_err||')' end, chr(10));

  -- V6
  execute 'set local role anon';
  begin perform public.list_auto_approvals(); v_state := '(served)';
  exception when others then get stacked diagnostics v_state = returned_sqlstate; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', NULL, true);
  v_ok := v_state = '42501';
  if v_ok then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  v_out := v_out || format('  V6  anon refused at grant layer (42501)            | %s%s',
                           case when v_ok then 'pass' else 'FAIL (got '||v_state||')' end, chr(10));

  -- V7
  v_ok := not exists (
    select 1 from jsonb_array_elements(v_json) r
      join tournament_payments tp on tp.id = (r->>'payment_id')::uuid
     where (r->>'pro_still_active')::boolean is distinct from (exists (
             select 1 from tournament_entitlements te
              where te.tournament_id = tp.tournament_id and te.owner_id = tp.user_id
                and now() >= te.starts_at and now() < te.ends_at)));
  if v_ok then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  v_out := v_out || format('  V7  pro_still_active matches revoke predicate (X4) | %s%s',
                           case when v_ok then 'pass' else 'FAIL' end, chr(10));

  -- V8
  v_ok := not exists (select 1 from jsonb_array_elements(v_json) r where (r->>'entitlement_id') is null)
          and not exists (select 1 from jsonb_array_elements(v_json) r
                           where (r->>'auto_entitlement_count')::int <> 1);
  if v_ok then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  v_out := v_out || format('  V8  every row carries exactly 1 auto entitlement   | %s%s',
                           case when v_ok then 'pass' else 'FAIL' end, chr(10));

  -- V9
  v_ok := not exists (
    select 1 from jsonb_array_elements(v_json) r,
      unnest(array['payment_id','tournament_id','tournament_title','user_id','organizer_email',
                   'amount_inr','utr','payment_status','created_at','reviewed_by','reviewed_at',
                   'review_note','screenshot_extraction_id','file_hash','entitlement_id',
                   'entitlement_starts_at','entitlement_ends_at','entitlement_active',
                   'auto_entitlement_count','pro_still_active','active_sources',
                                      'checker_version','verdicts','audit','file_path','file_name']) k
     where not (r ? k));
  if v_ok then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  v_out := v_out || format('  V9  all 26 contract keys present on every row      | %s%s',
                           case when v_ok then 'pass' else 'FAIL' end, chr(10));

  -- V10
  v_ok := not exists (
    select 1 from jsonb_array_elements(v_json) r
     where jsonb_typeof(r->'verdicts') = 'object'
       and ((r->'verdicts') - array['utr_format','utr_duplicate','amount_mismatch',
             'payee_vpa_mismatch','payee_vpa_missing','date_stale',
             'direction_not_outgoing','required_fields_missing']) <> '{}'::jsonb);
  if v_ok then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  v_out := v_out || format('  V10 verdicts hold exactly the 8 named invariants   | %s%s',
                           case when v_ok then 'pass' else 'FAIL' end, chr(10));

  -- V11
  v_ok := (select count(*) from payment_auto_approval_audit) = v_audit_before
          and (select count(*) from tournament_entitlements) = v_ent_before
          and (select count(*) from tournament_payments)     = v_pay_before;
  if v_ok then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  v_out := v_out || format('  V11 the read path wrote nothing                    | %s%s',
                           case when v_ok then 'pass' else 'FAIL' end, chr(10));

  -- ---------- X1 PROOF: stamp reviewed_by, then diverge the predicates ----------
  -- This is what revoke_auto_entitlement does. status is NOT touched, so the
  -- AFTER UPDATE OF status trigger cannot fire. Rolled back with everything else.
  update tournament_payments set reviewed_by = v_master where id = v_sample;

  -- V12
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_master_email)::text, true);
  begin v_json := public.list_auto_approvals(); v_err := null;
  exception when others then v_err := sqlerrm; v_json := null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', NULL, true);
  v_ok := v_err is null and jsonb_array_length(v_json) = v_expected
          and exists (select 1 from jsonb_array_elements(v_json) r
                       where (r->>'payment_id')::uuid = v_sample);
  if v_ok then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  v_out := v_out || format('  V12 X1 survives a reviewed_by stamp               | %s%s',
                           case when v_ok then 'pass' else 'FAIL' end, chr(10));

  -- V13 CONTROL: the naive predicate loses the row it most needs to show
  select count(*) into v_n from tournament_payments tp
   where tp.id = v_sample and tp.status = 'approved' and tp.reviewed_by is null;
  v_ok := v_n = 0;
  if v_ok then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  v_out := v_out || format('  V13 CONTROL reviewed_by IS NULL now finds 0        | %s%s',
                           case when v_ok then 'pass' else 'FAIL' end, chr(10));

  raise exception E'F3-C0 READ HARNESS RESULTS: % passed, % failed\n\n%\n(This error is expected. Everything was rolled back.)',
    v_pass, v_fail, v_out;
end
$v$;
