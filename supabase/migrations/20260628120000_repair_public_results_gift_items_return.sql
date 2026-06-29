-- Repair production public results RPC return shape so gift awards are exposed
-- only for rows already visible under the published-results preview/full-access gate.
-- No views in this repo reference this RPC; frontend calls it directly via Supabase RPC.
DROP FUNCTION IF EXISTS public.get_public_tournament_results(uuid);

CREATE FUNCTION public.get_public_tournament_results(tournament_id uuid)
RETURNS TABLE (
  prize_id uuid,
  player_name text,
  rank integer,
  rating integer,
  state text,
  category_name text,
  is_main boolean,
  place integer,
  cash_amount integer,
  has_trophy boolean,
  has_medal boolean,
  has_full_access boolean,
  preview_main_limit integer,
  other_categories_locked boolean,
  gift_items jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH
-- Source of truth: tournaments.is_published (see 20251102_publish_v2.sql published_tournaments view/filter).
published_tournament AS (
  SELECT t.id
  FROM public.tournaments t
  WHERE t.id = get_public_tournament_results.tournament_id
    AND t.is_published = true
),
access_state AS (
  SELECT *
  FROM public.get_tournament_access_state(get_public_tournament_results.tournament_id)
),
latest_version AS (
  SELECT MAX(a.version) AS version
  FROM public.allocations a
  JOIN published_tournament pt ON pt.id = a.tournament_id
  WHERE a.tournament_id = get_public_tournament_results.tournament_id
),
chosen_main_category AS (
  SELECT c.id
  FROM public.categories c
  JOIN published_tournament pt ON pt.id = c.tournament_id
  WHERE c.tournament_id = get_public_tournament_results.tournament_id
    AND c.is_active = true
  ORDER BY
    CASE
      WHEN lower(c.name) IN ('overall', 'overall ranking', 'overall results') THEN 0
      ELSE 1
    END,
    CASE WHEN COALESCE(c.is_main, false) THEN 0 ELSE 1 END,
    c.order_idx ASC NULLS LAST,
    c.created_at ASC NULLS LAST,
    c.name ASC,
    c.id ASC
  LIMIT 1
),
base_rows AS (
  SELECT
    a.prize_id,
    COALESCE(NULLIF(TRIM(p.full_name), ''), p.name, 'Unknown') AS player_name,
    p.rank,
    p.rating,
    p.state,
    c.name AS category_name,
    (c.id = cmc.id) AS is_main,
    pr.place,
    COALESCE(pr.cash_amount, 0)::integer AS cash_amount,
    COALESCE(pr.has_trophy, false) AS has_trophy,
    COALESCE(pr.has_medal, false) AS has_medal,
    COALESCE(pr.gift_items, '[]'::jsonb) AS gift_items,
    ROW_NUMBER() OVER (
      PARTITION BY (c.id = cmc.id)
      ORDER BY pr.place ASC, a.prize_id ASC
    ) AS main_rank
  FROM public.allocations a
  JOIN latest_version lv ON lv.version = a.version
  JOIN public.prizes pr ON pr.id = a.prize_id
  JOIN public.categories c ON c.id = pr.category_id
  JOIN chosen_main_category cmc ON true
  LEFT JOIN public.players p ON p.id = a.player_id
  WHERE a.tournament_id = get_public_tournament_results.tournament_id
    AND a.player_id IS NOT NULL
)
SELECT
  b.prize_id,
  b.player_name,
  b.rank,
  b.rating,
  b.state,
  b.category_name,
  b.is_main,
  b.place,
  b.cash_amount,
  b.has_trophy,
  b.has_medal,
  s.has_full_access,
  s.preview_main_limit,
  NOT s.has_full_access AS other_categories_locked,
  b.gift_items
FROM base_rows b
CROSS JOIN access_state s
WHERE s.has_full_access
   OR (
     s.has_full_access = false
     AND b.is_main = true
     AND b.main_rank <= COALESCE(s.preview_main_limit, 0)
   )
ORDER BY
  b.is_main DESC,
  b.place ASC,
  b.prize_id ASC;
$$;

REVOKE ALL ON FUNCTION public.get_public_tournament_results(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tournament_results(uuid) TO anon, authenticated, service_role;
