-- Phase 1: auto-approve organizer onboarding and backfill stranded unverified organizers.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Preserve existing profile upsert behavior.
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  -- Keep organizer role assignment, now auto-verified.
  INSERT INTO public.user_roles (user_id, role, is_verified)
  VALUES (NEW.id, 'organizer', true)
  ON CONFLICT (user_id, role)
  DO UPDATE SET is_verified = true
  WHERE public.user_roles.role = 'organizer'
    AND public.user_roles.is_verified = false;

  RETURN NEW;
END;
$$;

-- One-time safe backfill: prevent existing organizers from being stranded in old pending flow.
UPDATE public.user_roles
SET is_verified = true
WHERE role = 'organizer'
  AND is_verified = false;
