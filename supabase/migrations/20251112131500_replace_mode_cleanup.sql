begin;

alter table public.players enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'players'
      and policyname = 'players_owner_all'
  ) then
    create policy players_owner_all
      on public.players
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.tournaments t
          where t.id = players.tournament_id
            and t.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.tournaments t
          where t.id = players.tournament_id
            and t.user_id = auth.uid()
        )
      );
  end if;
end;
$$;

create or replace function public.import_dedup_candidates(
  candidates jsonb,
  tournament_id uuid
)
returns table (
  cand_idx int,
  player_id uuid,
  name text,
  dob date,
  rating integer,
  fide_id text,
  city text,
  state text,
  club text,
  gender text,
  disability text,
  special_notes text,
  federation text
)
language sql
security definer
set search_path = public
as $$
  with parsed as (
    select
      coalesce((cand->>'row')::int, row_number() over ()) as cand_idx,
      nullif(btrim(cand->>'name'), '') as name,
      case
        when nullif(btrim(cand->>'name'), '') is null then null
        else lower(regexp_replace(btrim(cand->>'name'), '\\s+', ' ', 'g'))
      end as name_normalized,
      nullif(cand->>'fide_id', '') as fide_id,
      (cand->>'dob')::date as dob
    from jsonb_array_elements(candidates) as cand
  )
  select
    p.cand_idx,
    pl.id as player_id,
    pl.name,
    pl.dob,
    pl.rating,
    pl.fide_id,
    pl.city,
    pl.state,
    pl.club,
    pl.gender,
    pl.disability,
    pl.special_notes,
    pl.federation
  from parsed p
  join public.players pl
    on pl.tournament_id = tournament_id
   and (
     (p.fide_id is not null and pl.fide_id is not null and pl.fide_id = p.fide_id)
     or (
       p.name_normalized is not null
       and pl.name is not null
       and lower(regexp_replace(btrim(pl.name), '\\s+', ' ', 'g')) = p.name_normalized
       and coalesce(pl.dob::date, '0001-01-01'::date) = coalesce(p.dob, '0001-01-01'::date)
     )
   );
$$;

grant execute on function public.import_dedup_candidates(jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
