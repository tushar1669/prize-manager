-- Issue exactly one welcome onboarding coupon per authenticated organizer/master user.

CREATE TABLE public.welcome_onboarding_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  coupon_id uuid NOT NULL REFERENCES public.coupons(id),
  coupon_code text NOT NULL,
  email text,
  email_status text NOT NULL DEFAULT 'pending',
  email_enqueued_at timestamptz NOT NULL DEFAULT now(),
  email_sent_at timestamptz NULL,
  email_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.welcome_onboarding_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_welcome_onboarding_reward"
  ON public.welcome_onboarding_rewards
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "master_read_all_welcome_onboarding_rewards"
  ON public.welcome_onboarding_rewards
  FOR SELECT
  USING (public.is_master());

CREATE TRIGGER set_welcome_onboarding_rewards_updated_at
  BEFORE UPDATE ON public.welcome_onboarding_rewards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.issue_welcome_onboarding_reward()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := auth.email();
  v_existing public.welcome_onboarding_rewards%rowtype;
  v_coupon_id uuid;
  v_code text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'created', false, 'reason', 'not_authenticated');
  END IF;

  IF NOT (
    public.has_role(v_uid, 'organizer'::public.app_role)
    OR public.has_role(v_uid, 'master'::public.app_role)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'created', false, 'reason', 'insufficient_role');
  END IF;

  SELECT *
  INTO v_existing
  FROM public.welcome_onboarding_rewards
  WHERE user_id = v_uid;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'coupon_code', v_existing.coupon_code,
      'email_status', v_existing.email_status
    );
  END IF;

  v_code := 'WELCOME-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.coupons (
    code,
    discount_type,
    discount_value,
    applies_to,
    max_redemptions,
    max_redemptions_per_user,
    is_active,
    issued_to_user_id,
    created_by
  ) VALUES (
    v_code,
    'percent',
    100,
    'tournament_pro',
    1,
    1,
    true,
    v_uid,
    v_uid
  )
  RETURNING id INTO v_coupon_id;

  INSERT INTO public.welcome_onboarding_rewards (
    user_id,
    coupon_id,
    coupon_code,
    email
  ) VALUES (
    v_uid,
    v_coupon_id,
    v_code,
    v_email
  );

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'coupon_code', v_code,
    'email_status', 'pending'
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT *
    INTO v_existing
    FROM public.welcome_onboarding_rewards
    WHERE user_id = v_uid;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'created', false,
        'coupon_code', v_existing.coupon_code,
        'email_status', v_existing.email_status
      );
    END IF;

    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_welcome_onboarding_reward() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_welcome_onboarding_reward() TO authenticated;
