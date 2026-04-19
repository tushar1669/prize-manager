-- Lock referral attribution to first verified signup event for genuinely new accounts.
-- Prevents applying referrals on normal sign-in or password reset sessions.

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
  v_user_created_at timestamptz;
  v_user_email_confirmed_at timestamptz;
  v_user_last_sign_in_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  v_normalized := upper(trim(referral_code));
  IF v_normalized IS NULL OR v_normalized = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  SELECT
    au.created_at,
    au.email_confirmed_at,
    au.last_sign_in_at
  INTO
    v_user_created_at,
    v_user_email_confirmed_at,
    v_user_last_sign_in_at
  FROM auth.users au
  WHERE au.id = v_uid;

  IF v_user_created_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  -- Canonical attribution window:
  -- only allow during the first verified auth event for a newly-created account.
  IF v_user_email_confirmed_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_not_verified');
  END IF;

  IF v_user_last_sign_in_at IS NULL
     OR abs(extract(epoch FROM (v_user_last_sign_in_at - v_user_email_confirmed_at))) > 300 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_new_signup_event');
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
  VALUES (v_code_row.user_id, v_uid, v_code_row.id)
  ON CONFLICT (referred_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_applied');
  END IF;

  RETURN jsonb_build_object('ok', true, 'reason', 'applied');
END;
$$;
