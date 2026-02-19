
-- =============================================================
-- PHASE 2B: Referral tables + RPCs + profile reward claim RPC
-- =============================================================

-- 1) Referral codes table
CREATE TABLE public.referral_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_codes_user_id_unique UNIQUE (user_id),
  CONSTRAINT referral_codes_code_unique UNIQUE (code)
);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_referral_code" ON public.referral_codes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "master_read_all_referral_codes" ON public.referral_codes
  FOR SELECT USING (public.is_master());

-- 2) Referrals table (who referred whom)
CREATE TABLE public.referrals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL,
  referral_code_id uuid NOT NULL REFERENCES public.referral_codes(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrals_referred_id_unique UNIQUE (referred_id)
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_referrals" ON public.referrals
  FOR SELECT USING (referrer_id = auth.uid() OR referred_id = auth.uid());

CREATE POLICY "master_read_all_referrals" ON public.referrals
  FOR SELECT USING (public.is_master());

-- 3) Referral rewards table
CREATE TABLE public.referral_rewards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  beneficiary_id uuid NOT NULL,
  trigger_user_id uuid NOT NULL,
  trigger_tournament_id uuid NOT NULL,
  level int NOT NULL CHECK (level BETWEEN 1 AND 3),
  reward_type text NOT NULL DEFAULT 'coupon',
  coupon_id uuid REFERENCES public.coupons(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_rewards_unique_trigger UNIQUE (beneficiary_id, trigger_user_id, trigger_tournament_id, level)
);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_referral_rewards" ON public.referral_rewards
  FOR SELECT USING (beneficiary_id = auth.uid());

CREATE POLICY "master_read_all_referral_rewards" ON public.referral_rewards
  FOR SELECT USING (public.is_master());

-- =============================================================
-- RPC: claim_profile_completion_reward
-- Issues a 100% coupon for profile completion
-- =============================================================
CREATE OR REPLACE FUNCTION public.claim_profile_completion_reward()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_coupon_id uuid;
  v_code text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  END IF;

  -- Check profile is actually complete (server-side validation)
  IF v_profile.display_name IS NULL OR trim(v_profile.display_name) = ''
     OR v_profile.phone IS NULL OR trim(v_profile.phone) = ''
     OR v_profile.city IS NULL OR trim(v_profile.city) = ''
     OR v_profile.org_name IS NULL OR trim(v_profile.org_name) = ''
     OR v_profile.fide_arbiter_id IS NULL OR trim(v_profile.fide_arbiter_id) = ''
     OR v_profile.website IS NULL OR trim(v_profile.website) = ''
  THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_incomplete');
  END IF;

  IF v_profile.profile_completed_at IS NULL THEN
    UPDATE public.profiles SET profile_completed_at = now() WHERE id = v_uid;
  END IF;

  IF v_profile.profile_reward_claimed THEN
    -- Return the existing coupon code
    SELECT c.code INTO v_code
    FROM public.coupons c
    WHERE c.issued_to_user_id = v_uid
      AND c.applies_to = 'tournament_pro'
      AND c.discount_type = 'percent'
      AND c.discount_value = 100
    ORDER BY c.created_at ASC
    LIMIT 1;

    RETURN jsonb_build_object('ok', true, 'already_claimed', true, 'coupon_code', coalesce(v_code, 'ALREADY_CLAIMED'));
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
  ) RETURNING id INTO v_coupon_id;

  UPDATE public.profiles
  SET profile_reward_claimed = true
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'already_claimed', false, 'coupon_code', v_code, 'coupon_id', v_coupon_id);
END;
$$;

-- =============================================================
-- RPC: get_or_create_my_referral_code
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_or_create_my_referral_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing text;
  v_code text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT code INTO v_existing FROM public.referral_codes WHERE user_id = v_uid;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'code', v_existing, 'created', false);
  END IF;

  -- Generate unique code: REF-XXXXXXXX
  v_code := 'REF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.referral_codes (user_id, code)
  VALUES (v_uid, v_code);

  RETURN jsonb_build_object('ok', true, 'code', v_code, 'created', true);
END;
$$;

-- =============================================================
-- RPC: apply_referral_code(code text)
-- Called after a new user signs up and authenticates
-- =============================================================
CREATE OR REPLACE FUNCTION public.apply_referral_code(referral_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code_row public.referral_codes%rowtype;
  v_normalized text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  v_normalized := upper(trim(referral_code));
  IF v_normalized IS NULL OR v_normalized = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  -- Check if already referred
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = v_uid) THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_applied');
  END IF;

  SELECT * INTO v_code_row FROM public.referral_codes WHERE code = v_normalized;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  -- Self-referral check
  IF v_code_row.user_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_referral_not_allowed');
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_id, referral_code_id)
  VALUES (v_code_row.user_id, v_uid, v_code_row.id);

  RETURN jsonb_build_object('ok', true, 'reason', 'applied');
END;
$$;

-- =============================================================
-- RPC: issue_referral_rewards(trigger_user uuid, trigger_tournament uuid)
-- Issues 3-level referral coupons when a user upgrades
-- Called from review_tournament_payment or coupon redemption
-- =============================================================
CREATE OR REPLACE FUNCTION public.issue_referral_rewards(
  p_trigger_user_id uuid,
  p_trigger_tournament_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_user uuid := p_trigger_user_id;
  v_referrer_id uuid;
  v_level int := 0;
  v_discount int;
  v_code text;
  v_coupon_id uuid;
  v_issued int := 0;
BEGIN
  -- Walk up the referral chain (max 3 levels)
  LOOP
    v_level := v_level + 1;
    IF v_level > 3 THEN EXIT; END IF;

    SELECT r.referrer_id INTO v_referrer_id
    FROM public.referrals r
    WHERE r.referred_id = v_current_user;

    IF NOT FOUND THEN EXIT; END IF;

    -- Determine discount by level
    v_discount := CASE v_level WHEN 1 THEN 100 WHEN 2 THEN 50 WHEN 3 THEN 25 ELSE 0 END;
    IF v_discount = 0 THEN EXIT; END IF;

    -- Idempotency: skip if reward already exists for this combo
    IF EXISTS (
      SELECT 1 FROM public.referral_rewards
      WHERE beneficiary_id = v_referrer_id
        AND trigger_user_id = p_trigger_user_id
        AND trigger_tournament_id = p_trigger_tournament_id
        AND level = v_level
    ) THEN
      v_current_user := v_referrer_id;
      CONTINUE;
    END IF;

    -- Create coupon for the referrer
    v_code := 'REF' || v_level || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    INSERT INTO public.coupons (
      code, discount_type, discount_value, applies_to,
      max_redemptions, max_redemptions_per_user,
      is_active, issued_to_user_id, created_by
    ) VALUES (
      v_code, 'percent', v_discount, 'tournament_pro',
      1, 1,
      true, v_referrer_id, p_trigger_user_id
    ) RETURNING id INTO v_coupon_id;

    INSERT INTO public.referral_rewards (
      beneficiary_id, trigger_user_id, trigger_tournament_id,
      level, reward_type, coupon_id
    ) VALUES (
      v_referrer_id, p_trigger_user_id, p_trigger_tournament_id,
      v_level, 'coupon', v_coupon_id
    );

    v_issued := v_issued + 1;
    v_current_user := v_referrer_id;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'rewards_issued', v_issued);
END;
$$;

-- =============================================================
-- Modify review_tournament_payment to trigger referral rewards on approval
-- =============================================================
CREATE OR REPLACE FUNCTION public.review_tournament_payment(p_payment_id uuid, p_decision text, p_note text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_is_master boolean := public.has_role(auth.uid(), 'master'::app_role);
  v_payment record;
  v_now timestamptz := now();
begin
  if not v_is_master then
    raise exception 'FORBIDDEN';
  end if;

  select *
  into v_payment
  from public.tournament_payments
  where id = p_payment_id
  for update;

  if v_payment is null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'PAYMENT_ALREADY_REVIEWED';
  end if;

  if lower(p_decision) = 'reject' then
    update public.tournament_payments
      set status='rejected',
          review_note = left(coalesce(p_note,''), 2000),
          reviewed_by = auth.uid(),
          reviewed_at = v_now
    where id = p_payment_id;

    return json_build_object('ok', true, 'status', 'rejected');
  end if;

  if lower(p_decision) <> 'approve' then
    raise exception 'INVALID_DECISION';
  end if;

  -- APPROVE:
  insert into public.tournament_entitlements (tournament_id, owner_id, source, source_ref, starts_at, ends_at)
  values (v_payment.tournament_id, v_payment.user_id, 'manual_upi', v_payment.id, v_now, v_now + interval '365 days');

  update public.tournament_payments
    set status='approved',
        review_note = left(coalesce(p_note,''), 2000),
        reviewed_by = auth.uid(),
        reviewed_at = v_now
  where id = p_payment_id;

  -- Issue referral rewards for the upgrading user
  PERFORM public.issue_referral_rewards(v_payment.user_id, v_payment.tournament_id);

  return json_build_object('ok', true, 'status', 'approved');
end;
$$;

-- =============================================================
-- Also trigger referral rewards when coupon redeems to 0 (free upgrade)
-- Modify redeem_coupon_for_tournament to call issue_referral_rewards
-- =============================================================
CREATE OR REPLACE FUNCTION public.redeem_coupon_for_tournament(code text, tournament_id uuid, amount_before integer)
RETURNS TABLE(amount_after integer, discount_amount integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_coupon public.coupons%rowtype;
  v_user_id uuid;
  v_discount integer := 0;
  v_after integer := 0;
  v_total integer := 0;
  v_user_total integer := 0;
  v_code text;
  v_owner_id uuid;
  v_redemption_id uuid;
  v_now timestamptz := now();
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if amount_before is null or amount_before < 0 then raise exception 'invalid_amount_before'; end if;

  select t.owner_id into v_owner_id
  from public.tournaments t
  where t.id = redeem_coupon_for_tournament.tournament_id
  for update;

  if not found then raise exception 'tournament_not_found'; end if;

  if not (v_owner_id = v_user_id or public.has_role(v_user_id,'master'::public.app_role)) then
    raise exception 'not_authorized_for_tournament';
  end if;

  v_code := upper(trim(code));
  if v_code is null or v_code = '' then raise exception 'missing_code'; end if;

  select * into v_coupon
  from public.coupons c
  where c.code = v_code and c.applies_to='tournament_pro'
  for update;

  if not found then raise exception 'coupon_not_found'; end if;
  if not v_coupon.is_active then raise exception 'coupon_inactive'; end if;
  if v_coupon.starts_at is not null and v_now < v_coupon.starts_at then raise exception 'coupon_not_started'; end if;
  if v_coupon.ends_at is not null and v_now > v_coupon.ends_at then raise exception 'coupon_expired'; end if;
  if v_coupon.issued_to_user_id is not null and v_coupon.issued_to_user_id <> v_user_id then
    raise exception 'coupon_not_issued_to_user';
  end if;

  select count(*) into v_total from public.coupon_redemptions cr where cr.coupon_id = v_coupon.id;
  if v_coupon.max_redemptions is not null and v_total >= v_coupon.max_redemptions then
    raise exception 'max_redemptions_reached';
  end if;

  select count(*) into v_user_total
  from public.coupon_redemptions cr
  where cr.coupon_id = v_coupon.id and cr.redeemed_by_user_id = v_user_id;

  if v_coupon.max_redemptions_per_user is not null and v_user_total >= v_coupon.max_redemptions_per_user then
    raise exception 'max_redemptions_per_user_reached';
  end if;

  if v_coupon.discount_type = 'percent' then
    v_discount := floor((amount_before::numeric * v_coupon.discount_value::numeric)/100.0)::integer;
  elsif v_coupon.discount_type = 'amount' then
    v_discount := least(amount_before, v_coupon.discount_value);
  elsif v_coupon.discount_type = 'fixed_price' then
    v_after := least(amount_before, v_coupon.discount_value);
    v_discount := amount_before - v_after;
  else
    raise exception 'invalid_discount_type';
  end if;

  v_discount := greatest(0, least(v_discount, amount_before));
  v_after := amount_before - v_discount;

  insert into public.coupon_redemptions(
    coupon_id, redeemed_by_user_id, issued_to_user_id, issued_to_email,
    tournament_id, amount_before, discount_amount, amount_after, meta
  )
  values(
    v_coupon.id, v_user_id, v_coupon.issued_to_user_id, v_coupon.issued_to_email,
    redeem_coupon_for_tournament.tournament_id, amount_before, v_discount, v_after,
    jsonb_build_object('code', v_coupon.code, 'applies_to', v_coupon.applies_to, 'source', 'redeem_coupon_for_tournament')
  )
  returning id into v_redemption_id;

  if v_after = 0 then
    insert into public.tournament_entitlements(tournament_id, owner_id, source, source_ref, starts_at, ends_at)
    values (redeem_coupon_for_tournament.tournament_id, v_owner_id, 'coupon', v_redemption_id, v_now, v_now + interval '365 days');

    -- Issue referral rewards when coupon gives free upgrade
    PERFORM public.issue_referral_rewards(v_user_id, redeem_coupon_for_tournament.tournament_id);
  end if;

  return query select v_after, v_discount, 'redeemed';
end;
$$;
