-- Fix the data leak: list_my_tournaments was returning ALL tournaments
-- regardless of owner. Now it properly filters by owner_id when include_all=false.

CREATE OR REPLACE FUNCTION public.list_my_tournaments(include_all boolean DEFAULT false)
 RETURNS SETOF tournaments
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * 
  FROM public.tournaments
  WHERE 
    -- If include_all AND caller is master, return all tournaments
    (include_all = true AND public.is_master())
    OR
    -- Otherwise, only return tournaments owned by the current user
    (owner_id = auth.uid())
  ORDER BY start_date DESC NULLS LAST, created_at DESC;
$function$;