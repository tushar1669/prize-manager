-- ================================================================
-- A1) Create profiles table to store user email for approval inbox
-- ================================================================

-- Create profiles table if not exists
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- A2) Create master_allowlist table for server-side validation
-- ================================================================

CREATE TABLE IF NOT EXISTS public.master_allowlist (
  email text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

-- Seed the allowlist with the master email
INSERT INTO public.master_allowlist (email) 
VALUES ('chess.tushar@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- Enable RLS on master_allowlist (only master can read)
ALTER TABLE public.master_allowlist ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- Create is_master() function for server-side master validation
-- ================================================================

CREATE OR REPLACE FUNCTION public.is_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.master_allowlist ma
    INNER JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE ma.email = (auth.jwt() ->> 'email')
      AND ur.role = 'master'
      AND ur.is_verified = true
  )
$$;

-- ================================================================
-- Trigger to auto-populate profiles on auth.users insert
-- ================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into profiles
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  
  -- Also ensure they have an organizer role (unverified)
  INSERT INTO public.user_roles (user_id, role, is_verified)
  VALUES (NEW.id, 'organizer', false)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users if not exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================================
-- RLS Policies for profiles table
-- ================================================================

-- Users can read their own profile
DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

-- Users can update their own profile (future-proofing)
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- Master can read all profiles (for approval inbox)
DROP POLICY IF EXISTS "master_read_all_profiles" ON public.profiles;
CREATE POLICY "master_read_all_profiles" ON public.profiles
  FOR SELECT USING (public.is_master());

-- ================================================================
-- RLS Policies for master_allowlist table
-- ================================================================

-- Only master can read allowlist
DROP POLICY IF EXISTS "master_read_allowlist" ON public.master_allowlist;
CREATE POLICY "master_read_allowlist" ON public.master_allowlist
  FOR SELECT USING (public.is_master());

-- ================================================================
-- Update user_roles RLS policies to be stricter
-- ================================================================

-- Drop old policies
DROP POLICY IF EXISTS "users_read_own_roles" ON public.user_roles;
DROP POLICY IF EXISTS "bootstrap_first_master_insert" ON public.user_roles;
DROP POLICY IF EXISTS "bootstrap_first_master_update" ON public.user_roles;

-- Users can read their own role
CREATE POLICY "users_read_own_roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

-- Master can read all roles (for approval inbox)
DROP POLICY IF EXISTS "master_read_all_roles" ON public.user_roles;
CREATE POLICY "master_read_all_roles" ON public.user_roles
  FOR SELECT USING (public.is_master());

-- Users can only insert their own row with role=organizer and is_verified=false
DROP POLICY IF EXISTS "users_insert_own_organizer_role" ON public.user_roles;
CREATE POLICY "users_insert_own_organizer_role" ON public.user_roles
  FOR INSERT WITH CHECK (
    user_id = auth.uid() 
    AND role = 'organizer' 
    AND is_verified = false
  );

-- Only master can update other users' verification status
DROP POLICY IF EXISTS "master_update_verification" ON public.user_roles;
CREATE POLICY "master_update_verification" ON public.user_roles
  FOR UPDATE USING (public.is_master());

-- Bootstrap: allowlisted email can claim master if no master exists
DROP POLICY IF EXISTS "allowlist_bootstrap_master" ON public.user_roles;
CREATE POLICY "allowlist_bootstrap_master" ON public.user_roles
  FOR INSERT WITH CHECK (
    -- User is in allowlist
    EXISTS (SELECT 1 FROM public.master_allowlist WHERE email = (auth.jwt() ->> 'email'))
    -- No master exists yet
    AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'master')
    -- Setting self as master
    AND user_id = auth.uid()
    AND role = 'master'
  );

-- ================================================================
-- Update bootstrap_master function with server-side allowlist check
-- ================================================================

CREATE OR REPLACE FUNCTION public.bootstrap_master()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_master_count int;
  current_user_id uuid;
  current_user_email text;
  is_allowlisted boolean;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get user email from JWT
  current_user_email := auth.jwt() ->> 'email';
  
  -- SERVER-SIDE CHECK: Verify email is in allowlist
  SELECT EXISTS (
    SELECT 1 FROM public.master_allowlist 
    WHERE email = current_user_email
  ) INTO is_allowlisted;
  
  IF NOT is_allowlisted THEN
    RAISE EXCEPTION 'Your email is not authorized for master access';
  END IF;

  SELECT COUNT(*) INTO existing_master_count
  FROM public.user_roles
  WHERE role = 'master';

  IF existing_master_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'A master already exists. Contact the existing master to grant roles.'
    );
  END IF;

  INSERT INTO public.user_roles (user_id, role, is_verified)
  VALUES (current_user_id, 'master', true)
  ON CONFLICT (user_id, role)
  DO UPDATE SET is_verified = true;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'You are now the master organizer',
    'user_id', current_user_id
  );
END;
$$;

-- ================================================================
-- Backfill profiles for existing users
-- ================================================================

INSERT INTO public.profiles (id, email)
SELECT au.id, au.email
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = au.id)
ON CONFLICT (id) DO NOTHING;