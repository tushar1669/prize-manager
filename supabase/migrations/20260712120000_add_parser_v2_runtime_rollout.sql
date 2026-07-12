-- Runtime rollout control for AI Parser V2 beta.
-- Forward-only: adds a single feature row, safe RPCs, and audit on update.

CREATE TABLE IF NOT EXISTS public.platform_feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

INSERT INTO public.platform_feature_flags (key, enabled, description)
VALUES (
  'brochure_parser_v2',
  false,
  'Controls whether organizers can see and invoke AI Parser V2 beta.'
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_feature_flags FROM anon;
REVOKE ALL ON TABLE public.platform_feature_flags FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.platform_feature_flags FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.platform_feature_flags FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_brochure_parser_v2_rollout_state()
RETURNS TABLE(enabled boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT COALESCE((
    SELECT pff.enabled
    FROM public.platform_feature_flags pff
    WHERE pff.key = 'brochure_parser_v2'
    LIMIT 1
  ), false) AS enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.get_brochure_parser_v2_rollout_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_brochure_parser_v2_rollout_state() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_brochure_parser_v2_rollout_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_brochure_parser_v2_rollout_state(p_enabled boolean)
RETURNS TABLE(enabled boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_old_enabled boolean;
  v_new_enabled boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.platform_feature_flags (key, enabled, description, updated_at, updated_by)
  VALUES (
    'brochure_parser_v2',
    false,
    'Controls whether organizers can see and invoke AI Parser V2 beta.',
    now(),
    NULL
  )
  ON CONFLICT (key) DO NOTHING;

  SELECT pff.enabled
  INTO v_old_enabled
  FROM public.platform_feature_flags pff
  WHERE pff.key = 'brochure_parser_v2'
  FOR UPDATE;

  UPDATE public.platform_feature_flags pff
  SET enabled = p_enabled,
      updated_at = now(),
      updated_by = v_user_id
  WHERE pff.key = 'brochure_parser_v2'
  RETURNING pff.enabled INTO v_new_enabled;

  INSERT INTO public.audit_events (
    event_type,
    message,
    reference_id,
    severity,
    user_id,
    context
  ) VALUES (
    'parser_v2_rollout_update',
    'AI Parser V2 rollout state updated',
    'brochure_parser_v2',
    'info',
    v_user_id,
    jsonb_build_object(
      'feature_key', 'brochure_parser_v2',
      'old_enabled', COALESCE(v_old_enabled, false),
      'new_enabled', v_new_enabled
    )
  );

  RETURN QUERY SELECT v_new_enabled AS enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.set_brochure_parser_v2_rollout_state(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_brochure_parser_v2_rollout_state(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_brochure_parser_v2_rollout_state(boolean) TO authenticated;
