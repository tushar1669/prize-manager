-- F1-A1: server-owned profile writes.
-- Additive only. No grants are revoked here; A3 does that after the
-- frontend has switched to this RPC. Running A3 first would break Save.

create or replace function public.update_my_profile(
  p_display_name    text,
  p_phone           text,
  p_city            text,
  p_org_name        text,
  p_fide_arbiter_id text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_row  public.profiles%rowtype;
  v_complete boolean;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  -- Full-replace on the five editable fields, matching what the Account
  -- page already sends on every save. Everything else on the row --
  -- email, id, created_at, profile_completed_at, profile_reward_claimed --
  -- is unreachable from here by construction.
  update public.profiles p set
    display_name    = nullif(btrim(coalesce(p_display_name, '')), ''),
    phone           = nullif(btrim(coalesce(p_phone, '')), ''),
    city            = nullif(btrim(coalesce(p_city, '')), ''),
    org_name        = nullif(btrim(coalesce(p_org_name, '')), ''),
    fide_arbiter_id = nullif(btrim(coalesce(p_fide_arbiter_id, '')), '')
  where p.id = v_uid
  returning p.* into v_row;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  -- profile_completed_at is DERIVED, never accepted from the client.
  v_complete :=
        v_row.display_name    is not null
    and v_row.phone           is not null
    and v_row.city            is not null
    and v_row.org_name        is not null
    and v_row.fide_arbiter_id is not null;

  if v_complete and v_row.profile_completed_at is null then
    update public.profiles set profile_completed_at = now()
    where id = v_uid
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'display_name',           v_row.display_name,
    'phone',                  v_row.phone,
    'city',                   v_row.city,
    'org_name',               v_row.org_name,
    'fide_arbiter_id',        v_row.fide_arbiter_id,
    'profile_completed_at',   v_row.profile_completed_at,
    'profile_reward_claimed', v_row.profile_reward_claimed
  );
end;
$fn$;

-- N1 / D18: both grant paths must be closed independently.
revoke all on function public.update_my_profile(text,text,text,text,text) from public;
revoke all on function public.update_my_profile(text,text,text,text,text) from anon;
grant execute on function public.update_my_profile(text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
