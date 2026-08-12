-- F1-B1: canonical phone storage + a read-only gate-status helper.
-- Additive. No payment gate is enforced here; B3 does that after B2 ships the UI.
-- Decision (12 Aug): invalid phone is REJECTED at save time, not stored raw.

-- ---------------------------------------------------------------------------
-- 1. Canonical form: +91 followed by 10 digits starting 6-9.
--    Returns NULL for empty input AND for unparseable input; the caller
--    distinguishes the two. Not used in any index, so the normalize_utr
--    freeze problem (Q2) does not arise here.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_phone_in(p_raw text)
returns text
language sql
immutable
set search_path to 'public'
as $fn$
  select case
    when p_raw is null or btrim(p_raw) = '' then null
    when regexp_replace(p_raw, '[^0-9]', '', 'g') ~ '^91[6-9][0-9]{9}$'
      then '+' || regexp_replace(p_raw, '[^0-9]', '', 'g')
    when regexp_replace(p_raw, '[^0-9]', '', 'g') ~ '^0?[6-9][0-9]{9}$'
      then '+91' || right(regexp_replace(p_raw, '[^0-9]', '', 'g'), 10)
    else null
  end;
$fn$;

revoke all on function public.normalize_phone_in(text) from public;
revoke all on function public.normalize_phone_in(text) from anon;
revoke all on function public.normalize_phone_in(text) from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Abort before touching data if any existing phone cannot be normalised.
--    Dry-run 12 Aug: all 4 rows normalise cleanly. This is the safety net.
-- ---------------------------------------------------------------------------
do $guard$
declare v_bad int;
begin
  select count(*) into v_bad
  from public.profiles
  where btrim(coalesce(phone,'')) <> ''
    and public.normalize_phone_in(phone) is null;
  if v_bad > 0 then
    raise exception 'ABORT: % profile row(s) have an unnormalisable phone', v_bad;
  end if;
end
$guard$;

-- 3. Backfill to canonical form (2 rows carry a hyphen separator).
update public.profiles
set phone = public.normalize_phone_in(phone)
where btrim(coalesce(phone,'')) <> ''
  and phone is distinct from public.normalize_phone_in(phone);

-- ---------------------------------------------------------------------------
-- 4. NULL stays legal -- 32 of 36 users have no phone and must keep saving
--    their profile. The constraint means "if present, it is valid", so
--    downstream code can treat NOT NULL as VALID with no second check.
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_phone_india_mobile;

alter table public.profiles
  add constraint profiles_phone_india_mobile
  check (phone is null or phone ~ '^\+91[6-9][0-9]{9}$');

-- ---------------------------------------------------------------------------
-- 5. Reject invalid phone at the point of entry.
-- ---------------------------------------------------------------------------
create or replace function public.update_my_profile(
  p_display_name    text,
  p_phone           text,
  p_city            text,
  p_org_name        text,
  p_fide_arbiter_id text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid      uuid := auth.uid();
  v_row      public.profiles%rowtype;
  v_complete boolean;
  v_phone_in text := nullif(btrim(coalesce(p_phone, '')), '');
  v_phone    text;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if v_phone_in is not null then
    v_phone := public.normalize_phone_in(v_phone_in);
    if v_phone is null then
      raise exception 'INVALID_PHONE';
    end if;
  end if;

  update public.profiles p set
    display_name    = nullif(btrim(coalesce(p_display_name, '')), ''),
    phone           = v_phone,
    city            = nullif(btrim(coalesce(p_city, '')), ''),
    org_name        = nullif(btrim(coalesce(p_org_name, '')), ''),
    fide_arbiter_id = nullif(btrim(coalesce(p_fide_arbiter_id, '')), '')
  where p.id = v_uid
  returning p.* into v_row;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  v_complete :=
        v_row.display_name    is not null
    and v_row.phone           is not null
    and v_row.city            is not null
    and v_row.org_name        is not null
    and v_row.fide_arbiter_id is not null;

  if v_complete and v_row.profile_completed_at is null then
    update public.profiles set profile_completed_at = now()
    where id = v_uid
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'display_name',           v_row.display_name,
    'phone',                  v_row.phone,
    'city',                   v_row.city,
    'org_name',               v_row.org_name,
    'fide_arbiter_id',        v_row.fide_arbiter_id,
    'profile_completed_at',   v_row.profile_completed_at,
    'profile_reward_claimed', v_row.profile_reward_claimed
  );
end;
$fn$;

revoke all on function public.update_my_profile(text,text,text,text,text) from public;
revoke all on function public.update_my_profile(text,text,text,text,text) from anon;
grant execute on function public.update_my_profile(text,text,text,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Read-only gate status for the payment page (B2). Enforces nothing.
--    Because of the CHECK above, phone NOT NULL implies phone VALID.
-- ---------------------------------------------------------------------------
create or replace function public.my_payment_gate_status()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_uid      uuid := auth.uid();
  v_email_ok boolean;
  v_phone    text;
  v_master   boolean;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select (u.email_confirmed_at is not null) into v_email_ok
  from auth.users u where u.id = v_uid;

  select p.phone into v_phone
  from public.profiles p where p.id = v_uid;

  v_master := public.is_master();

  return jsonb_build_object(
    'email_verified', coalesce(v_email_ok, false),
    'phone_present',  (v_phone is not null),
    'is_master',      v_master,
    'ok',             v_master or (coalesce(v_email_ok, false) and v_phone is not null)
  );
end;
$fn$;

revoke all on function public.my_payment_gate_status() from public;
revoke all on function public.my_payment_gate_status() from anon;
grant execute on function public.my_payment_gate_status() to authenticated;

notify pgrst, 'reload schema';
