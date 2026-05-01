-- Ensure new signups are granted verified organizer role by default.
-- This corrects production drift where organizer rows were created with is_verified = false.

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

-- Optional/manual backfill (run only with explicit approval):
-- UPDATE public.user_roles
-- SET is_verified = true
-- WHERE role = 'organizer'
--   AND is_verified = false;
