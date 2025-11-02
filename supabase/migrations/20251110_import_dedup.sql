CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS fide_id text;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS name_normalized text GENERATED ALWAYS AS (
    CASE
      WHEN name IS NULL THEN NULL
      ELSE regexp_replace(lower(btrim(name)), '\\s+', ' ', 'g')
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS players_tournament_fide_id_idx
  ON public.players (tournament_id, fide_id)
  WHERE fide_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS players_tournament_city_idx
  ON public.players (tournament_id, city)
  WHERE city IS NOT NULL;

CREATE INDEX IF NOT EXISTS players_tournament_state_idx
  ON public.players (tournament_id, state)
  WHERE state IS NOT NULL;

CREATE INDEX IF NOT EXISTS players_tournament_name_trgm_idx
  ON public.players USING GIN (name_normalized gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.suggest_player_duplicates(
  p_tournament_id uuid,
  p_name text,
  p_dob date DEFAULT NULL,
  p_fide_id text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  player_id uuid,
  name text,
  rank integer,
  dob date,
  fide_id text,
  city text,
  state text,
  match_type text,
  match_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT
      p_tournament_id AS tournament_id,
      NULLIF(btrim(p_name), '') AS name,
      CASE
        WHEN NULLIF(btrim(p_name), '') IS NULL THEN NULL
        ELSE regexp_replace(lower(btrim(p_name)), '\\s+', ' ', 'g')
      END AS name_normalized,
      p_dob AS dob,
      NULLIF(btrim(p_fide_id), '') AS fide_id,
      NULLIF(btrim(p_city), '') AS city,
      NULLIF(btrim(p_state), '') AS state,
      GREATEST(1, COALESCE(p_limit, 10)) AS limit_value
  ),
  ranked_matches AS (
    SELECT
      pl.id,
      pl.name,
      pl.rank,
      pl.dob,
      pl.fide_id,
      pl.city,
      pl.state,
      match_details.match_type,
      match_details.match_score,
      ROW_NUMBER() OVER (
        PARTITION BY pl.id
        ORDER BY
          match_details.priority,
          match_details.match_score DESC NULLS LAST
      ) AS rn
    FROM input i
    JOIN public.players pl
      ON pl.tournament_id = i.tournament_id
    WHERE (
      i.fide_id IS NOT NULL AND pl.fide_id IS NOT NULL AND pl.fide_id = i.fide_id
    ) OR (
      i.name_normalized IS NOT NULL AND pl.name_normalized IS NOT NULL AND similarity(pl.name_normalized, i.name_normalized) >= 0.65
    ) OR (
      i.name_normalized IS NOT NULL AND pl.name_normalized IS NOT NULL AND pl.name_normalized = i.name_normalized
      AND i.dob IS NOT NULL AND pl.dob IS NOT NULL AND pl.dob = i.dob
    )
    JOIN LATERAL (
      SELECT DISTINCT ON (pl.id, priority_group)
        priority_group AS match_type,
        priority_rank AS priority,
        match_score
      FROM (
        SELECT
          'fide_id'::text AS priority_group,
          1 AS priority_rank,
          1.0::numeric AS match_score
        WHERE i.fide_id IS NOT NULL AND pl.fide_id IS NOT NULL AND pl.fide_id = i.fide_id

        UNION ALL

        SELECT
          'name_dob_exact',
          2,
          0.95
        WHERE i.name_normalized IS NOT NULL AND pl.name_normalized IS NOT NULL
          AND pl.name_normalized = i.name_normalized
          AND i.dob IS NOT NULL AND pl.dob IS NOT NULL AND pl.dob = i.dob

        UNION ALL

        SELECT
          'name_location_strong',
          3,
          similarity(pl.name_normalized, i.name_normalized)::numeric
        WHERE i.name_normalized IS NOT NULL AND pl.name_normalized IS NOT NULL
          AND similarity(pl.name_normalized, i.name_normalized) >= 0.7
          AND (
            (i.city IS NOT NULL AND pl.city IS NOT NULL AND lower(pl.city) = lower(i.city)) OR
            (i.state IS NOT NULL AND pl.state IS NOT NULL AND lower(pl.state) = lower(i.state))
          )

        UNION ALL

        SELECT
          'name_dob_fuzzy',
          4,
          similarity(pl.name_normalized, i.name_normalized)::numeric
        WHERE i.name_normalized IS NOT NULL AND pl.name_normalized IS NOT NULL
          AND similarity(pl.name_normalized, i.name_normalized) >= 0.7
          AND i.dob IS NOT NULL AND pl.dob IS NOT NULL AND pl.dob = i.dob

        UNION ALL

        SELECT
          'name_fuzzy',
          5,
          similarity(pl.name_normalized, i.name_normalized)::numeric
        WHERE i.name_normalized IS NOT NULL AND pl.name_normalized IS NOT NULL
          AND similarity(pl.name_normalized, i.name_normalized) >= 0.65
      ) fuzzy(priority_group, priority_rank, match_score)
      WHERE match_score IS NOT NULL
      ORDER BY priority_group, priority_rank
    ) AS match_details ON TRUE
  )
  SELECT
    id AS player_id,
    name,
    rank,
    dob,
    fide_id,
    city,
    state,
    match_type,
    match_score
  FROM ranked_matches
  WHERE rn = 1
  ORDER BY
    CASE match_type
      WHEN 'fide_id' THEN 1
      WHEN 'name_dob_exact' THEN 2
      WHEN 'name_location_strong' THEN 3
      WHEN 'name_dob_fuzzy' THEN 4
      ELSE 5
    END,
    match_score DESC NULLS LAST
  LIMIT (SELECT limit_value FROM input);
$$;

REVOKE ALL ON FUNCTION public.suggest_player_duplicates(uuid, text, date, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_player_duplicates(uuid, text, date, text, text, text, integer) TO authenticated;
