-- 20260909120000_coupon_origin_fix.sql
--
-- Coupon origin fix. MIGRATION ONLY — no src/ changes, no change to any
-- function's behaviour beyond the one mapping added below.
--
-- Defect: public.coupon_origin_from_code() has no 'WELCOME-%' branch, so every
-- welcome coupon fell through to the else-arm and was stamped origin='admin'.
-- 32 rows are mis-attributed. origin is free text, so nothing stopped it.
--
-- This migration:
--   1. adds the 'WELCOME-%' -> 'welcome' branch to coupon_origin_from_code
--   2. backfills the 32 affected rows
--   3. adds a CHECK constraint pinning origin to the six legal values, NOT NULL
--      included (safe: tg_coupons_set_snapshot is SECURITY DEFINER owned by
--      postgres and fills origin on every insert, so it loses nothing to D18)
--
-- Touches ONLY public.coupons.origin. No coupon is issued, deleted, or otherwise
-- modified. The allocation engine is not read and not written (CLAUDE.md).
--
-- Trigger review (CC1) — triggers on public.coupons:
--   trg_coupons_set_snapshot  BEFORE INSERT only  -> does NOT fire on this UPDATE
--   normalize_coupon_code     BEFORE INSERT OR UPDATE -> DOES fire; it runs
--                             code := upper(trim(code)). Post-check 5 proves it
--                             rewrote nothing.
--   update_coupons_updated_at BEFORE UPDATE -> bumps updated_at on the 32 rows.
--                             Expected and accepted; excluded from checksums.

begin;

-- ---------------------------------------------------------------------------
-- Pre-flight: assert the audited state, and capture the baseline checksums.
-- ---------------------------------------------------------------------------
create temp table _coupon_origin_preflight (
  k text primary key,
  v text not null
) on commit drop;

do $do$
declare
  v_total       int;
  v_welcome     int;
  v_welcome_ci  int;
  v_admin       int;
  v_null        int;
begin
  select count(*) into v_total      from public.coupons;
  select count(*) into v_welcome    from public.coupons where code like  'WELCOME-%';
  select count(*) into v_welcome_ci from public.coupons where code ilike 'WELCOME-%';
  select count(*) into v_admin      from public.coupons where origin = 'admin';

  if v_total <> 48 then
    raise exception 'PRE-FLIGHT FAIL: expected 48 coupons, found %', v_total;
  end if;

  if v_welcome <> 32 then
    raise exception 'PRE-FLIGHT FAIL: expected 32 codes LIKE ''WELCOME-%%'', found %', v_welcome;
  end if;

  -- The function matches case-insensitively (ilike) but the backfill below is
  -- case-sensitive (like). If those two populations ever diverge, a lowercase
  -- 'welcome-' code would be silently skipped by the backfill. Refuse to run.
  if v_welcome_ci <> v_welcome then
    raise exception 'PRE-FLIGHT FAIL: ILIKE WELCOME-%% (%) <> LIKE WELCOME-%% (%); case-variant code present', v_welcome_ci, v_welcome;
  end if;

  if v_admin <> 41 then
    raise exception 'PRE-FLIGHT FAIL: expected 41 rows origin=''admin'', found %', v_admin;
  end if;

  -- origin is a nullable column. The constraint below forbids NULL, so a NULL
  -- present at this point would abort the migration late, after the backfill.
  -- Catch it here instead.
  select count(*) into v_null from public.coupons where origin is null;
  if v_null <> 0 then
    raise exception 'PRE-FLIGHT FAIL: expected 0 NULL origins, found %', v_null;
  end if;

  -- Baseline: every column except origin (intended to change) and updated_at
  -- (bumped by set_updated_at). Any drift here means we moved more than origin.
  insert into _coupon_origin_preflight(k, v)
  select 'payload_md5', md5(string_agg(x, '|' order by x))
  from (
    select (c.id, c.code, c.discount_type, c.discount_value, c.starts_at, c.ends_at,
            c.max_redemptions, c.max_redemptions_per_user, c.is_active, c.created_by,
            c.created_at, c.issued_to_email, c.issued_to_user_id, c.applies_to)::text as x
    from public.coupons c
  ) s;

  insert into _coupon_origin_preflight(k, v)
  select 'codes_md5', md5(string_agg(c.code, '|' order by c.code))
  from public.coupons c;
end
$do$;

-- ---------------------------------------------------------------------------
-- 1. Fix the derivation function.
--    Sole change: the 'WELCOME-%' branch. Signature, language, volatility,
--    search_path and every other branch are reproduced exactly as live.
-- ---------------------------------------------------------------------------
create or replace function public.coupon_origin_from_code(code text)
returns text
language sql
immutable
set search_path to 'public'
as $fn$
  select case
    when code ilike 'WELCOME-%' then 'welcome'
    when code ilike 'PROFILE-%' then 'profile_reward'
    when code ilike 'REF1-%' then 'referral_l1'
    when code ilike 'REF2-%' then 'referral_l2'
    when code ilike 'REF3-%' then 'referral_l3'
    else 'admin'
  end;
$fn$;

-- D18 — function grant hygiene: both revoke paths, always.
revoke all on function public.coupon_origin_from_code(text) from public;
revoke all on function public.coupon_origin_from_code(text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Backfill the 32 mis-attributed rows. Exactly 32, or abort.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_rows int;
begin
  update public.coupons
     set origin = 'welcome'
   where code like 'WELCOME-%';

  get diagnostics v_rows = row_count;

  if v_rows <> 32 then
    raise exception 'BACKFILL FAIL: expected 32 rows updated, got %', v_rows;
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- 3. Constraint — applied AFTER the backfill. Named the offenders first so the
--    failure is readable, then let ADD CONSTRAINT validate for real.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_bad text;
begin
  select string_agg(distinct coalesce(origin, '<null>'), ', ')
    into v_bad
  from public.coupons
  where origin is null
     or origin not in ('welcome','profile_reward','referral_l1','referral_l2','referral_l3','admin');

  if v_bad is not null then
    raise exception 'CONSTRAINT PRE-CHECK FAIL: illegal origin value(s) present: %', v_bad;
  end if;
end
$do$;

alter table public.coupons
  add constraint coupons_origin_check
  check (origin is not null and origin in ('welcome','profile_reward','referral_l1','referral_l2','referral_l3','admin'));

-- ---------------------------------------------------------------------------
-- Post-checks. RAISE EXCEPTION only — RAISE NOTICE is silently swallowed.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_total    int;
  v_welcome  int;
  v_admin    int;
  v_stragglers int;
  v_payload  text;
  v_codes    text;
  v_conval   boolean;
begin
  -- 1. the 32 rows landed on 'welcome'
  select count(*) into v_welcome from public.coupons where origin = 'welcome';
  if v_welcome <> 32 then
    raise exception 'POST-CHECK 1 FAIL: expected 32 rows origin=''welcome'', found %', v_welcome;
  end if;

  -- 2. no WELCOME- code left on any other origin
  select count(*) into v_stragglers
  from public.coupons where code like 'WELCOME-%' and origin is distinct from 'welcome';
  if v_stragglers <> 0 then
    raise exception 'POST-CHECK 2 FAIL: % WELCOME- rows not on origin=''welcome''', v_stragglers;
  end if;

  -- 3. admin fell 41 -> 9, i.e. the genuinely admin-issued rows and no others
  select count(*) into v_admin from public.coupons where origin = 'admin';
  if v_admin <> 9 then
    raise exception 'POST-CHECK 3 FAIL: expected 9 rows origin=''admin'', found %', v_admin;
  end if;

  -- 4. no coupon created or destroyed
  select count(*) into v_total from public.coupons;
  if v_total <> 48 then
    raise exception 'POST-CHECK 4 FAIL: coupon count moved to %, expected 48', v_total;
  end if;

  -- 5. normalize_coupon_code rewrote no code on the way through
  select md5(string_agg(c.code, '|' order by c.code)) into v_codes from public.coupons c;
  if v_codes is distinct from (select v from _coupon_origin_preflight where k = 'codes_md5') then
    raise exception 'POST-CHECK 5 FAIL: coupon codes changed (normalize_coupon_code rewrote a code)';
  end if;

  -- 6. nothing but origin moved: discount, window, redemption caps, assignee
  select md5(string_agg(x, '|' order by x)) into v_payload
  from (
    select (c.id, c.code, c.discount_type, c.discount_value, c.starts_at, c.ends_at,
            c.max_redemptions, c.max_redemptions_per_user, c.is_active, c.created_by,
            c.created_at, c.issued_to_email, c.issued_to_user_id, c.applies_to)::text as x
    from public.coupons c
  ) s;
  if v_payload is distinct from (select v from _coupon_origin_preflight where k = 'payload_md5') then
    raise exception 'POST-CHECK 6 FAIL: a non-origin coupon column changed';
  end if;

  -- 7. the constraint exists and is validated (not NOT VALID)
  select c.convalidated into v_conval
  from pg_constraint c
  where c.conrelid = 'public.coupons'::regclass and c.conname = 'coupons_origin_check';
  if v_conval is not true then
    raise exception 'POST-CHECK 7 FAIL: coupons_origin_check missing or not validated';
  end if;

  -- 8. matched pairs on the replaced function: the new branch resolves AND every
  --    pre-existing branch is untouched. Only a correct replacement passes all six.
  if public.coupon_origin_from_code('WELCOME-ABCD') <> 'welcome'        then raise exception 'POST-CHECK 8 FAIL: WELCOME- did not map to welcome'; end if;
  if public.coupon_origin_from_code('PROFILE-ABCD') <> 'profile_reward' then raise exception 'POST-CHECK 8 FAIL: PROFILE- branch regressed'; end if;
  if public.coupon_origin_from_code('REF1-ABCD')    <> 'referral_l1'    then raise exception 'POST-CHECK 8 FAIL: REF1- branch regressed'; end if;
  if public.coupon_origin_from_code('REF2-ABCD')    <> 'referral_l2'    then raise exception 'POST-CHECK 8 FAIL: REF2- branch regressed'; end if;
  if public.coupon_origin_from_code('REF3-ABCD')    <> 'referral_l3'    then raise exception 'POST-CHECK 8 FAIL: REF3- branch regressed'; end if;
  if public.coupon_origin_from_code('TRIALERROR')   <> 'admin'          then raise exception 'POST-CHECK 8 FAIL: else-arm regressed'; end if;

  -- 9. D18 both revoke paths actually closed
  if has_function_privilege('anon', 'public.coupon_origin_from_code(text)', 'EXECUTE') then
    raise exception 'POST-CHECK 9 FAIL: anon still holds EXECUTE';
  end if;
  if has_function_privilege('authenticated', 'public.coupon_origin_from_code(text)', 'EXECUTE') then
    raise exception 'POST-CHECK 9 FAIL: authenticated still holds EXECUTE';
  end if;
  if exists (
    select 1
    from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'public.coupon_origin_from_code(text)'::regprocedure
      and a.grantee = 0
  ) then
    raise exception 'POST-CHECK 9 FAIL: PUBLIC still holds a grant';
  end if;
end
$do$;

notify pgrst, 'reload schema';

commit;
