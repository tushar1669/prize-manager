-- Add group_label column to players table for generic Swiss-Manager Gr column support
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS group_label text;

-- Add comment for documentation
COMMENT ON COLUMN public.players.group_label IS 'Generic group label from Swiss-Manager Gr column. Used for custom group-based prize categories (e.g., Raipur, Section A, Senior).';

-- Update import_replace_players function to handle new group_label column
CREATE OR REPLACE FUNCTION public.import_replace_players(tournament_id uuid, players jsonb)
 RETURNS TABLE(inserted_count integer, error_rows jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_errors jsonb := '[]'::jsonb;
  v_inserted integer := 0;
  v_tournament_id uuid := tournament_id;
begin
  -- Security: only owner of the tournament may call this
  perform 1
  from public.tournaments t
  where t.id = v_tournament_id
    and t.owner_id = auth.uid();

  if not found then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  -- Guard: payload must be a JSON array
  if players is null or jsonb_typeof(players) <> 'array' then
    return query select 0, '[]'::jsonb;
    return;
  end if;

  -- Step 1: detect duplicate ranks inside the uploaded JSON
  with payload as (
    select
      coalesce((p ->> 'row_index')::int, row_number() over ()) as row_index,
      (p ->> 'rank')::int as rank
    from jsonb_array_elements(players) as p
  ),
  dup_ranks as (
    select rank, array_agg(row_index) as rows
    from payload
    where rank is not null
    group by rank
    having count(*) > 1
  ),
  expanded_errors as (
    select
      unnest(d.rows) as row_index,
      d.rank
    from dup_ranks d
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'row_index', row_index,
          'rank', rank,
          'reason', 'Duplicate rank in upload (tournament rank must be unique).'
        )
      ),
      '[]'::jsonb
    )
  into v_errors
  from expanded_errors;

  -- If duplicates exist, return error rows for the workbook and abort
  if jsonb_array_length(v_errors) > 0 then
    return query select 0, v_errors;
    return;
  end if;

  -- Step 2: hard-replace existing players for this tournament
  delete from public.players pl
  where pl.tournament_id = v_tournament_id;

  -- Step 3: insert all uploaded players (now includes group_label)
  insert into public.players (
    rank,
    sno,
    name,
    rating,
    dob,
    dob_raw,
    gender,
    state,
    city,
    club,
    disability,
    special_notes,
    fide_id,
    unrated,
    federation,
    tournament_id,
    tags_json,
    warnings_json,
    group_label
  )
  select
    (p ->> 'rank')::int as rank,
    nullif(p ->> 'sno', '') as sno,
    nullif(p ->> 'name', '') as name,
    (p ->> 'rating')::int as rating,
    (p ->> 'dob')::date as dob,
    (p ->> 'dob_raw')::text as dob_raw,
    nullif(p ->> 'gender', '') as gender,
    nullif(p ->> 'state', '') as state,
    nullif(p ->> 'city', '') as city,
    nullif(p ->> 'club', '') as club,
    nullif(p ->> 'disability', '') as disability,
    nullif(p ->> 'special_notes', '') as special_notes,
    nullif(p ->> 'fide_id', '') as fide_id,
    coalesce((p ->> 'unrated')::boolean, false) as unrated,
    nullif(p ->> 'federation', '') as federation,
    v_tournament_id as tournament_id,
    coalesce(p ->> 'tags_json', '{}')::jsonb as tags_json,
    coalesce(p ->> 'warnings_json', '{}')::jsonb as warnings_json,
    nullif(p ->> 'group_label', '') as group_label
  from jsonb_array_elements(players) as p;

  get diagnostics v_inserted = row_count;

  -- Success: no row-level errors here, we already checked duplicates
  return query select coalesce(v_inserted, 0), '[]'::jsonb;
end;
$function$;