-- Phase 2: issue exactly one onboarding welcome coupon per user.
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS origin text;

CREATE INDEX IF NOT EXISTS coupons_origin_idx
  ON public.coupons (origin);

CREATE UNIQUE INDEX IF NOT EXISTS coupons_welcome_onboarding_one_per_user_idx
  ON public.coupons (issued_to_user_id)
  WHERE origin = 'welcome_onboarding' AND issued_to_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.issue_welcome_onboarding_coupon(
  p_user_id uuid,
  p_email text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coupon_id uuid;
  v_code text;
  v_attempts integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'missing_user_id';
  END IF;

  SELECT c.id
  INTO v_coupon_id
  FROM public.coupons c
  WHERE c.issued_to_user_id = p_user_id
    AND c.origin = 'welcome_onboarding'
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF v_coupon_id IS NOT NULL THEN
    RETURN v_coupon_id;
  END IF;

  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      EXIT;
    END IF;

    v_code := 'WELCOME-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    INSERT INTO public.coupons (
      code,
      discount_type,
      discount_value,
      applies_to,
      max_redemptions,
      max_redemptions_per_user,
      is_active,
      starts_at,
      ends_at,
      issued_to_user_id,
      issued_to_email,
      created_by,
      origin
    ) VALUES (
      v_code,
      'percent',
      100,
      'tournament_pro',
      1,
      1,
      true,
      now(),
      now() + interval '30 days',
      p_user_id,
      p_email,
      COALESCE(p_created_by, p_user_id),
      'welcome_onboarding'
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_coupon_id;

    IF v_coupon_id IS NOT NULL THEN
      RETURN v_coupon_id;
    END IF;

    SELECT c.id
    INTO v_coupon_id
    FROM public.coupons c
    WHERE c.issued_to_user_id = p_user_id
      AND c.origin = 'welcome_onboarding'
    ORDER BY c.created_at ASC
    LIMIT 1;

    IF v_coupon_id IS NOT NULL THEN
      RETURN v_coupon_id;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'welcome_coupon_issue_failed';
END;
$$;
