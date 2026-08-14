-- Client write-grant audit, Step 1 (D38).
--
-- public.issue_referral_rewards(uuid, uuid) is SECURITY DEFINER, takes the
-- beneficiary-chain root AND the idempotency key as caller-supplied parameters,
-- and never calls auth.uid(). trigger_tournament_id has no foreign key, so every
-- random UUID is a fresh idempotency slot.
--
-- Proven 14 Aug 2026 as 753b536b (a real non-master organizer) in a rolled-back
-- block: three calls minted three fresh REF1-* coupons, each 100% off
-- tournament_pro, issued to the caller. Unbounded. redeem_coupon_for_tournament
-- then computes amount_after = 0 and inserts an entitlement -- the same terminal
-- impact as the profiles hole F1 closed, reachable with one RPC call and no
-- table write at all.
--
-- The only legitimate callers are review_tournament_payment and
-- redeem_coupon_for_tournament. Both are SECURITY DEFINER and both are owned by
-- postgres, the same owner as this function, so their nested calls execute with
-- postgres privileges and are unaffected by this revoke.
--
-- No client, edge function, or test references this function; it appears in the
-- repo only in generated types.ts and in the migrations that define it.
--
-- service_role deliberately RETAINS execute: server-only key, unreachable from
-- any client, and no live path depends on removing it.
--
-- N1 / D18: all three grant paths are independent. The current ACL is
--   =X/postgres | postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
-- The leading "=X/postgres" is the PUBLIC grant. Revoking only the named roles
-- leaves has_function_privilege('anon', oid, 'EXECUTE') returning true.

revoke execute on function public.issue_referral_rewards(uuid, uuid) from public;
revoke execute on function public.issue_referral_rewards(uuid, uuid) from anon;
revoke execute on function public.issue_referral_rewards(uuid, uuid) from authenticated;

-- Self-verify: fail the migration rather than report success on a partial revoke.
do $$
declare
  v_oid oid;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'issue_referral_rewards';

  if v_oid is null then
    raise exception 'issue_referral_rewards not found -- signature changed?';
  end if;

  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'REVOKE INCOMPLETE: anon still holds EXECUTE';
  end if;

  if has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'REVOKE INCOMPLETE: authenticated still holds EXECUTE';
  end if;

  if not has_function_privilege('postgres', v_oid, 'EXECUTE') then
    raise exception 'BROKE SERVER PATH: postgres lost EXECUTE';
  end if;

  raise notice 'OK: anon=false authenticated=false postgres=true';
end $$;
