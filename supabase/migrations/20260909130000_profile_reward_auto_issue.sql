-- 20260909130000_profile_reward_auto_issue.sql
--
-- Two things, one transaction:
--
--   PART 1 — DRIFT CAPTURE. public.claim_profile_completion_reward was hotfixed
--   directly against production and never entered a migration. The live body
--   dropped the `website` gate (the UI stopped collecting that field) and changed
--   the existing-coupon lookup from a discount-shape match to `code ILIKE
--   'PROFILE-%'`. THE LIVE VERSION IS THE SOURCE OF TRUTH. Its body is reproduced
--   below byte-for-byte from pg_proc.prosrc — NOT from git, which would
--   reintroduce the dead `website` gate and lock every organiser out of the
--   reward. Zero behaviour change; proved by post-check P1 comparing the raw and
--   the comment-stripped body md5 against the pre-flight baseline.
--
--   PART 2 — AUTO-ISSUE. public.update_my_profile now issues the coupon itself
--   when the saved profile is complete and profile_reward_claimed is false. It
--   fires on ANY such save, not only on the null -> set transition of
--   profile_completed_at, so the 3 organisers who completed their profile and
--   never pressed the button collect on their next save. No coupon is granted by
--   this migration — the reward still requires the user to act.
--
-- REUSE DECISION — update_my_profile CALLS claim_profile_completion_reward
-- directly; no shared helper was extracted. Reasons:
--   1. A single implementation cannot diverge. A shared internal function is two
--      call sites around one body; a direct call is one body with one caller
--      added. The stronger guarantee is the cheaper one here.
--   2. claim_profile_completion_reward already has exactly the semantics needed:
--      SECURITY DEFINER, auth.uid()-scoped, SELECT ... FOR UPDATE on the profile
--      row, and idempotent on profile_reward_claimed. Nested inside another
--      SECURITY DEFINER function auth.uid() still reads request.jwt.claims, and
--      re-taking a row lock already held by the same transaction is a no-op.
--   3. Extraction is incompatible with PART 1. The whole point of PART 1 is to
--      assert the captured body is byte-identical to live. Rewriting that body in
--      the same migration would make that assertion unprovable, and the drift
--      would be laundered rather than recorded.
-- claim_profile_completion_reward keeps its signature, its behaviour and its
-- authenticated grant. src/pages/Account.tsx still calls it; post-check M3 in the
-- matched pair exercises that path directly.
--
-- Trigger review (CC1) — triggers on public.coupons, in fire order (alphabetical
-- within BEFORE INSERT):
--   normalize_coupon_code      BEFORE INSERT OR UPDATE -> code := upper(trim(code)).
--                              The generated code is already upper-case, so this
--                              is a no-op here; check M1 asserts the stored code
--                              still matches 'PROFILE-%'.
--   trg_coupons_set_snapshot   BEFORE INSERT -> fills origin from
--                              coupon_origin_from_code(code) when origin is null,
--                              and back-fills issued_to_email from auth.users.
--                              This is why the INSERT below names no origin and
--                              still satisfies coupons_origin_check (migration
--                              20260909120000). Check M1 asserts origin landed on
--                              'profile_reward' rather than trusting it.
--   update_coupons_updated_at  BEFORE UPDATE -> not reached; nothing here updates
--                              a coupon row.
-- public.profiles carries no triggers at all (verified against pg_trigger).
--
-- NOT TOUCHED: coupon_origin_from_code, coupons_origin_check, the five required
-- profile fields, and — per CLAUDE.md — the allocation engine, which this
-- migration neither reads nor writes.

begin;

-- ---------------------------------------------------------------------------
-- Pre-flight: assert the audited state and capture the PART 1 baseline.
-- ---------------------------------------------------------------------------
create temp table _profile_reward_preflight (
  k text primary key,
  v text not null
) on commit drop;

do $do$
declare
  v_completed   int;
  v_claimed     int;
  v_coupons     int;
  v_five        int;
  v_unclaimed   int;
  v_overloads   int;
  v_src         text;
begin
  select count(*) into v_completed from public.profiles where profile_completed_at is not null;
  if v_completed <> 5 then
    raise exception 'PRE-FLIGHT FAIL: expected 5 profiles with profile_completed_at, found %', v_completed;
  end if;

  select count(*) into v_claimed from public.profiles where profile_reward_claimed;
  if v_claimed <> 2 then
    raise exception 'PRE-FLIGHT FAIL: expected 2 profiles with profile_reward_claimed, found %', v_claimed;
  end if;

  select count(*) into v_coupons from public.coupons where origin = 'profile_reward';
  if v_coupons <> 2 then
    raise exception 'PRE-FLIGHT FAIL: expected 2 coupons with origin=''profile_reward'', found %', v_coupons;
  end if;

  -- The five required fields, evaluated exactly as update_my_profile evaluates
  -- them. If this ever drifts from profile_completed_at the auto-issue would fire
  -- on a population the audit never described. Refuse to run.
  select count(*) into v_five
  from public.profiles
  where display_name is not null and phone is not null and city is not null
    and org_name is not null and fide_arbiter_id is not null;
  if v_five <> v_completed then
    raise exception 'PRE-FLIGHT FAIL: % profiles have all five fields but % have profile_completed_at', v_five, v_completed;
  end if;

  -- The matched pair needs two complete-and-unclaimed profiles: one for the
  -- automatic path, one for the button path. The audit says there are 3.
  select count(*) into v_unclaimed
  from public.profiles
  where display_name is not null and phone is not null and city is not null
    and org_name is not null and fide_arbiter_id is not null
    and profile_reward_claimed = false;
  if v_unclaimed <> 3 then
    raise exception 'PRE-FLIGHT FAIL: expected 3 complete-and-unclaimed profiles, found %', v_unclaimed;
  end if;

  -- One overload each, so the CREATE OR REPLACE below cannot silently fork a
  -- second signature and leave PostgREST resolving the wrong one.
  select count(*) into v_overloads from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'update_my_profile';
  if v_overloads <> 1 then
    raise exception 'PRE-FLIGHT FAIL: expected 1 update_my_profile overload, found %', v_overloads;
  end if;

  select count(*) into v_overloads from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'claim_profile_completion_reward';
  if v_overloads <> 1 then
    raise exception 'PRE-FLIGHT FAIL: expected 1 claim_profile_completion_reward overload, found %', v_overloads;
  end if;

  -- PART 1 baseline. Raw body md5, and the CC10-normalised md5 (line comments
  -- stripped, whitespace collapsed) so the comparison cannot be passed by a
  -- cosmetic reflow either.
  select p.prosrc into v_src
  from pg_proc p where p.oid = 'public.claim_profile_completion_reward()'::regprocedure;

  insert into _profile_reward_preflight(k, v) values
    ('claim_raw_md5',  md5(v_src)),
    ('claim_norm_md5', md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))),
    ('claim_len',      length(v_src)::text);
end
$do$;

-- ---------------------------------------------------------------------------
-- PART 1. Drift capture. Body copied verbatim from pg_proc.prosrc of the LIVE
-- function. Do not edit; post-check P1 fails if a single byte moves.
-- ---------------------------------------------------------------------------
create or replace function public.claim_profile_completion_reward()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $claim$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_coupon_id uuid;
  v_code text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  END IF;

  -- Required fields (website removed)
  IF v_profile.display_name IS NULL OR trim(v_profile.display_name) = ''
     OR v_profile.phone IS NULL OR trim(v_profile.phone) = ''
     OR v_profile.city IS NULL OR trim(v_profile.city) = ''
     OR v_profile.org_name IS NULL OR trim(v_profile.org_name) = ''
     OR v_profile.fide_arbiter_id IS NULL OR trim(v_profile.fide_arbiter_id) = ''
  THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_incomplete');
  END IF;

  IF v_profile.profile_completed_at IS NULL THEN
    UPDATE public.profiles
    SET profile_completed_at = now()
    WHERE id = v_uid;
  END IF;

  IF v_profile.profile_reward_claimed THEN
    -- Return the existing PROFILE-* coupon code (avoid mixing with referral 100% coupons)
    SELECT c.code INTO v_code
    FROM public.coupons c
    WHERE c.issued_to_user_id = v_uid
      AND c.applies_to = 'tournament_pro'
      AND c.code ILIKE 'PROFILE-%'
    ORDER BY c.created_at ASC
    LIMIT 1;

    RETURN jsonb_build_object(
      'ok', true,
      'already_claimed', true,
      'coupon_code', COALESCE(v_code, 'ALREADY_CLAIMED')
    );
  END IF;

  -- Generate unique coupon code
  v_code := 'PROFILE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.coupons (
    code, discount_type, discount_value, applies_to,
    max_redemptions, max_redemptions_per_user,
    is_active, issued_to_user_id, created_by
  ) VALUES (
    v_code, 'percent', 100, 'tournament_pro',
    1, 1,
    true, v_uid, v_uid
  )
  RETURNING id INTO v_coupon_id;

  UPDATE public.profiles
  SET profile_reward_claimed = true
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'already_claimed', false,
    'coupon_code', v_code,
    'coupon_id', v_coupon_id
  );
END;
$claim$;

-- D18 — function grant hygiene: both revoke paths, always. The live ACL still
-- carried PUBLIC=X and anon=X from the original 2026-02 migration. Closing them
-- is a privilege change, not a behaviour change: an unauthenticated caller only
-- ever received {"ok":false,"reason":"not_authenticated"}. authenticated keeps
-- EXECUTE because src/pages/Account.tsx calls this RPC.
revoke all on function public.claim_profile_completion_reward() from public;
revoke all on function public.claim_profile_completion_reward() from anon, authenticated;
grant execute on function public.claim_profile_completion_reward() to authenticated;

-- P1: the captured body is the live body, byte for byte. This is the whole
-- claim of PART 1 and it is asserted, not asserted-in-a-comment.
do $do$
declare
  v_src      text;
  v_raw      text;
  v_norm     text;
  v_base_raw text;
  v_base_nrm text;
  v_base_len text;
begin
  select p.prosrc into v_src
  from pg_proc p where p.oid = 'public.claim_profile_completion_reward()'::regprocedure;

  v_raw  := md5(v_src);
  v_norm := md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')));

  select v into v_base_raw from _profile_reward_preflight where k = 'claim_raw_md5';
  select v into v_base_nrm from _profile_reward_preflight where k = 'claim_norm_md5';
  select v into v_base_len from _profile_reward_preflight where k = 'claim_len';

  if v_base_raw is null or v_base_nrm is null then
    raise exception 'POST-CHECK P1 FAIL: pre-flight baseline missing';
  end if;

  if v_norm is distinct from v_base_nrm then
    raise exception 'POST-CHECK P1 FAIL: normalised body changed (% -> %); this is meant to be drift capture, not a fix', v_base_nrm, v_norm;
  end if;

  if v_raw is distinct from v_base_raw then
    raise exception 'POST-CHECK P1 FAIL: raw body changed (% -> %), length % -> %', v_base_raw, v_raw, v_base_len, length(v_src);
  end if;

  -- and the properties pg_get_functiondef prints alongside the body
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.claim_profile_completion_reward()'::regprocedure
      and p.prosecdef
      and p.provolatile = 'v'
      and p.prorettype = 'jsonb'::regtype
      and p.proconfig @> array['search_path=public']
  ) then
    raise exception 'POST-CHECK P1 FAIL: SECURITY DEFINER / volatility / search_path / return type not reproduced';
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- PART 2. Auto-issue inside update_my_profile.
--
-- Diff against the live body (20260812161000_f1b1_phone_normalisation.sql):
--   + declare v_reward jsonb
--   + the "auto-issue" block below
--   + 'reward' key on the returned object (purely additive; the hook in
--     src/hooks/useOrganizerProfile.ts reads only profile_completed_at)
-- Everything else — including the phone rejection and the null -> set stamp of
-- profile_completed_at — is unchanged.
--
-- The condition is deliberately `v_complete and not profile_reward_claimed`,
-- NOT `profile_completed_at was just set`. The 3 organisers who completed their
-- profile before this shipped are past that transition for good; gating on it
-- would leave them permanently unrewarded, and the only remedy would be a
-- retroactive grant by migration, which this migration must not do.
--
-- No EXCEPTION handler wraps the call. If issuing the coupon fails, the save
-- fails loudly and the whole transaction unwinds. Swallowing the error would
-- leave a complete profile with profile_reward_claimed false and no coupon —
-- silently unrewarded money, and the exact state this migration exists to end.
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
    'profile_completed_at',   v_row.profile_completed_at,
    'profile_reward_claimed', v_row.profile_reward_claimed,
    'reward',                 v_reward
  );
end;
$fn$;

-- D18 — both revoke paths.
revoke all on function public.update_my_profile(text,text,text,text,text) from public;
revoke all on function public.update_my_profile(text,text,text,text,text) from anon, authenticated;
grant execute on function public.update_my_profile(text,text,text,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- MATCHED PAIR. Real rows, real triggers, real RPC — inside a subtransaction
-- that is unconditionally rolled back, so the migration issues no coupon to
-- anyone. plpgsql local variables survive that rollback while every database
-- write inside it does not; check M0 asserts the values actually survived, so a
-- silently-NULL comparison cannot pass for a green check.
--
-- Four sides, one column apart:
--   A  complete + unclaimed, saved  -> exactly one new coupon, origin correct
--   B  already claimed,      saved  -> no coupon, no duplicate, reward not attempted
--   C  already claimed, button press-> idempotent, returns the existing PROFILE- code
--   D  complete + unclaimed, button -> still issues; the Account.tsx path is intact
-- ---------------------------------------------------------------------------
do $do$
declare
  v_auto_uid   uuid;
  v_btn_uid    uuid;
  v_claimed_uid uuid;
  v_p          public.profiles%rowtype;
  v_c0 int; v_cA int; v_cB int; v_cC int; v_cD int;
  v_resA jsonb; v_resB jsonb; v_resC jsonb; v_resD jsonb;
  v_codeA text; v_originA text; v_flagA boolean;
  v_dupB_before int; v_dupB_after int;
  v_sentinel boolean := false;
begin
  -- two distinct complete-and-unclaimed subjects, and one already-claimed one
  select p.id into v_auto_uid from public.profiles p
  where p.display_name is not null and p.phone is not null and p.city is not null
    and p.org_name is not null and p.fide_arbiter_id is not null
    and p.profile_reward_claimed = false
  order by p.id limit 1;

  select p.id into v_btn_uid from public.profiles p
  where p.display_name is not null and p.phone is not null and p.city is not null
    and p.org_name is not null and p.fide_arbiter_id is not null
    and p.profile_reward_claimed = false
    and p.id <> v_auto_uid
  order by p.id limit 1;

  select p.id into v_claimed_uid from public.profiles p
  where p.display_name is not null and p.phone is not null and p.city is not null
    and p.org_name is not null and p.fide_arbiter_id is not null
    and p.profile_reward_claimed = true
  order by p.id limit 1;

  if v_auto_uid is null or v_btn_uid is null or v_claimed_uid is null then
    raise exception 'MATCHED PAIR SETUP FAIL: need two complete-unclaimed and one claimed profile (got %, %, %)',
      v_auto_uid, v_btn_uid, v_claimed_uid;
  end if;

  begin
    select count(*) into v_c0 from public.coupons;

    -- auth.uid() reads request.jwt.claim.sub first, then request.jwt.claims->>'sub'.
    -- Clear the former so the latter is the only source.
    perform set_config('request.jwt.claim.sub', '', true);

    -- ---- A: complete + unclaimed, ordinary save -> coupon issued -----------
    perform set_config('request.jwt.claims', json_build_object('sub', v_auto_uid)::text, true);
    select p.* into v_p from public.profiles p where p.id = v_auto_uid;
    v_resA := public.update_my_profile(v_p.display_name, v_p.phone, v_p.city, v_p.org_name, v_p.fide_arbiter_id);
    select count(*) into v_cA from public.coupons;
    select c.code, c.origin into v_codeA, v_originA
    from public.coupons c
    where c.issued_to_user_id = v_auto_uid and c.code like 'PROFILE-%'
    order by c.created_at desc, c.id desc limit 1;
    select p.profile_reward_claimed into v_flagA from public.profiles p where p.id = v_auto_uid;

    -- ---- B: already claimed, ordinary save -> nothing ----------------------
    select count(*) into v_dupB_before from public.coupons c
    where c.issued_to_user_id = v_claimed_uid and c.code like 'PROFILE-%';
    perform set_config('request.jwt.claims', json_build_object('sub', v_claimed_uid)::text, true);
    select p.* into v_p from public.profiles p where p.id = v_claimed_uid;
    v_resB := public.update_my_profile(v_p.display_name, v_p.phone, v_p.city, v_p.org_name, v_p.fide_arbiter_id);
    select count(*) into v_cB from public.coupons;
    select count(*) into v_dupB_after from public.coupons c
    where c.issued_to_user_id = v_claimed_uid and c.code like 'PROFILE-%';

    -- ---- C: already claimed, Account.tsx button -> idempotent --------------
    v_resC := public.claim_profile_completion_reward();
    select count(*) into v_cC from public.coupons;

    -- ---- D: complete + unclaimed, Account.tsx button -> still issues -------
    perform set_config('request.jwt.claims', json_build_object('sub', v_btn_uid)::text, true);
    v_resD := public.claim_profile_completion_reward();
    select count(*) into v_cD from public.coupons;

    v_sentinel := true;
    raise exception using errcode = 'RB999', message = 'MATCHED PAIR SANDBOX ROLLBACK';
  exception
    when sqlstate 'RB999' then
      null;  -- every write above is now undone; the captured variables are not
  end;

  -- M0: the capture survived the rollback. Without this, a lost variable reads
  -- NULL, every comparison below evaluates to NULL, and nothing raises.
  if not v_sentinel then
    raise exception 'MATCHED PAIR FAIL M0: sandbox did not reach the rollback sentinel';
  end if;
  -- Only values that are non-null whatever the outcome belong here. v_codeA and
  -- v_originA are null precisely when no coupon was issued, which is an M1
  -- regression, not a lost capture — checking them here would let a real failure
  -- report itself as a harness problem.
  if v_c0 is null or v_cA is null or v_cB is null or v_cC is null or v_cD is null
     or v_resA is null or v_resB is null or v_resC is null or v_resD is null
     or v_flagA is null or v_dupB_before is null or v_dupB_after is null then
    raise exception 'MATCHED PAIR FAIL M0: captured values did not survive the subtransaction rollback';
  end if;
  if v_c0 = 0 then
    raise exception 'MATCHED PAIR FAIL M0: baseline coupon count is zero; the fixture is empty';
  end if;

  -- M1: side A issued exactly one coupon, correctly stamped.
  if v_cA <> v_c0 + 1 then
    raise exception 'MATCHED PAIR FAIL M1: complete+unclaimed save moved coupons % -> %, expected exactly one new row', v_c0, v_cA;
  end if;
  if v_codeA is null then
    raise exception 'MATCHED PAIR FAIL M1: no PROFILE- coupon exists for the issuing profile after the save';
  end if;
  if v_codeA not like 'PROFILE-%' then
    raise exception 'MATCHED PAIR FAIL M1: issued code % is not a PROFILE- code (normalize_coupon_code rewrote it?)', v_codeA;
  end if;
  if v_originA is distinct from 'profile_reward' then
    raise exception 'MATCHED PAIR FAIL M1: issued coupon origin is %, expected profile_reward (trg_coupons_set_snapshot)', v_originA;
  end if;
  if v_flagA is not true then
    raise exception 'MATCHED PAIR FAIL M1: profile_reward_claimed was not set on the issuing profile';
  end if;
  if (v_resA ->> 'profile_reward_claimed') <> 'true' then
    raise exception 'MATCHED PAIR FAIL M1: returned profile_reward_claimed is %, expected true', v_resA ->> 'profile_reward_claimed';
  end if;
  if (v_resA -> 'reward' ->> 'ok') <> 'true' or (v_resA -> 'reward' ->> 'already_claimed') <> 'false' then
    raise exception 'MATCHED PAIR FAIL M1: reward payload was %', v_resA -> 'reward';
  end if;
  if (v_resA -> 'reward' ->> 'coupon_code') is distinct from v_codeA then
    raise exception 'MATCHED PAIR FAIL M1: returned code % does not match the stored code %', v_resA -> 'reward' ->> 'coupon_code', v_codeA;
  end if;

  -- M2: side B, one column apart, issued nothing and duplicated nothing.
  if v_cB <> v_cA then
    raise exception 'MATCHED PAIR FAIL M2: already-claimed save moved coupons % -> %, expected no change', v_cA, v_cB;
  end if;
  if v_dupB_after <> v_dupB_before then
    raise exception 'MATCHED PAIR FAIL M2: already-claimed profile gained a duplicate PROFILE- coupon (% -> %)', v_dupB_before, v_dupB_after;
  end if;
  if v_dupB_before = 0 then
    raise exception 'MATCHED PAIR FAIL M2: the claimed fixture holds no PROFILE- coupon, so "no duplicate" proves nothing';
  end if;
  if (v_resB -> 'reward') <> 'null'::jsonb then
    raise exception 'MATCHED PAIR FAIL M2: reward was attempted on an already-claimed profile: %', v_resB -> 'reward';
  end if;

  -- M3: side C, the Account.tsx button on a claimed profile, still idempotent.
  if v_cC <> v_cB then
    raise exception 'MATCHED PAIR FAIL M3: the button minted a coupon for an already-claimed profile (% -> %)', v_cB, v_cC;
  end if;
  if (v_resC ->> 'ok') <> 'true' or (v_resC ->> 'already_claimed') <> 'true' then
    raise exception 'MATCHED PAIR FAIL M3: button returned % on a claimed profile', v_resC;
  end if;
  if (v_resC ->> 'coupon_code') not like 'PROFILE-%' then
    raise exception 'MATCHED PAIR FAIL M3: button returned % instead of the existing PROFILE- code', v_resC ->> 'coupon_code';
  end if;

  -- M4: side D, the button still issues for a complete-unclaimed profile.
  if v_cD <> v_cC + 1 then
    raise exception 'MATCHED PAIR FAIL M4: the button stopped issuing (coupons % -> %)', v_cC, v_cD;
  end if;
  if (v_resD ->> 'ok') <> 'true' or (v_resD ->> 'already_claimed') <> 'false' then
    raise exception 'MATCHED PAIR FAIL M4: button returned % on a complete-unclaimed profile', v_resD;
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- Post-checks. RAISE EXCEPTION only — RAISE NOTICE is silently swallowed.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_completed int;
  v_claimed   int;
  v_origin    int;
  v_total     int;
  v_unclaimed int;
  v_overloads int;
begin
  -- 1..4: the migration granted nothing. The sandbox rolled back; prove it.
  select count(*) into v_total from public.coupons;
  if v_total <> 48 then
    raise exception 'POST-CHECK 1 FAIL: coupon count is %, expected 48 — the migration issued a coupon', v_total;
  end if;

  select count(*) into v_origin from public.coupons where origin = 'profile_reward';
  if v_origin <> 2 then
    raise exception 'POST-CHECK 2 FAIL: profile_reward coupons is %, expected 2', v_origin;
  end if;

  select count(*) into v_claimed from public.profiles where profile_reward_claimed;
  if v_claimed <> 2 then
    raise exception 'POST-CHECK 3 FAIL: profile_reward_claimed is %, expected 2', v_claimed;
  end if;

  select count(*) into v_unclaimed
  from public.profiles
  where display_name is not null and phone is not null and city is not null
    and org_name is not null and fide_arbiter_id is not null
    and profile_reward_claimed = false;
  if v_unclaimed <> 3 then
    raise exception 'POST-CHECK 4 FAIL: complete-and-unclaimed is %, expected 3 — nobody may be rewarded by migration', v_unclaimed;
  end if;

  select count(*) into v_completed from public.profiles where profile_completed_at is not null;
  if v_completed <> 5 then
    raise exception 'POST-CHECK 5 FAIL: profile_completed_at is %, expected 5', v_completed;
  end if;

  -- 6: no new overload; the PostgREST signature is the one the client calls.
  select count(*) into v_overloads from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'update_my_profile';
  if v_overloads <> 1 then
    raise exception 'POST-CHECK 6 FAIL: % update_my_profile overloads', v_overloads;
  end if;

  -- 7: update_my_profile really does delegate. A future edit that inlines an
  -- INSERT INTO coupons here — the divergence this design exists to prevent —
  -- fails this check.
  if position('claim_profile_completion_reward' in
       (select p.prosrc from pg_proc p
        where p.oid = 'public.update_my_profile(text,text,text,text,text)'::regprocedure)) = 0 then
    raise exception 'POST-CHECK 7 FAIL: update_my_profile does not call claim_profile_completion_reward';
  end if;
  if position('insert into public.coupons' in
       lower(regexp_replace((select p.prosrc from pg_proc p
        where p.oid = 'public.update_my_profile(text,text,text,text,text)'::regprocedure),
        '--[^\n]*', '', 'g'))) > 0 then
    raise exception 'POST-CHECK 7 FAIL: update_my_profile writes coupons directly instead of delegating';
  end if;

  -- 8: D18 on both functions, both paths.
  if has_function_privilege('anon', 'public.claim_profile_completion_reward()', 'EXECUTE') then
    raise exception 'POST-CHECK 8 FAIL: anon holds EXECUTE on claim_profile_completion_reward';
  end if;
  if has_function_privilege('anon', 'public.update_my_profile(text,text,text,text,text)', 'EXECUTE') then
    raise exception 'POST-CHECK 8 FAIL: anon holds EXECUTE on update_my_profile';
  end if;
  if exists (
    select 1 from pg_proc p, aclexplode(p.proacl) a
    where p.oid in ('public.claim_profile_completion_reward()'::regprocedure,
                    'public.update_my_profile(text,text,text,text,text)'::regprocedure)
      and a.grantee = 0
  ) then
    raise exception 'POST-CHECK 8 FAIL: PUBLIC still holds a grant';
  end if;
  -- and the app can still call both
  if not has_function_privilege('authenticated', 'public.claim_profile_completion_reward()', 'EXECUTE') then
    raise exception 'POST-CHECK 8 FAIL: authenticated lost EXECUTE on claim_profile_completion_reward (Account.tsx would break)';
  end if;
  if not has_function_privilege('authenticated', 'public.update_my_profile(text,text,text,text,text)', 'EXECUTE') then
    raise exception 'POST-CHECK 8 FAIL: authenticated lost EXECUTE on update_my_profile';
  end if;
end
$do$;

-- The return shape of update_my_profile gained a key. No signature changed, but
-- PostgREST caches the schema either way (T6).
notify pgrst, 'reload schema';

commit;
