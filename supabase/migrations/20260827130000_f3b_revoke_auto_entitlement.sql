-- =====================================================================
-- F3-B  revoke_auto_entitlement(payment_id, reason)
--
-- Ends an auto-approval's entitlement window instead of deleting it, so
-- the evidence survives. Deliberately does NOT change payment.status:
--   * no AFTER UPDATE OF status trigger fires -> the organizer is not emailed
--   * uq_tournament_payments_utr_active (WHERE status <> 'rejected') keeps
--     the UTR blocked; rejecting would hand it straight back
--   * the F2-3 file_hash invariant keeps the screenshot blocked
--   * review_tournament_payment raises PAYMENT_ALREADY_REVIEWED on any
--     status other than 'pending', so there is no re-approval path
--
-- Writes its own audit row, so revocation without a recorded reason is
-- impossible by construction.
--
-- Self-verifying, one transaction. Any failure rolls the whole thing back.
-- =====================================================================

begin;

-- SECTION 1 -- PRE-FLIGHT
do $preflight$
declare v_n int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='revoke_auto_entitlement';
  if v_n <> 0 then raise exception 'PREFLIGHT FAIL: revoke_auto_entitlement already exists'; end if;

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='record_auto_approval_audit';
  if v_n <> 1 then raise exception 'PREFLIGHT FAIL: F3-A RPC missing (found %)', v_n; end if;

  select count(*) into v_n from public.payment_auto_approval_audit;
  if v_n <> 0 then raise exception 'PREFLIGHT FAIL: audit table should be empty, found %', v_n; end if;

  -- the CHECK this function must not trip
  select count(*) into v_n from pg_constraint
   where conrelid='public.tournament_entitlements'::regclass
     and conname='tournament_entitlements_window_valid';
  if v_n <> 1 then raise exception 'PREFLIGHT FAIL: starts_at<ends_at CHECK not found'; end if;

  select count(*) into v_n from public.tournament_payments
   where id='30ba866e-855f-4dc8-b4d5-a2ebb2580df1'
     and status='approved'::payment_status and reviewed_by is null;
  if v_n <> 1 then raise exception 'PREFLIGHT FAIL: known auto-approval not in audited state'; end if;

  select count(*) into v_n from public.tournament_entitlements
   where source='auto_upi' and source_ref='30ba866e-855f-4dc8-b4d5-a2ebb2580df1' and now() < ends_at;
  if v_n <> 1 then raise exception 'PREFLIGHT FAIL: its entitlement is not currently active'; end if;
end;
$preflight$;

-- SECTION 2 -- RPC
create or replace function public.revoke_auto_entitlement(
  p_payment_id uuid,
  p_reason     text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_now       timestamptz := now();
  v_payment   record;
  v_ended     int := 0;
  v_new_ends  timestamptz;
  v_still_pro boolean;
  v_sources   text[];
begin
  if not public.is_master() then raise exception 'not_master'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'reason_required'; end if;

  select * into v_payment from public.tournament_payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;

  if not exists (
    select 1 from public.tournament_entitlements te
     where te.source='auto_upi' and te.source_ref = p_payment_id
  ) then
    raise exception 'not_an_auto_approval';
  end if;

  -- greatest(...) keeps starts_at < ends_at satisfied when the entitlement
  -- was created in this same transaction; now() is transaction-stable, so a
  -- plain ends_at = now() would violate the CHECK on a fresh row.
  update public.tournament_entitlements te
     set ends_at = greatest(v_now, te.starts_at + interval '1 second')
   where te.source='auto_upi' and te.source_ref = p_payment_id
     and te.ends_at > v_now;
  get diagnostics v_ended = row_count;

  select min(te.ends_at) into v_new_ends
    from public.tournament_entitlements te
   where te.source='auto_upi' and te.source_ref = p_payment_id;

  update public.tournament_payments
     set reviewed_by = auth.uid(),
         reviewed_at = v_now,
         review_note = left('Revoked: ' || btrim(p_reason), 2000)
   where id = p_payment_id;

  -- Entitlements can stack: answer honestly whether Pro actually went away.
  select exists (
    select 1 from public.tournament_entitlements te
     where te.tournament_id = v_payment.tournament_id
       and te.owner_id = v_payment.user_id
       and v_now >= te.starts_at and v_now < te.ends_at
  ) into v_still_pro;

  select coalesce(array_agg(distinct te.source order by te.source), '{}')
    into v_sources
    from public.tournament_entitlements te
   where te.tournament_id = v_payment.tournament_id
     and te.owner_id = v_payment.user_id
     and v_now >= te.starts_at and v_now < te.ends_at;

  perform public.record_auto_approval_audit(
    p_payment_id, 'loophole', btrim(p_reason), 'entitlement_revoked');

  return jsonb_build_object(
    'payment_id',         p_payment_id,
    'entitlements_ended', v_ended,
    'ends_at',            v_new_ends,
    'pro_still_active',   v_still_pro,
    'active_sources',     to_jsonb(v_sources),
    'payment_status',     v_payment.status::text,
    'organizer_emailed',  false
  );
end;
$fn$;

revoke all on function public.revoke_auto_entitlement(uuid, text) from public;
revoke all on function public.revoke_auto_entitlement(uuid, text) from anon;
revoke all on function public.revoke_auto_entitlement(uuid, text) from authenticated;
grant execute on function public.revoke_auto_entitlement(uuid, text) to authenticated;

-- SECTION 3 -- STRUCTURAL POST-CHECK
do $post$
declare v_oid oid; v_bool boolean;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='revoke_auto_entitlement';
  if v_oid is null then raise exception 'POST FAIL: RPC not created'; end if;

  select prosecdef into v_bool from pg_proc where oid=v_oid;
  if not v_bool then raise exception 'POST FAIL: not SECURITY DEFINER'; end if;

  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'POST FAIL: anon holds EXECUTE';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'POST FAIL: authenticated lacks EXECUTE';
  end if;
end;
$post$;

-- SECTION 4 -- BEHAVIOURAL PROOF
do $proof$
declare
  v_master uuid := '48e9e020-e20b-4db0-9ee9-c9f2367cdab0';
  v_mmail  text := 'chess.tushar@gmail.com';
  v_auto   uuid := '30ba866e-855f-4dc8-b4d5-a2ebb2580df1';
  v_org uuid; v_omail text; v_tid uuid; v_uid uuid;
  v_res jsonb; v_tmp uuid; v_n int; v_pay record; v_aud record;
  r_a text:='not-run'; r_b text:='not-run'; r_c text:='not-run';
  r_d text:='not-run'; r_e text:='not-run'; r_f text:='not-run';
begin
  select tp.user_id, pr.email, tp.tournament_id
    into v_org, v_omail, v_tid
    from public.tournament_payments tp join public.profiles pr on pr.id=tp.user_id
   where tp.id = v_auto;
  if v_org is null or v_omail is null then raise exception 'PROOF FAIL: organizer capture'; end if;
  v_uid := v_org;

  begin
    -- CASE A: non-master refused
    begin
      perform set_config('request.jwt.claims', jsonb_build_object('sub',v_org::text,'role','authenticated','email',v_omail)::text, true);
      execute 'set local role authenticated';
      perform public.revoke_auto_entitlement(v_auto, 'must not work');
      r_a := 'FAIL: non-master revoked';
    exception when others then
      r_a := case when sqlerrm='not_master' then 'pass' else 'FAIL: '||sqlerrm end;
    end;
    execute 'reset role';

    -- CASE B: master revokes the real auto-approval
    perform set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
    execute 'set local role authenticated';
    v_res := public.revoke_auto_entitlement(v_auto, 'F3B behavioural proof');
    execute 'reset role';

    select * into v_pay from public.tournament_payments where id=v_auto;
    select * into v_aud from public.payment_auto_approval_audit where payment_id=v_auto;
    if    (v_res->>'entitlements_ended')::int <> 1 then r_b := 'FAIL: ended='||(v_res->>'entitlements_ended');
    elsif (v_res->>'pro_still_active')::boolean   then r_b := 'FAIL: pro still active';
    elsif v_pay.status::text <> 'approved'        then r_b := 'FAIL: status changed to '||v_pay.status::text;
    elsif v_pay.reviewed_by <> v_master           then r_b := 'FAIL: reviewed_by not stamped';
    elsif v_pay.review_note not like 'Revoked:%'  then r_b := 'FAIL: review_note='||coalesce(v_pay.review_note,'(null)');
    elsif v_aud.outcome <> 'loophole'             then r_b := 'FAIL: audit outcome';
    elsif v_aud.action_taken <> 'entitlement_revoked' then r_b := 'FAIL: audit action_taken';
    else  r_b := 'pass';
    end if;

    -- CASE C: the organizer is NOT emailed (no new outbox row)
    select count(*) into v_n from public.payment_notification_outbox where payment_id=v_auto;
    if v_n <> 2 then r_c := 'FAIL: outbox rows='||v_n||' (expected the original 2)';
    else r_c := 'pass'; end if;

    -- CASE D: no active entitlement remains for this tournament+owner
    select count(*) into v_n from public.tournament_entitlements te
     where te.tournament_id=v_tid and te.owner_id=v_uid
       and now() >= te.starts_at and now() < te.ends_at;
    r_d := case when v_n = 0 then 'pass' else 'FAIL: '||v_n||' still active' end;

    -- CASE E: second revoke is idempotent, not an error
    begin
      perform set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
      execute 'set local role authenticated';
      v_res := public.revoke_auto_entitlement(v_auto, 'F3B second call');
      execute 'reset role';
      r_e := case when (v_res->>'entitlements_ended')::int = 0 then 'pass'
                  else 'FAIL: ended='||(v_res->>'entitlements_ended') end;
    exception when others then r_e := 'FAIL: '||sqlerrm;
    end;
    execute 'reset role';

    -- CASE F: same-instant entitlement must not trip starts_at < ends_at.
    -- Without greatest(...) this case fails with a CHECK violation.
    begin
      insert into public.tournament_payments (tournament_id, user_id, amount_inr, utr, status)
      values (v_tid, v_uid, 500, 'F3BPROBE'||floor(random()*1000000)::text, 'approved'::payment_status)
      returning id into v_tmp;

      insert into public.tournament_entitlements (tournament_id, owner_id, source, source_ref, starts_at, ends_at)
      values (v_tid, v_uid, 'auto_upi', v_tmp, now(), now() + interval '365 days');

      perform set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
      execute 'set local role authenticated';
      v_res := public.revoke_auto_entitlement(v_tmp, 'F3B same-instant fixture');
      execute 'reset role';
      r_f := case when (v_res->>'entitlements_ended')::int = 1 then 'pass'
                  else 'FAIL: ended='||(v_res->>'entitlements_ended') end;
    exception when others then r_f := 'FAIL: '||sqlstate||' '||sqlerrm;
    end;
    execute 'reset role';

    raise exception 'F3B_PROOF_UNWIND';
  exception when others then
    if sqlerrm <> 'F3B_PROOF_UNWIND' then raise; end if;
  end;

  if r_a<>'pass' or r_b<>'pass' or r_c<>'pass' or r_d<>'pass' or r_e<>'pass' or r_f<>'pass' then
    raise exception 'PROOF FAIL: A[%] B[%] C[%] D[%] E[%] F[%]', r_a,r_b,r_c,r_d,r_e,r_f;
  end if;
end;
$proof$;

-- SECTION 5 -- LEAK CHECK
do $leak$
declare v_n int;
begin
  select count(*) into v_n from public.payment_auto_approval_audit;
  if v_n <> 0 then raise exception 'LEAK FAIL: audit rows=%', v_n; end if;

  select count(*) into v_n from public.tournament_payments;
  if v_n <> 11 then raise exception 'LEAK FAIL: payments=% (expected 11)', v_n; end if;

  select count(*) into v_n from public.tournament_payments
   where id='30ba866e-855f-4dc8-b4d5-a2ebb2580df1'
     and status='approved'::payment_status and reviewed_by is null
     and review_note='Auto-approved.';
  if v_n <> 1 then raise exception 'LEAK FAIL: the auto-approval was mutated'; end if;

  select count(*) into v_n from public.tournament_entitlements
   where source='auto_upi' and source_ref='30ba866e-855f-4dc8-b4d5-a2ebb2580df1' and now() < ends_at;
  if v_n <> 1 then raise exception 'LEAK FAIL: Pro was really revoked'; end if;

  select count(*) into v_n from public.payment_notification_outbox
   where payment_id='30ba866e-855f-4dc8-b4d5-a2ebb2580df1';
  if v_n <> 2 then raise exception 'LEAK FAIL: outbox rows=% (expected 2)', v_n; end if;
end;
$leak$;

notify pgrst, 'reload schema';

commit;

select
  'F3-B applied' as result,
  (select count(*) from public.payment_auto_approval_audit) as audit_rows,
  (select count(*) from public.tournament_payments) as payments,
  (select count(*) from public.tournament_entitlements
    where source='auto_upi' and source_ref='30ba866e-855f-4dc8-b4d5-a2ebb2580df1'
      and now() < ends_at) as pro_still_active,
  has_function_privilege('anon','public.revoke_auto_entitlement(uuid,text)','EXECUTE') as anon_exec,
  has_function_privilege('authenticated','public.revoke_auto_entitlement(uuid,text)','EXECUTE') as auth_exec;
