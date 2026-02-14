-- Harden coupon redemption limits:
-- 1) A user can redeem a given coupon only once across all tournaments.
-- 2) Coupons default to max 3 total redemptions when max_redemptions is not configured.

ALTER TABLE public.coupons
  ALTER COLUMN max_redemptions SET DEFAULT 3;

CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_coupon_user_unique_idx
  ON public.coupon_redemptions (coupon_id, redeemed_by_user_id);

DROP FUNCTION IF EXISTS public.redeem_coupon_for_tournament(text, uuid, integer);
CREATE OR REPLACE FUNCTION public.redeem_coupon_for_tournament(
  code text,
  tournament_id uuid,
  amount_before integer
)
RETURNS TABLE (
  amount_after integer,
  discount_amount integer,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon public.coupons%ROWTYPE;
  v_user_id uuid;
  v_discount integer := 0;
  v_after integer := 0;
  v_total_redemptions integer := 0;
  v_user_redemptions integer := 0;
  v_code text;
  v_owner_id uuid;
  v_redemption_id uuid;
  v_now timestamptz := now();
  v_effective_max_redemptions integer := 3;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF amount_before IS NULL OR amount_before < 0 THEN
    RAISE EXCEPTION 'invalid_amount_before';
  END IF;

  SELECT t.owner_id
  INTO v_owner_id
  FROM public.tournaments t
  WHERE t.id = redeem_coupon_for_tournament.tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  IF NOT (
    v_owner_id = v_user_id
    OR public.has_role(v_user_id, 'master'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not_authorized_for_tournament';
  END IF;

  v_code := upper(trim(code));
  IF v_code IS NULL OR v_code = '' THEN
    RAISE EXCEPTION 'missing_code';
  END IF;

  SELECT *
  INTO v_coupon
  FROM public.coupons c
  WHERE c.code = v_code
    AND c.applies_to = 'tournament_pro'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coupon_not_found';
  END IF;

  IF NOT v_coupon.is_active THEN
    RAISE EXCEPTION 'coupon_inactive';
  END IF;

  IF v_coupon.starts_at IS NOT NULL AND v_now < v_coupon.starts_at THEN
    RAISE EXCEPTION 'coupon_not_started';
  END IF;

  IF v_coupon.ends_at IS NOT NULL AND v_now > v_coupon.ends_at THEN
    RAISE EXCEPTION 'coupon_expired';
  END IF;

  IF v_coupon.issued_to_user_id IS NOT NULL AND v_coupon.issued_to_user_id <> v_user_id THEN
    RAISE EXCEPTION 'coupon_not_issued_to_user';
  END IF;

  v_effective_max_redemptions := COALESCE(v_coupon.max_redemptions, 3);

  SELECT COUNT(*) INTO v_total_redemptions
  FROM public.coupon_redemptions cr
  WHERE cr.coupon_id = v_coupon.id;

  IF v_total_redemptions >= v_effective_max_redemptions THEN
    RAISE EXCEPTION 'max_redemptions_reached';
  END IF;

  SELECT COUNT(*) INTO v_user_redemptions
  FROM public.coupon_redemptions cr
  WHERE cr.coupon_id = v_coupon.id
    AND cr.redeemed_by_user_id = v_user_id;

  IF v_user_redemptions >= 1 THEN
    RAISE EXCEPTION 'max_redemptions_per_user_reached';
  END IF;

  IF v_coupon.discount_type = 'percent' THEN
    v_discount := floor((amount_before::numeric * v_coupon.discount_value::numeric) / 100.0)::integer;
  ELSIF v_coupon.discount_type = 'amount' THEN
    v_discount := LEAST(amount_before, v_coupon.discount_value);
  ELSIF v_coupon.discount_type = 'fixed_price' THEN
    v_after := LEAST(amount_before, v_coupon.discount_value);
    v_discount := amount_before - v_after;
  ELSE
    RAISE EXCEPTION 'invalid_discount_type';
  END IF;

  v_discount := GREATEST(0, LEAST(v_discount, amount_before));
  v_after := amount_before - v_discount;

  INSERT INTO public.coupon_redemptions (
    coupon_id,
    redeemed_by_user_id,
    issued_to_user_id,
    issued_to_email,
    tournament_id,
    amount_before,
    discount_amount,
    amount_after,
    meta
  ) VALUES (
    v_coupon.id,
    v_user_id,
    v_coupon.issued_to_user_id,
    v_coupon.issued_to_email,
    redeem_coupon_for_tournament.tournament_id,
    amount_before,
    v_discount,
    v_after,
    jsonb_build_object(
      'code', v_coupon.code,
      'applies_to', v_coupon.applies_to,
      'source', 'redeem_coupon_for_tournament'
    )
  )
  RETURNING id INTO v_redemption_id;

  IF v_after = 0 THEN
    INSERT INTO public.tournament_entitlements (
      tournament_id,
      owner_id,
      source,
      source_ref,
      starts_at,
      ends_at
    ) VALUES (
      redeem_coupon_for_tournament.tournament_id,
      v_owner_id,
      'coupon',
      v_redemption_id,
      v_now,
      v_now + interval '30 days'
    );
  END IF;

  RETURN QUERY SELECT v_after, v_discount, 'redeemed'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_coupon_for_tournament(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_coupon_for_tournament(text, uuid, integer) TO authenticated;
