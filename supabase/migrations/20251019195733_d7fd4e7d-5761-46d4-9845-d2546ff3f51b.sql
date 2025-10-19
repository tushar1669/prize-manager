-- Fix infinite recursion in tournaments RLS policies

-- Drop the recursive org_read_own_tournaments policy
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tournaments'
      AND policyname = 'org_read_own_tournaments'
  ) THEN
    DROP POLICY "org_read_own_tournaments" ON public.tournaments;
  END IF;
END$$;

-- Recreate org_read_own_tournaments without subqueries (non-recursive)
CREATE POLICY "org_read_own_tournaments"
ON public.tournaments
FOR SELECT
USING (owner_id = auth.uid());

-- Add public read for published tournaments (no subqueries)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tournaments'
      AND policyname = 'anyone_read_published_tournaments'
  ) THEN
    CREATE POLICY "anyone_read_published_tournaments"
    ON public.tournaments
    FOR SELECT
    USING (status = 'published');
  END IF;
END$$;