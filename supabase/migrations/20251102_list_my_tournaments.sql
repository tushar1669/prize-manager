-- List My Tournaments RPC and supporting helpers

-- Efficient index for owner-based listings
CREATE INDEX IF NOT EXISTS tournaments_owner_created_idx
  ON public.tournaments(owner_id, created_at DESC);

-- Ensure has_role helper exists (for legacy databases missing the initial migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'has_role'
      AND pg_get_function_identity_arguments(p.oid) = '_user_id uuid, _role app_role'
  ) THEN
    EXECUTE $$
      CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT EXISTS (
          SELECT 1
          FROM public.user_roles
          WHERE user_id = _user_id
            AND role = _role
        );
      $$;
    $$;
  END IF;
END
$$;

-- RPC to list tournaments belonging to the authenticated organizer
CREATE OR REPLACE FUNCTION public.list_my_tournaments(include_all boolean DEFAULT false)
RETURNS TABLE (
  id uuid,
  title text,
  status text,
  start_date date,
  end_date date,
  venue text,
  city text,
  owner_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_published boolean,
  public_slug text,
  latest_publication_slug text,
  latest_publication_version integer,
  latest_publication_request_id uuid,
  latest_publication_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_context AS (
    SELECT
      auth.uid() AS user_id,
      public.has_role(auth.uid(), 'master') AS is_master
  )
  SELECT
    t.id,
    t.title,
    t.status,
    t.start_date,
    t.end_date,
    t.venue,
    t.city,
    t.owner_id,
    t.created_at,
    t.updated_at,
    t.is_published,
    t.public_slug,
    pub.slug AS latest_publication_slug,
    pub.version AS latest_publication_version,
    pub.request_id AS latest_publication_request_id,
    pub.published_at AS latest_publication_at
  FROM public.tournaments t
  CROSS JOIN current_context ctx
  LEFT JOIN LATERAL (
    SELECT p.slug, p.version, p.request_id, p.published_at
    FROM public.publications p
    WHERE p.tournament_id = t.id
      AND p.is_active = true
    ORDER BY p.version DESC
    LIMIT 1
  ) pub ON TRUE
  WHERE ctx.user_id IS NOT NULL
    AND (
      t.owner_id = ctx.user_id
      OR (ctx.is_master AND include_all)
    )
  ORDER BY t.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_my_tournaments(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_tournaments(boolean) TO authenticated;
