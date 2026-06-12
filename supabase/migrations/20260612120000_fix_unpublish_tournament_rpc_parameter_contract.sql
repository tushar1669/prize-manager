-- Corrective forward-only migration: restore PostgREST RPC parameter contract.
-- The frontend calls public.unpublish_tournament with { tournament_id: <uuid> }.
-- Drop/recreate is required because PostgreSQL can reject input parameter renames
-- through CREATE or REPLACE FUNCTION.
drop function if exists public.unpublish_tournament(uuid);

create function public.unpublish_tournament(tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_master boolean := public.has_role(v_uid, 'master'::public.app_role);
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  perform 1
  from public.tournaments t
  where t.id = unpublish_tournament.tournament_id
    and (t.owner_id = v_uid or v_is_master)
  for update;

  if not found then
    raise exception 'not authorized';
  end if;

  update public.publications p
     set is_active = false
   where p.tournament_id = unpublish_tournament.tournament_id
     and p.is_active = true;

  update public.tournaments t
     set is_published = false,
         status = 'draft'
   where t.id = unpublish_tournament.tournament_id;
end;
$$;

revoke execute on function public.unpublish_tournament(uuid) from public;
revoke execute on function public.unpublish_tournament(uuid) from anon;
grant execute on function public.unpublish_tournament(uuid) to authenticated;
