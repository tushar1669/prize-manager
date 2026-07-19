-- Runtime rollout control for the brochure-import feature (Gate 2).
-- Mirrors the brochure_parser_v2 rollout pattern: a default-disabled flag row plus
-- SECURITY DEFINER get/set RPCs, so the feature can merge dark and be enabled per-environment
-- by a master without a deploy.

INSERT INTO public.platform_feature_flags (key, enabled, description)
VALUES (
  'brochure_import',
  false,
  'Controls whether organizers can see and use brochure import (upload -> extract -> review -> commit).'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_brochure_import_rollout_state()
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
    WHERE pff.key = 'brochure_import'
    LIMIT 1
  ), false) AS enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.get_brochure_import_rollout_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_brochure_import_rollout_state() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_brochure_import_rollout_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_brochure_import_rollout_state(p_enabled boolean)
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
    'brochure_import',
    false,
    'Controls whether organizers can see and use brochure import (upload -> extract -> review -> commit).',
    now(),
    NULL
  )
  ON CONFLICT (key) DO NOTHING;

  SELECT pff.enabled
  INTO v_old_enabled
  FROM public.platform_feature_flags pff
  WHERE pff.key = 'brochure_import'
  FOR UPDATE;

  UPDATE public.platform_feature_flags pff
  SET enabled = p_enabled,
      updated_at = now(),
      updated_by = v_user_id
  WHERE pff.key = 'brochure_import'
  RETURNING pff.enabled INTO v_new_enabled;

  INSERT INTO public.audit_events (
    event_type,
    message,
    reference_id,
    severity,
    user_id,
    context
  ) VALUES (
    'brochure_import_rollout_update',
    'Brochure import rollout state updated',
    'brochure_import',
    'info',
    v_user_id,
    jsonb_build_object(
      'feature_key', 'brochure_import',
      'old_enabled', COALESCE(v_old_enabled, false),
      'new_enabled', v_new_enabled
    )
  );

  RETURN QUERY SELECT v_new_enabled AS enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.set_brochure_import_rollout_state(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_brochure_import_rollout_state(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_brochure_import_rollout_state(boolean) TO authenticated;
