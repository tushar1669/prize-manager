begin;

create or replace function public.import_replace_players(
  p_tournament_id uuid,
  p_players jsonb
)
returns table (
  inserted_count integer,
  error_rows jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_inserted integer := 0;
begin
  perform 1
  from public.tournaments t
  where t.id = p_tournament_id
    and t.owner_id = auth.uid();

  if not found then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if p_players is null or jsonb_typeof(p_players) <> 'array' then
    return query select 0, '[]'::jsonb;
    return;
  end if;

  with payload as (
    select
      coalesce((p ->> 'row_index')::int, row_number() over ()) as row_index,
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
      coalesce(p ->> 'tags_json', '{}')::jsonb as tags_json,
      coalesce(p ->> 'warnings_json', '{}')::jsonb as warnings_json
    from jsonb_array_elements(p_players) as p
  ), dup_ranks as (
    select rank, array_agg(row_index) as rows
    from payload
    where rank is not null
    group by rank
    having count(*) > 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'row_index', unnest(rows),
    'rank', rank,
    'reason', 'Duplicate rank in upload (tournament rank must be unique).'
  )), '[]'::jsonb)
  into v_errors
  from dup_ranks;

  if jsonb_array_length(v_errors) > 0 then
    return query select 0, v_errors;
    return;
  end if;

  delete from public.players
  where tournament_id = p_tournament_id;

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
    warnings_json
  )
  select
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
    p_tournament_id,
    tags_json,
    warnings_json
  from payload;

  get diagnostics v_inserted = row_count;

  return query select coalesce(v_inserted, 0), v_errors;
end;
$$;

grant execute on function public.import_replace_players(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
