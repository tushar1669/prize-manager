-- Phase 4 + 6: queue welcome email jobs and wire server-side onboarding.
CREATE TABLE IF NOT EXISTS public.welcome_email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  coupon_code text NOT NULL,
  coupon_expires_at timestamptz NOT NULL,
  template_version text NOT NULL DEFAULT 'v1',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT welcome_email_queue_user_template_unique UNIQUE (user_id, template_version)
);

ALTER TABLE public.welcome_email_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS welcome_email_queue_status_created_idx
  ON public.welcome_email_queue (status, created_at);

CREATE OR REPLACE FUNCTION public.welcome_email_queue_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS welcome_email_queue_set_updated_at ON public.welcome_email_queue;
CREATE TRIGGER welcome_email_queue_set_updated_at
BEFORE UPDATE ON public.welcome_email_queue
FOR EACH ROW
EXECUTE FUNCTION public.welcome_email_queue_set_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_welcome_email_job(
  p_user_id uuid,
  p_email text,
  p_template_version text DEFAULT 'v1'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coupon_id uuid;
  v_coupon_code text;
  v_coupon_expires_at timestamptz;
  v_job_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'missing_user_id';
  END IF;

  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'missing_email';
  END IF;

  v_coupon_id := public.issue_welcome_onboarding_coupon(p_user_id, p_email, p_user_id);

  SELECT c.code, c.ends_at
  INTO v_coupon_code, v_coupon_expires_at
  FROM public.coupons c
  WHERE c.id = v_coupon_id;

  INSERT INTO public.welcome_email_queue (
    user_id,
    email,
    coupon_id,
    coupon_code,
    coupon_expires_at,
    template_version,
    status,
    attempts,
    last_error,
    sent_at
  ) VALUES (
    p_user_id,
    p_email,
    v_coupon_id,
    v_coupon_code,
    v_coupon_expires_at,
    COALESCE(NULLIF(btrim(p_template_version), ''), 'v1'),
    'pending',
    0,
    NULL,
    NULL
  )
  ON CONFLICT (user_id, template_version) DO UPDATE
  SET email = EXCLUDED.email,
      coupon_id = EXCLUDED.coupon_id,
      coupon_code = EXCLUDED.coupon_code,
      coupon_expires_at = EXCLUDED.coupon_expires_at
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert/update profile.
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  -- Organizer role stays default, now always auto-verified.
  INSERT INTO public.user_roles (user_id, role, is_verified)
  VALUES (NEW.id, 'organizer', true)
  ON CONFLICT (user_id, role)
  DO UPDATE SET is_verified = true
  WHERE public.user_roles.role = 'organizer'
    AND public.user_roles.is_verified = false;

  -- Issue exactly one onboarding coupon.
  PERFORM public.issue_welcome_onboarding_coupon(NEW.id, NEW.email, NEW.id);

  -- Queue welcome email idempotently, without blocking signup on queue failure.
  BEGIN
    PERFORM public.enqueue_welcome_email_job(NEW.id, NEW.email, 'v1');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_welcome_email_job failed for user %', NEW.id;
  END;

  RETURN NEW;
END;
$$;
