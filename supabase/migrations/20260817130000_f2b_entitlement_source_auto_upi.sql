-- ===========================================================================
-- F2-B · tournament_entitlements.source admits 'auto_upi'   [PRD F2-7]
--
-- Mirrors how 'manual_upi' was added. Widening only — every value that was
-- legal before is still legal, so no existing row can be invalidated.
--
-- Nothing writes 'auto_upi' yet. The F2 claim-RPC (step 6) will be the only
-- writer, exactly as review_tournament_payment is the only writer of
-- 'manual_upi'. Guardrail 10 keeps that function untouched.
-- ===========================================================================

begin;

alter table public.tournament_entitlements
  drop constraint tournament_entitlements_source_check;

alter table public.tournament_entitlements
  add constraint tournament_entitlements_source_check
  check (source = any (array['payment','coupon','manual_upi','auto_upi']));

comment on column public.tournament_entitlements.source is
  'How this entitlement was granted. payment (unused) | coupon (redeem_coupon_for_tournament) | manual_upi (review_tournament_payment, master clicked Approve) | auto_upi (F2 conditional auto-approval inside submit_tournament_payment_claim). status=approved AND reviewed_by IS NULL on the paired tournament_payments row is the auto-approval predicate — manual approvals always populate reviewed_by.';

-- ---------------------------------------------------------------------------
-- Self-verification. Any failure aborts the whole migration.
-- ---------------------------------------------------------------------------
do $$
declare
  v_t        uuid;
  v_o        uuid;
  v_before   integer;
  v_after    integer;
  v_coupon   integer;
  v_manual   integer;
begin
  select count(*) into v_before from public.tournament_entitlements;
  select count(*) into v_coupon from public.tournament_entitlements where source='coupon';
  select count(*) into v_manual from public.tournament_entitlements where source='manual_upi';

  if v_before <> 9 or v_coupon <> 6 or v_manual <> 3 then
    raise exception 'F2B FAIL: baseline moved — total=% coupon=% manual=% (expected 9/6/3)',
      v_before, v_coupon, v_manual;
  end if;

  select t.id, t.owner_id into v_t, v_o
  from public.tournaments t
  where t.deleted_at is null and t.owner_id is not null
  limit 1;
  if v_t is null then
    raise exception 'F2B FAIL: no tournament available to test against';
  end if;

  -- POSITIVE: the new value must now be accepted.
  begin
    insert into public.tournament_entitlements
      (tournament_id, owner_id, source, source_ref, starts_at, ends_at)
    values (v_t, v_o, 'auto_upi', gen_random_uuid(), now(), now() + interval '1 day');
  exception when check_violation then
    raise exception 'F2B FAIL: auto_upi was rejected — the widening did not take';
  end;
  delete from public.tournament_entitlements
    where tournament_id = v_t and source = 'auto_upi';

  -- NEGATIVE: an unlisted value must still be refused. D35 — a guard never
  -- observed failing is an assumption, not a check.
  begin
    insert into public.tournament_entitlements
      (tournament_id, owner_id, source, source_ref, starts_at, ends_at)
    values (v_t, v_o, 'free_lunch', gen_random_uuid(), now(), now() + interval '1 day');
    raise exception 'F2B FAIL: constraint accepted an unlisted source value';
  exception when check_violation then null;
  end;

  -- NEGATIVE: the pre-existing values must still be accepted.
  begin
    insert into public.tournament_entitlements
      (tournament_id, owner_id, source, source_ref, starts_at, ends_at)
    values (v_t, v_o, 'manual_upi', gen_random_uuid(), now(), now() + interval '1 day');
  exception when check_violation then
    raise exception 'F2B FAIL: manual_upi is no longer accepted — widening broke an old value';
  end;
  delete from public.tournament_entitlements
    where tournament_id = v_t and source = 'manual_upi'
      and created_at > now() - interval '1 minute';

  select count(*) into v_after from public.tournament_entitlements;
  if v_after <> v_before then
    raise exception 'F2B FAIL: residue — % rows before, % after', v_before, v_after;
  end if;
end $$;

select 'F2B OK' as result;

commit;
