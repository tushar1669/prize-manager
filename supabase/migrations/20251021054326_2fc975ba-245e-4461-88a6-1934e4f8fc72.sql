-- Add public columns to tournaments
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_slug text,
  ADD COLUMN IF NOT EXISTS chessresults_url text,
  ADD COLUMN IF NOT EXISTS public_results_url text;

CREATE UNIQUE INDEX IF NOT EXISTS tournaments_public_slug_key
  ON public.tournaments(public_slug)
  WHERE public_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS tournaments_is_published_idx
  ON public.tournaments(is_published)
  WHERE is_published = true;

COMMENT ON COLUMN public.tournaments.is_published IS 'Whether this tournament is visible on public pages';
COMMENT ON COLUMN public.tournaments.public_slug IS 'Unique slug for public URL';
COMMENT ON COLUMN public.tournaments.chessresults_url IS 'External ChessResults.com link';
COMMENT ON COLUMN public.tournaments.public_results_url IS 'External final results link (overrides internal results page)';

-- Add is_verified to user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_roles.is_verified IS 'User verified by master to create tournaments';

-- Public RLS policies for tournaments
CREATE POLICY "anon_read_published_tournaments"
  ON public.tournaments
  FOR SELECT
  TO anon
  USING (is_published = true);

-- Public RLS for categories
CREATE POLICY "anon_read_published_categories"
  ON public.categories
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = categories.tournament_id
        AND t.is_published = true
    )
  );

-- Public RLS for prizes
CREATE POLICY "anon_read_published_prizes"
  ON public.prizes
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.categories c
      JOIN public.tournaments t ON t.id = c.tournament_id
      WHERE c.id = prizes.category_id
        AND t.is_published = true
    )
  );

-- Public RLS for allocations
CREATE POLICY "anon_read_published_allocations"
  ON public.allocations
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = allocations.tournament_id
        AND t.is_published = true
    )
  );

-- Public RLS for players
CREATE POLICY "anon_read_published_players"
  ON public.players
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = players.tournament_id
        AND t.is_published = true
    )
  );

-- Bootstrap master RPC
CREATE OR REPLACE FUNCTION public.bootstrap_master()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_master_count int;
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COUNT(*) INTO existing_master_count
  FROM public.user_roles
  WHERE role = 'master';

  IF existing_master_count > 0 THEN
    RAISE EXCEPTION 'A master already exists. Contact the existing master to grant roles.';
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

COMMENT ON FUNCTION public.bootstrap_master() IS 'Self-assign first master; fails if master already exists';

-- Bootstrap RLS policies
CREATE POLICY "bootstrap_first_master_insert"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'master')
    AND user_id = auth.uid()
    AND role = 'master'
  );

CREATE POLICY "bootstrap_first_master_update"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (
    NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'master' AND user_id <> auth.uid())
    AND user_id = auth.uid()
    AND role = 'master'
  )
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'master'
  );