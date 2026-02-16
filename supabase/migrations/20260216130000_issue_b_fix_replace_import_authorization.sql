-- Issue B: allow master users to replace-import on tournaments they don't own.
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
  v_actor_user_id uuid := auth.uid();
begin
  -- Security: tournament owner or master role may call this
  perform 1
  from public.tournaments t
  where t.id = v_tournament_id
    and (
      t.owner_id = v_actor_user_id
      or public.has_role(v_actor_user_id, 'master')
    );

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

  -- Step 3: insert all uploaded players (includes group_label, type_label, full_name)
  insert into public.players (
    rank,
    sno,
    name,
    full_name,
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
    group_label,
    type_label
  )
  select
    (p ->> 'rank')::int as rank,
    nullif(p ->> 'sno', '') as sno,
    nullif(p ->> 'name', '') as name,
    nullif(p ->> 'full_name', '') as full_name,
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
    nullif(p ->> 'group_label', '') as group_label,
    nullif(p ->> 'type_label', '') as type_label
  from jsonb_array_elements(players) as p;

  get diagnostics v_inserted = row_count;

  -- Lightweight audit for replace-mode imports.
  insert into public.import_logs (
    tournament_id,
    imported_by,
    imported_at,
    source,
    total_rows,
    accepted_rows,
    skipped_rows,
    meta
  ) values (
    v_tournament_id,
    v_actor_user_id,
    now(),
    'unknown',
    coalesce(jsonb_array_length(players), 0),
    coalesce(v_inserted, 0),
    0,
    jsonb_build_object('mode', 'replace')
  );

  -- Success: no row-level errors here, we already checked duplicates
  return query select coalesce(v_inserted, 0), '[]'::jsonb;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.import_replace_players(uuid, jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
