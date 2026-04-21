-- Reconcile organizer onboarding drift.
-- Root cause (most likely): a legacy self-service policy allowed organizer rows with is_verified=false.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.user_roles (user_id, role, is_verified)
  VALUES (NEW.id, 'organizer', true)
  ON CONFLICT (user_id, role) DO UPDATE SET is_verified = EXCLUDED.is_verified;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "users_insert_own_organizer_role" ON public.user_roles;
CREATE POLICY "users_insert_own_organizer_role" ON public.user_roles
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'organizer'
    AND is_verified = true
  );

UPDATE public.user_roles
SET is_verified = true
WHERE role = 'organizer'
  AND is_verified = false;
