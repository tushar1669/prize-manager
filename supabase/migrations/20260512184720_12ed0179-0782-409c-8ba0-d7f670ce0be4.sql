
-- 1) Drop weaker is_master overload + the policy that uses it
DROP POLICY IF EXISTS profiles_select_master ON public.profiles;
DROP FUNCTION IF EXISTS public.is_master(uuid);

-- 2) Prevent privilege escalation: users cannot self-grant verified status.
DROP POLICY IF EXISTS users_insert_own_organizer_role ON public.user_roles;
CREATE POLICY users_insert_own_organizer_role
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'organizer'::app_role
  AND is_verified = false
);

-- 3) Restrict anon SELECT on players to non-sensitive columns only.
REVOKE SELECT ON public.players FROM anon;
GRANT SELECT (
  id, tournament_id, rank, name, full_name, rating, gender, club, state,
  city, fide_id, sno, unrated, federation, group_label, type_label,
  team, points, tags_json, warnings_json, created_at, updated_at
) ON public.players TO anon;

-- 4) Drop unused sensitive snapshot columns from referrals
ALTER TABLE public.referrals DROP COLUMN IF EXISTS referred_email;
ALTER TABLE public.referrals DROP COLUMN IF EXISTS referred_label;

-- 5) Brochures: allow owners to delete their own files
CREATE POLICY organizers_delete_brochures_for_owned_tournaments
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'brochures'
  AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(objects.name))[1]
      AND t.deleted_at IS NULL
      AND t.owner_id = auth.uid()
  )
);

-- 6) Imports bucket: scoped owner-only policies
CREATE POLICY organizers_insert_imports_for_owned_tournaments
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'imports'
  AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(objects.name))[1]
      AND t.deleted_at IS NULL
      AND t.owner_id = auth.uid()
  )
);

CREATE POLICY organizers_select_imports_for_owned_tournaments
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'imports'
  AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(objects.name))[1]
      AND t.deleted_at IS NULL
      AND t.owner_id = auth.uid()
  )
);

CREATE POLICY organizers_update_imports_for_owned_tournaments
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'imports'
  AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(objects.name))[1]
      AND t.deleted_at IS NULL
      AND t.owner_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'imports'
  AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(objects.name))[1]
      AND t.deleted_at IS NULL
      AND t.owner_id = auth.uid()
  )
);

CREATE POLICY organizers_delete_imports_for_owned_tournaments
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'imports'
  AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(objects.name))[1]
      AND t.deleted_at IS NULL
      AND t.owner_id = auth.uid()
  )
);

-- 7) Convert profile_completion view to security_invoker so RLS of caller applies
ALTER VIEW public.profile_completion SET (security_invoker = on);

-- 8) Pin search_path on remaining public functions to silence mutable-search_path warnings
ALTER FUNCTION public.coupon_origin_from_code(text) SET search_path = public;
ALTER FUNCTION public.submit_tournament_payment_claim(uuid, integer, text) SET search_path = public;
