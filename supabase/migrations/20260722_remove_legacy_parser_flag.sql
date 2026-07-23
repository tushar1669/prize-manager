-- Phase D — legacy AI brochure parser removal.
--
-- The V1/V2 "assistive brochure draft" feature is gone from the app. This migration removes its
-- remaining database surface: the runtime rollout RPCs and the platform_feature_flags row that
-- gated the V2 beta. The brochure_import flag (the new extraction engine) is untouched.

DROP FUNCTION IF EXISTS public.set_brochure_parser_v2_rollout_state(boolean);
DROP FUNCTION IF EXISTS public.get_brochure_parser_v2_rollout_state();

DELETE FROM public.platform_feature_flags WHERE key = 'brochure_parser_v2';
