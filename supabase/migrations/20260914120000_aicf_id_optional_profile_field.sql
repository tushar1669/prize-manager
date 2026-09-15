-- AICF ID — an OPTIONAL organiser profile field.
--
-- Adds public.profiles.aicf_id and threads it through update_my_profile.
-- It does NOT join the completeness check. Completion stays 5 of 44.
--
-- ---------------------------------------------------------------------------
-- CORRECTION TO PROJECT_STATE §13 (recorded here so the next reader does not
-- inherit the error; §13 itself is fixed at the next documentation boundary).
--
-- §13 says "completion is 5 of 44 and gates payment". The second half is
-- wrong. Verified against production, 14 Sep 2026, and independently
-- confirmed: the F1 payment gate reads exactly two things, in both of its
-- implementations —
--   public.my_payment_gate_status()        (read-only, drives the UI card)
--   public.submit_tournament_payment_claim() (the F1-B3 block that actually
--                                             raises PROFILE_INCOMPLETE)
-- and both of them test only:
--   profiles.phone IS NOT NULL   AND   auth.users.email_confirmed_at IS NOT NULL
-- Neither reads profile_completed_at, org_name, fide_arbiter_id, or any
-- five-field count. The five-field completeness drives the COUPON
-- (claim_profile_completion_reward), not the payment gate.
--
-- This migration is still money-path work, for a narrower and sharper reason:
-- update_my_profile is the ONLY writer of profiles.phone, and phone is half
-- the payment gate. Break this RPC and payment breaks with it.
-- ---------------------------------------------------------------------------
--
-- WHY DROP + CREATE, NOT CREATE OR REPLACE
-- CREATE OR REPLACE cannot add a parameter. Creating the 6-arg function while
-- the 5-arg one still exists leaves TWO overloads — the exact state the
-- pre-flight of 20260909130000 refuses to run under, because PostgREST then
-- resolves by argument names and may pick the wrong one. So the 5-arg function
-- is dropped first. DROP discards its grants, which are therefore re-applied
-- below; a migration that forgot that would leave `authenticated` with no
-- EXECUTE and take every profile save down with it.
--
-- WHY p_aicf_id HAS A DEFAULT
-- DD6: a git push IS a deploy, and the SOP applies migrations BEFORE the
-- frontend publish. So there is a guaranteed window where the database has the
-- 6-arg function and the live frontend build still posts 5 keys. With
-- `default null` that call still resolves against the single 6-arg function,
-- so the RPC stays backward compatible and deploy order stops mattering.
--
-- Consequence, named deliberately: during that window a save from the old
-- build writes aicf_id = null. Harmless — the column is new, every value is
-- already null, and the window closes at frontend publish. It is also exactly
-- the replace-all-fields semantics the other five parameters already have.
-- COALESCE-preserve for one field and not the others was considered and
-- rejected: the inconsistency costs more at 3am than the window does today.
--
-- NO FORMAT CONSTRAINT on aicf_id. AICF numbering is not stable enough to
-- reject on, and this is an optional display field, not a trust boundary.
--
-- ROLLBACK: see the block at the foot of this file.

begin;

-- ---------------------------------------------------------------------------
-- Pre-flight. Assert the audited state. Refuse to run on drift.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_total      int;
  v_completed  int;
  v_five       int;
  v_overloads  int;
  v_body_md5   text;
  v_has_column int;
begin
  select count(*) into v_total from public.profiles;
  if v_total <> 44 then
    raise exception 'PRE-FLIGHT FAIL: expected 44 profiles, found %', v_total;
  end if;

  select count(*) into v_completed from public.profiles where profile_completed_at is not null;
  if v_completed <> 5 then
    raise exception 'PRE-FLIGHT FAIL: expected 5 completed profiles, found %', v_completed;
  end if;

  -- The five required fields, evaluated exactly as update_my_profile evaluates
  -- them. If this has drifted from profile_completed_at then the population
  -- this migration was reasoned about no longer exists. Refuse.
  select count(*) into v_five
  from public.profiles
  where display_name is not null and phone is not null and city is not null
    and org_name is not null and fide_arbiter_id is not null;
  if v_five <> v_completed then
    raise exception 'PRE-FLIGHT FAIL: % profiles have all five fields but % have profile_completed_at', v_five, v_completed;
  end if;

  -- Exactly one overload going in, so the DROP below names the only candidate.
  select count(*) into v_overloads from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'update_my_profile';
  if v_overloads <> 1 then
    raise exception 'PRE-FLIGHT FAIL: expected 1 update_my_profile overload, found %', v_overloads;
  end if;

  -- The body about to be replaced must be the body this migration was written
  -- against: byte-identical to the PART 2 definition in
  -- 20260909130000_profile_reward_auto_issue.sql (verified 14 Sep 2026).
  -- A hand-edit in the SQL Editor since then would be silently overwritten by
  -- the CREATE below, so this refuses instead.
  select md5(p.prosrc) into v_body_md5
  from pg_proc p where p.oid = 'public.update_my_profile(text,text,text,text,text)'::regprocedure;
  if v_body_md5 <> 'a9900998af1e5727f5e14146d623e906' then
    raise exception 'PRE-FLIGHT FAIL: live update_my_profile body is %, expected a9900998af1e5727f5e14146d623e906 — production has drifted from the repo', v_body_md5;
  end if;

  select count(*) into v_has_column
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'aicf_id';
  if v_has_column <> 0 then
    raise exception 'PRE-FLIGHT FAIL: profiles.aicf_id already exists';
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- 1. The column. Nullable, no default, no constraint.
--    No grant is issued: profiles carries no INSERT/UPDATE privilege for
--    authenticated (revoked by 20260812141500_f1a2_lock_profiles_write_surface),
--    and a new column must not become the one writable exception.
--    authenticated retains table-wide SELECT, so a user reads their own
--    aicf_id through the existing own-row policy. anon cannot read profiles
--    at all, so this field is not anon-exposed.
-- ---------------------------------------------------------------------------
alter table public.profiles add column aicf_id text;

comment on column public.profiles.aicf_id is
  'Optional All India Chess Federation ID. Deliberately NOT part of the profile completeness check (that is display_name, phone, city, org_name, fide_arbiter_id).';

-- ---------------------------------------------------------------------------
-- 2. The RPC. Body is the live body verbatim, plus exactly three additions:
--      + p_aicf_id parameter (defaulted)
--      + aicf_id assignment in the UPDATE
--      + 'aicf_id' key in the returned object
--    v_complete is UNTOUCHED and still tests five fields. Post-check 3 below
--    fails the migration if that ever stops being true.
-- ---------------------------------------------------------------------------
drop function public.update_my_profile(text, text, text, text, text);

create function public.update_my_profile(
  p_display_name    text,
  p_phone           text,
  p_city            text,
  p_org_name        text,
  p_fide_arbiter_id text,
  p_aicf_id         text default null
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
  v_reward   jsonb;
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
    fide_arbiter_id = nullif(btrim(coalesce(p_fide_arbiter_id, '')), ''),
    aicf_id         = nullif(btrim(coalesce(p_aicf_id, '')), '')
  where p.id = v_uid
  returning p.* into v_row;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  -- FIVE fields. aicf_id is optional and must never appear in this block:
  -- adding it would move completion from 5/44 to 0/44 overnight, un-complete
  -- five organisers, and change who the reward is owed to.
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

  -- Auto-issue. Delegated, never duplicated: claim_profile_completion_reward is
  -- the single implementation of "issue the profile reward" and it re-checks the
  -- profile under SELECT ... FOR UPDATE, so a concurrent save and a button press
  -- cannot both mint a coupon. Guarded here as well so the common path does no
  -- work and takes no extra lock.
  if v_complete and not v_row.profile_reward_claimed then
    v_reward := public.claim_profile_completion_reward();
    select p.* into v_row from public.profiles p where p.id = v_uid;
  end if;

  return jsonb_build_object(
    'display_name',           v_row.display_name,
    'phone',                  v_row.phone,
    'city',                   v_row.city,
    'org_name',               v_row.org_name,
    'fide_arbiter_id',        v_row.fide_arbiter_id,
    'aicf_id',                v_row.aicf_id,
    'profile_completed_at',   v_row.profile_completed_at,
    'profile_reward_claimed', v_row.profile_reward_claimed,
    'reward',                 v_reward
  );
end;
$fn$;

-- D18 — both revoke paths, then re-grant. DROP took the old grants with it.
revoke all on function public.update_my_profile(text,text,text,text,text,text) from public;
revoke all on function public.update_my_profile(text,text,text,text,text,text) from anon, authenticated;
grant execute on function public.update_my_profile(text,text,text,text,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Post-checks. Every one of these fails the whole transaction.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_overloads  int;
  v_src        text;
  v_block      text;
  v_nullchecks int;
  v_completed  int;
  v_coltype    text;
  v_nullable   text;
begin
  -- 1. Exactly one overload. Two would put PostgREST back in the position of
  --    choosing, which is the failure this migration exists to avoid.
  select count(*) into v_overloads from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'update_my_profile';
  if v_overloads <> 1 then
    raise exception 'POST-CHECK 1 FAIL: % update_my_profile overloads', v_overloads;
  end if;

  -- 2. The security properties survived the DROP/CREATE. SECURITY DEFINER with
  --    a pinned search_path is what makes this RPC safe to expose at all.
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.update_my_profile(text,text,text,text,text,text)'::regprocedure
      and p.prosecdef
      and p.provolatile = 'v'
      and p.prorettype = 'jsonb'::regtype
      and p.proconfig @> array['search_path=public']
  ) then
    raise exception 'POST-CHECK 2 FAIL: SECURITY DEFINER / volatility / search_path / return type not reproduced';
  end if;

  select p.prosrc into v_src
  from pg_proc p where p.oid = 'public.update_my_profile(text,text,text,text,text,text)'::regprocedure;

  -- 3. THE CHECK THIS MIGRATION EXISTS FOR. The completeness test must still be
  --    five fields and must not mention aicf_id. Asserted against the shipped
  --    body, not against intent.
  v_block := substring(v_src from 'v_complete :=(.*?);');
  if v_block is null then
    raise exception 'POST-CHECK 3 FAIL: could not locate the v_complete assignment';
  end if;
  if v_block ilike '%aicf%' then
    raise exception 'POST-CHECK 3 FAIL: aicf_id has entered the completeness check';
  end if;
  v_nullchecks := array_length(string_to_array(v_block, 'is not null'), 1) - 1;
  if v_nullchecks <> 5 then
    raise exception 'POST-CHECK 3 FAIL: completeness tests % fields, expected 5', v_nullchecks;
  end if;

  -- 4. The feature actually shipped: the field is written and returned.
  --    Without this the migration could "pass" having changed nothing (DD5 —
  --    a comment can claim a capability the code does not have).
  --    Matched on regex, not on exact spacing: these lines are column-aligned,
  --    and a check that a reflow can fail is a check that fails for the wrong
  --    reason.
  if v_src !~ 'aicf_id\s*=\s*nullif\(btrim\(coalesce\(p_aicf_id' then
    raise exception 'POST-CHECK 4 FAIL: update_my_profile does not write aicf_id';
  end if;
  if v_src !~ '''aicf_id''\s*,\s*v_row\.aicf_id' then
    raise exception 'POST-CHECK 4 FAIL: update_my_profile does not return aicf_id';
  end if;

  -- 5. Grants. anon must not hold EXECUTE; authenticated must.
  if has_function_privilege('anon', 'public.update_my_profile(text,text,text,text,text,text)', 'EXECUTE') then
    raise exception 'POST-CHECK 5 FAIL: anon holds EXECUTE on update_my_profile';
  end if;
  if not has_function_privilege('authenticated', 'public.update_my_profile(text,text,text,text,text,text)', 'EXECUTE') then
    raise exception 'POST-CHECK 5 FAIL: authenticated lost EXECUTE on update_my_profile — every profile save would fail';
  end if;

  -- 6. The write-surface lock (F1-A2) is intact. Both table-level and
  --    column-level are tested: RLS restricts rows, never columns, and a
  --    column-level grant on the new column would reopen the hole that
  --    20260812141500 closed.
  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'POST-CHECK 6 FAIL: authenticated regained UPDATE on profiles';
  end if;
  if has_table_privilege('anon', 'public.profiles', 'SELECT')
     or has_any_column_privilege('anon', 'public.profiles', 'SELECT') then
    raise exception 'POST-CHECK 6 FAIL: anon regained SELECT on profiles';
  end if;

  -- 7. The column landed as intended: nullable text, no default.
  select data_type, is_nullable into v_coltype, v_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'aicf_id';
  if v_coltype is distinct from 'text' or v_nullable is distinct from 'YES' then
    raise exception 'POST-CHECK 7 FAIL: aicf_id is %/nullable=%, expected text/YES', v_coltype, v_nullable;
  end if;

  -- 8. Nobody's completion state moved. This is the observable promise: adding
  --    an optional field must not complete or un-complete a single organiser.
  select count(*) into v_completed from public.profiles where profile_completed_at is not null;
  if v_completed <> 5 then
    raise exception 'POST-CHECK 8 FAIL: completed profiles moved to %, expected 5', v_completed;
  end if;
end
$do$;

notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------------
-- ROLLBACK (restores the exact pre-migration state; run as one transaction)
--
--   begin;
--   drop function public.update_my_profile(text,text,text,text,text,text);
--   -- recreate the 5-arg body verbatim from
--   -- 20260909130000_profile_reward_auto_issue.sql, PART 2 (md5 a9900998af1e5727f5e14146d623e906),
--   -- then:
--   --   revoke all on function public.update_my_profile(text,text,text,text,text) from public;
--   --   revoke all on function public.update_my_profile(text,text,text,text,text) from anon, authenticated;
--   --   grant execute on function public.update_my_profile(text,text,text,text,text) to authenticated;
--   alter table public.profiles drop column aicf_id;
--   notify pgrst, 'reload schema';
--   commit;
--
-- Roll the FRONTEND back first. The 6-arg function accepts a 5-key call, but
-- the 5-arg function rejects a 6-key one with PGRST202 — so reversing this
-- while the new build is live would break every profile save, and with it the
-- only writer of profiles.phone.
-- ---------------------------------------------------------------------------
