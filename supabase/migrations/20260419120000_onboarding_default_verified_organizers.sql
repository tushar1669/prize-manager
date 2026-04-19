-- Align organizer onboarding with current product behavior:
-- 1) New users receive organizer role as verified by default
-- 2) Existing unverified organizers are backfilled to verified

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

UPDATE public.user_roles
SET is_verified = true
WHERE role = 'organizer'
  AND is_verified = false;
