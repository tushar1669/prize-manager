-- =====================================================================
-- F3-C0b - add file_path and file_name to list_auto_approvals().
--
-- WHY
--   The panel needs to sign extraction-uploads/{file_path} to show the
--   screenshot. The RPC returned file_hash but no path, so the section
--   could only say "a screenshot exists but cannot be opened here".
--
--   The alternative was a second client query to extraction_documents,
--   which master can read. Rejected: this panel is an oversight surface,
--   and two queries means two independent ways to fail quietly. One
--   query, one failure mode.
--
-- Additive only. No column is removed, no key is renamed.
-- =====================================================================

begin;

do $preflight$
declare v_n int;
begin
  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'list_auto_approvals';
  if v_n <> 1 then
    raise exception 'PRE-FLIGHT: expected exactly 1 list_auto_approvals, found %', v_n;
  end if;

  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'list_auto_approvals'
     and p.prosrc like '%file_path%';
  if v_n <> 0 then
    raise exception 'PRE-FLIGHT: list_auto_approvals already exposes file_path';
  end if;

  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'extraction_documents'
     and column_name = 'file_path' and is_nullable = 'NO';
  if v_n <> 1 then
    raise exception 'PRE-FLIGHT: extraction_documents.file_path missing or nullable';
  end if;
end
$preflight$;

create or replace function public.list_auto_approvals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_now    timestamptz := now();
  v_result jsonb;
begin
  if not public.is_master() then raise exception 'not_master'; end if;

  select coalesce(jsonb_agg(x.row_json order by x.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      tp.created_at as created_at,
      jsonb_build_object(
        'payment_id',               tp.id,
        'tournament_id',            tp.tournament_id,
        'tournament_title',         t.title,
        'user_id',                  tp.user_id,
        'organizer_email',          pr.email,
        'amount_inr',               tp.amount_inr,
        'utr',                      tp.utr,
        'payment_status',           tp.status::text,
        'created_at',               tp.created_at,
        'reviewed_by',              tp.reviewed_by,
        'reviewed_at',              tp.reviewed_at,
        'review_note',              tp.review_note,
        'screenshot_extraction_id', tp.screenshot_extraction_id,
        'file_hash',                ed.file_hash,
        'file_path',                ed.file_path,
        'file_name',                ed.file_name,
        'entitlement_id',           e.id,
        'entitlement_starts_at',    e.starts_at,
        'entitlement_ends_at',      e.ends_at,
        'entitlement_active',       (v_now >= e.starts_at and v_now < e.ends_at),
        'auto_entitlement_count',   ec.n,
        'pro_still_active',         act.pro_still_active,
        'active_sources',           act.active_sources,
        'checker_version',          piv.checker_version,
        'verdicts',                 piv.verdicts,
        'audit',
          case when aud.payment_id is null then null
               else jsonb_build_object(
                 'outcome',      aud.outcome,
                 'reason',       aud.reason,
                 'action_taken', aud.action_taken,
                 'audited_by',   aud.audited_by,
                 'audited_at',   aud.audited_at)
          end
      ) as row_json
    from public.tournament_payments tp
    join lateral (
      select te.*
        from public.tournament_entitlements te
       where te.source = 'auto_upi' and te.source_ref = tp.id
       order by te.starts_at desc
       limit 1
    ) e on true
    cross join lateral (
      select count(*)::int as n
        from public.tournament_entitlements te2
       where te2.source = 'auto_upi' and te2.source_ref = tp.id
    ) ec
    cross join lateral (
      select
        exists (
          select 1 from public.tournament_entitlements te3
           where te3.tournament_id = tp.tournament_id
             and te3.owner_id      = tp.user_id
             and v_now >= te3.starts_at and v_now < te3.ends_at
        ) as pro_still_active,
        coalesce((
          select to_jsonb(array_agg(distinct te4.source order by te4.source))
            from public.tournament_entitlements te4
           where te4.tournament_id = tp.tournament_id
             and te4.owner_id      = tp.user_id
             and v_now >= te4.starts_at and v_now < te4.ends_at
        ), '[]'::jsonb) as active_sources
    ) act
    left join public.tournaments                 t   on t.id   = tp.tournament_id
    left join public.profiles                    pr  on pr.id  = tp.user_id
    left join public.extractions                 ex  on ex.id  = tp.screenshot_extraction_id
    left join public.extraction_documents        ed  on ed.id  = ex.document_id
    left join public.payment_invariant_verdicts  piv on piv.extraction_id = tp.screenshot_extraction_id
    left join public.payment_auto_approval_audit aud on aud.payment_id    = tp.id
  ) x;

  return v_result;
end;
$function$;

-- D18: CREATE OR REPLACE preserves the ACL, but both revoke paths are
-- re-asserted in every migration that replaces a function, without exception.
revoke all on function public.list_auto_approvals() from public;
revoke all on function public.list_auto_approvals() from anon;
revoke all on function public.list_auto_approvals() from authenticated;
grant execute on function public.list_auto_approvals() to authenticated;

do $post$
declare v_oid oid; v_secdef boolean; v_config text;
begin
  select p.oid, p.prosecdef, coalesce(p.proconfig::text,'')
    into v_oid, v_secdef, v_config
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'list_auto_approvals';

  if not v_secdef then raise exception 'POST: not SECURITY DEFINER'; end if;
  if v_config not like '%search_path=public%' then raise exception 'POST: search_path not pinned'; end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then raise exception 'POST: anon holds EXECUTE'; end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'POST: authenticated lost EXECUTE';
  end if;

  if (select count(*) from pg_policies where schemaname = 'public'
       and tablename in ('payment_auto_approval_audit','payment_invariant_verdicts')) <> 0 then
    raise exception 'LEAK: a policy appeared on a locked table';
  end if;
end
$post$;

do $proof$
declare
  v_master uuid; v_master_email text; v_json jsonb; v_bad int;
begin
  select ur.user_id, p.email into v_master, v_master_email
    from user_roles ur join profiles p on p.id = ur.user_id
   where ur.role = 'master' and ur.is_verified = true
   order by ur.user_id limit 1;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_master_email)::text, true);
  v_json := public.list_auto_approvals();
  execute 'reset role';
  perform set_config('request.jwt.claims', NULL, true);

  if exists (select 1 from jsonb_array_elements(v_json) r
              where not (r ? 'file_path') or not (r ? 'file_name')) then
    raise exception 'PROOF FAILED: file_path/file_name missing from a row';
  end if;

  -- every returned path must equal the document it came from
  select count(*) into v_bad
    from jsonb_array_elements(v_json) r
    join public.extractions ex on ex.id = (r->>'screenshot_extraction_id')::uuid
    join public.extraction_documents ed on ed.id = ex.document_id
   where r->>'file_path' is distinct from ed.file_path;
  if v_bad <> 0 then
    raise exception 'PROOF FAILED: % row(s) carry a file_path that does not match the document', v_bad;
  end if;

  -- a row WITH a screenshot must now carry a signable path
  if exists (select 1 from jsonb_array_elements(v_json) r
              where (r->>'screenshot_extraction_id') is not null
                and (r->>'file_path') is null) then
    raise exception 'PROOF FAILED: a row has a screenshot but no path to sign';
  end if;
end
$proof$;

commit;

notify pgrst, 'reload schema';

select 'F3-C0b applied' as result,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='list_auto_approvals'
           and p.prosrc like '%file_path%') as exposes_file_path;
