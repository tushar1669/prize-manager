-- Create index for tournament lookups
CREATE INDEX IF NOT EXISTS tournaments_owner_created_idx 
  ON public.tournaments(owner_id, created_at DESC);

-- Create the list_my_tournaments RPC function
CREATE OR REPLACE FUNCTION public.list_my_tournaments(include_all boolean DEFAULT false)
RETURNS SETOF public.tournaments
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ctx AS (
    SELECT
      auth.uid() AS uid,
      public.has_role(auth.uid(), 'master') AS is_master
  )
  SELECT t.*
  FROM public.tournaments t
  CROSS JOIN ctx
  WHERE ctx.uid IS NOT NULL
    AND (
      t.owner_id = ctx.uid
      OR (include_all AND ctx.is_master)
    )
  ORDER BY COALESCE(t.start_date, t.created_at) DESC;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.list_my_tournaments(boolean) TO authenticated;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';