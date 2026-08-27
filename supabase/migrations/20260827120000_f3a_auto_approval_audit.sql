-- =====================================================================
-- F3-A  payment_auto_approval_audit + record_auto_approval_audit()
--
-- One row per audited F2 auto-approval. Lockdown mirrors
-- payment_invariant_verdicts exactly: RLS on, zero policies, zero client
-- table grants, written only by a master-only SECURITY DEFINER RPC.
--
-- An auto-approval is identified by the entitlement it created
-- (source='auto_upi' AND source_ref=payment.id), NOT by
-- "reviewed_by IS NULL" -- F3-B will overwrite that column.
--
-- Self-verifying, one transaction. Any failure rolls the whole thing back.
-- =====================================================================

begin;

-- SECTION 1 -- PRE-FLIGHT (abort if the database has moved since the audit)
do $preflight$
declare v_n int;
begin
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'payment_auto_approval_audit';
  if v_n <> 0 then raise exception 'PREFLIGHT FAIL: payment_auto_approval_audit already exists'; end if;

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'record_auto_approval_audit';
  if v_n <> 0 then raise exception 'PREFLIGHT FAIL: record_auto_approval_audit already exists (% found)', v_n; end if;

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'is_master' and p.pronargs = 0;
  if v_n <> 1 then raise exception 'PREFLIGHT FAIL: expected exactly 1 zero-arg is_master(), found %', v_n; end if;

  select count(*) into v_n from public.tournament_payments
   where id = '30ba866e-855f-4dc8-b4d5-a2ebb2580df1'
     and status = 'approved'::payment_status and reviewed_by is null;
  if v_n <> 1 then raise exception 'PREFLIGHT FAIL: the known auto-approval is not in the audited state'; end if;

  select count(*) into v_n from public.tournament_entitlements
   where source = 'auto_upi' and source_ref = '30ba866e-855f-4dc8-b4d5-a2ebb2580df1';
  if v_n <> 1 then raise exception 'PREFLIGHT FAIL: expected 1 auto_upi entitlement for it, found %', v_n; end if;

  select count(*) into v_n from public.user_roles ur
   where ur.user_id = '48e9e020-e20b-4db0-9ee9-c9f2367cdab0'
     and ur.role = 'master' and ur.is_verified;
  if v_n <> 1 then raise exception 'PREFLIGHT FAIL: master fixture is not a verified master'; end if;
end;
$preflight$;

-- SECTION 2 -- TABLE
create table public.payment_auto_approval_audit (
  payment_id   uuid primary key references public.tournament_payments(id),
  outcome      text not null check (outcome in ('ok','loophole','uncertain')),
  reason       text not null check (btrim(reason) <> ''),
  action_taken text not null default 'none' check (action_taken in ('none','entitlement_revoked')),
  audited_by   uuid not null,
  audited_at   timestamptz not null default now()
);

comment on table public.payment_auto_approval_audit is
  'F3-A. One row per audited F2 auto-approval. RLS on, zero policies, no client grants. Sole writer is public.record_auto_approval_audit(). The FK to tournament_payments is NO ACTION on purpose: audit evidence must block deletion of the payment it describes, not vanish with it.';

alter table public.payment_auto_approval_audit enable row level security;

revoke all on table public.payment_auto_approval_audit from public;
revoke all on table public.payment_auto_approval_audit from anon;
revoke all on table public.payment_auto_approval_audit from authenticated;

-- SECTION 3 -- RPC
create or replace function public.record_auto_approval_audit(
  p_payment_id   uuid,
  p_outcome      text,
  p_reason       text,
  p_action_taken text default 'none'
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_is_auto boolean;
begin
  if not public.is_master() then raise exception 'not_master'; end if;

  if p_outcome is null or p_outcome not in ('ok','loophole','uncertain') then
    raise exception 'invalid_outcome';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required';
  end if;

  if p_action_taken is null or p_action_taken not in ('none','entitlement_revoked') then
    raise exception 'invalid_action_taken';
  end if;

  select exists (
    select 1 from public.tournament_entitlements te
     where te.source = 'auto_upi' and te.source_ref = p_payment_id
  ) into v_is_auto;

  if not v_is_auto then raise exception 'not_an_auto_approval'; end if;

  insert into public.payment_auto_approval_audit
    (payment_id, outcome, reason, action_taken, audited_by, audited_at)
  values
    (p_payment_id, p_outcome, btrim(p_reason), p_action_taken, auth.uid(), now())
  on conflict (payment_id) do update
    set outcome      = excluded.outcome,
        reason       = excluded.reason,
        action_taken = excluded.action_taken,
        audited_by   = excluded.audited_by,
        audited_at   = excluded.audited_at;
end;
$fn$;

-- D18: both revoke paths, then the single intended grant
revoke all on function public.record_auto_approval_audit(uuid, text, text, text) from public;
revoke all on function public.record_auto_approval_audit(uuid, text, text, text) from anon;
revoke all on function public.record_auto_approval_audit(uuid, text, text, text) from authenticated;
grant execute on function public.record_auto_approval_audit(uuid, text, text, text) to authenticated;

-- SECTION 4 -- STRUCTURAL POST-CHECK
do $post$
declare v_oid oid; v_n int; v_bool boolean;
begin
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'payment_auto_approval_audit' and c.relrowsecurity;
  if v_n <> 1 then raise exception 'POST FAIL: table missing or RLS not enabled'; end if;

  select count(*) into v_n from pg_policy where polrelid = 'public.payment_auto_approval_audit'::regclass;
  if v_n <> 0 then raise exception 'POST FAIL: expected 0 policies, found %', v_n; end if;

  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'payment_auto_approval_audit'
     and grantee in ('anon','authenticated','PUBLIC');
  if v_n <> 0 then raise exception 'POST FAIL: expected 0 client table grants, found %', v_n; end if;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'record_auto_approval_audit';
  if v_oid is null then raise exception 'POST FAIL: RPC not created'; end if;

  select p.prosecdef into v_bool from pg_proc p where p.oid = v_oid;
  if not v_bool then raise exception 'POST FAIL: RPC is not SECURITY DEFINER'; end if;

  -- guardrail N1: privilege proven by OID, never by migration exit code
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'POST FAIL: anon holds EXECUTE on the RPC';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'POST FAIL: authenticated does not hold EXECUTE on the RPC';
  end if;
end;
$post$;

-- SECTION 5 -- BEHAVIOURAL PROOF (real calls, unwound by a sentinel)
do $proof$
declare
  v_master      uuid := '48e9e020-e20b-4db0-9ee9-c9f2367cdab0';
  v_master_mail text := 'chess.tushar@gmail.com';
  v_auto        uuid := '30ba866e-855f-4dc8-b4d5-a2ebb2580df1';
  v_not_auto    uuid;
  v_org         uuid;
  v_org_mail    text;
  v_row         public.payment_auto_approval_audit%rowtype;
  v_n           int;
  r_a text := 'not-run';
  r_b text := 'not-run';
  r_c text := 'not-run';
  r_d text := 'not-run';
begin
  -- fixtures captured OUTSIDE the case bodies, so a capture failure reports distinctly
  select tp.id into v_not_auto from public.tournament_payments tp
   where tp.id <> v_auto order by tp.created_at limit 1;
  if v_not_auto is null then raise exception 'PROOF FAIL: no non-auto-approval payment to test against'; end if;

  select tp.user_id, pr.email into v_org, v_org_mail
    from public.tournament_payments tp
    join public.profiles pr on pr.id = tp.user_id
   where tp.id = v_auto;
  if v_org is null or v_org_mail is null then raise exception 'PROOF FAIL: could not capture the organizer fixture'; end if;

  begin
    -- CASE A: a master records an audit
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', v_master::text, 'role', 'authenticated', 'email', v_master_mail)::text, true);
    execute 'set local role authenticated';
    perform public.record_auto_approval_audit(v_auto, 'ok', 'F3A behavioural proof', 'none');
    execute 'reset role';

    select * into v_row from public.payment_auto_approval_audit where payment_id = v_auto;
    if    v_row.payment_id   is null      then r_a := 'FAIL: no row written';
    elsif v_row.outcome      <> 'ok'      then r_a := 'FAIL: outcome=' || v_row.outcome;
    elsif v_row.audited_by   <> v_master  then r_a := 'FAIL: audited_by mismatch';
    elsif v_row.action_taken <> 'none'    then r_a := 'FAIL: action_taken=' || v_row.action_taken;
    else  r_a := 'pass';
    end if;

    -- CASE B: re-auditing upserts, it does not duplicate
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', v_master::text, 'role', 'authenticated', 'email', v_master_mail)::text, true);
    execute 'set local role authenticated';
    perform public.record_auto_approval_audit(v_auto, 'uncertain', 'F3A re-audit', 'none');
    execute 'reset role';

    select count(*) into v_n from public.payment_auto_approval_audit where payment_id = v_auto;
    select * into v_row from public.payment_auto_approval_audit where payment_id = v_auto;
    if    v_n <> 1                       then r_b := 'FAIL: ' || v_n || ' rows';
    elsif v_row.outcome <> 'uncertain'   then r_b := 'FAIL: outcome not updated';
    else  r_b := 'pass';
    end if;

    -- CASE C: a non-master is refused
    begin
      perform set_config('request.jwt.claims',
        jsonb_build_object('sub', v_org::text, 'role', 'authenticated', 'email', v_org_mail)::text, true);
      execute 'set local role authenticated';
      perform public.record_auto_approval_audit(v_auto, 'ok', 'must not be allowed', 'none');
      r_c := 'FAIL: non-master was allowed to write';
    exception when others then
      if sqlerrm = 'not_master' then r_c := 'pass';
      else r_c := 'FAIL: wrong error ' || sqlerrm; end if;
    end;
    execute 'reset role';

    -- CASE D: a payment that is not an auto-approval is refused
    begin
      perform set_config('request.jwt.claims',
        jsonb_build_object('sub', v_master::text, 'role', 'authenticated', 'email', v_master_mail)::text, true);
      execute 'set local role authenticated';
      perform public.record_auto_approval_audit(v_not_auto, 'ok', 'must not be allowed', 'none');
      r_d := 'FAIL: a non-auto-approval was accepted';
    exception when others then
      if sqlerrm = 'not_an_auto_approval' then r_d := 'pass';
      else r_d := 'FAIL: wrong error ' || sqlerrm; end if;
    end;
    execute 'reset role';

    raise exception 'F3A_PROOF_UNWIND';
  exception when others then
    if sqlerrm <> 'F3A_PROOF_UNWIND' then raise; end if;
  end;

  if r_a <> 'pass' or r_b <> 'pass' or r_c <> 'pass' or r_d <> 'pass' then
    raise exception 'PROOF FAIL: A[%] B[%] C[%] D[%]', r_a, r_b, r_c, r_d;
  end if;
end;
$proof$;

-- SECTION 6 -- LEAK CHECK
do $leak$
declare v_n int;
begin
  select count(*) into v_n from public.payment_auto_approval_audit;
  if v_n <> 0 then raise exception 'LEAK FAIL: audit table must be empty after unwind, found % row(s)', v_n; end if;

  select count(*) into v_n from public.tournament_payments
   where id = '30ba866e-855f-4dc8-b4d5-a2ebb2580df1'
     and status = 'approved'::payment_status and reviewed_by is null;
  if v_n <> 1 then raise exception 'LEAK FAIL: the known auto-approval was mutated'; end if;

  if current_user = 'authenticated' then
    raise exception 'LEAK FAIL: session role was not restored';
  end if;
end;
$leak$;

-- T6: PostgREST must be told the new function exists
notify pgrst, 'reload schema';

commit;

select
  'F3-A applied' as result,
  (select count(*) from public.payment_auto_approval_audit) as audit_rows,
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'payment_auto_approval_audit') as rls_on,
  (select count(*) from pg_policy where polrelid = 'public.payment_auto_approval_audit'::regclass) as policies,
  has_function_privilege('anon', 'public.record_auto_approval_audit(uuid,text,text,text)', 'EXECUTE') as anon_exec,
  has_function_privilege('authenticated', 'public.record_auto_approval_audit(uuid,text,text,text)', 'EXECUTE') as auth_exec;
