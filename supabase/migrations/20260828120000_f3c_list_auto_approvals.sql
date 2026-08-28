-- =====================================================================
-- F3-C0 - list_auto_approvals(): master-only read path for the
-- /admin/payments auto-approved section.
--
-- WHY THIS EXISTS
--   payment_auto_approval_audit and payment_invariant_verdicts both have
--   RLS on, zero policies and zero client grants, by design. There is no
--   read path to either from any client - not even master. The section
--   cannot be built as a PostgREST query without loosening that lockdown.
--   This opens the read path through a SECURITY DEFINER master gate
--   instead, and leaves both tables exactly as they are.
--
-- IDENTITY (guardrail X1)
--   An auto-approval is identified by the entitlement it created -
--   source='auto_upi' AND source_ref = payment.id - never by
--   reviewed_by IS NULL, which revoke_auto_entitlement stamps.
--
-- HONESTY (guardrail X4)
--   pro_still_active and active_sources use exactly the predicate
--   revoke_auto_entitlement uses, so list and revoke cannot disagree.
--
-- Re-running this file fails at the pre-flight by design.
-- =====================================================================

begin;

-- ---------- 1. PRE-FLIGHT: assert the audited state ----------
do $preflight$
declare v_n int;
begin
  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'list_auto_approvals';
  if v_n <> 0 then
    raise exception 'PRE-FLIGHT: public.list_auto_approvals already exists (% found)', v_n;
  end if;

  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('record_auto_approval_audit','revoke_auto_entitlement');
  if v_n <> 2 then
    raise exception 'PRE-FLIGHT: expected the 2 F3-A/F3-B functions, found %', v_n;
  end if;

  select count(*) into v_n from pg_policies
   where schemaname = 'public'
     and tablename in ('payment_auto_approval_audit','payment_invariant_verdicts');
  if v_n <> 0 then
    raise exception 'PRE-FLIGHT: expected zero policies on the locked tables, found %', v_n;
  end if;

  if has_table_privilege('authenticated','public.payment_auto_approval_audit','SELECT')
     or has_table_privilege('authenticated','public.payment_invariant_verdicts','SELECT') then
    raise exception 'PRE-FLIGHT: authenticated already holds SELECT on a locked table';
  end if;
end
$preflight$;

-- ---------- 2. THE FUNCTION ----------
create function public.list_auto_approvals()
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

-- ---------- 3. GRANTS (D18: both revoke paths, always) ----------
revoke all on function public.list_auto_approvals() from public;
revoke all on function public.list_auto_approvals() from anon;
revoke all on function public.list_auto_approvals() from authenticated;
grant execute on function public.list_auto_approvals() to authenticated;

-- ---------- 4. STRUCTURAL POST-CHECK ----------
do $structural$
declare
  v_oid    oid;
  v_secdef boolean;
  v_config text;
begin
  select p.oid, p.prosecdef, coalesce(p.proconfig::text,'')
    into v_oid, v_secdef, v_config
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'list_auto_approvals';

  if v_oid is null then raise exception 'POST: function was not created'; end if;
  if not v_secdef then raise exception 'POST: not SECURITY DEFINER'; end if;
  if v_config not like '%search_path=public%' then
    raise exception 'POST: search_path not pinned (got %)', v_config;
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'POST: anon holds EXECUTE';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'POST: authenticated does not hold EXECUTE';
  end if;
end
$structural$;

-- ---------- 5. LEAK CHECK: the lockdown must be untouched ----------
do $leak$
declare v_n int;
begin
  select count(*) into v_n from pg_policies
   where schemaname = 'public'
     and tablename in ('payment_auto_approval_audit','payment_invariant_verdicts');
  if v_n <> 0 then raise exception 'LEAK: a policy appeared on a locked table (%)', v_n; end if;

  if has_table_privilege('authenticated','public.payment_auto_approval_audit','SELECT')
     or has_table_privilege('anon','public.payment_auto_approval_audit','SELECT')
     or has_table_privilege('authenticated','public.payment_invariant_verdicts','SELECT')
     or has_table_privilege('anon','public.payment_invariant_verdicts','SELECT') then
    raise exception 'LEAK: a client role gained SELECT on a locked table';
  end if;
end
$leak$;

-- ---------- 6. BEHAVIOURAL PROOF (read-only; writes nothing) ----------
do $proof$
declare
  v_master_uid   uuid := '48e9e020-e20b-4db0-9ee9-c9f2367cdab0';
  v_master_email text := 'chess.tushar@gmail.com';
  v_other_uid    uuid;
  v_other_email  text;
  v_json         jsonb;
  v_expected     int;
  v_refused      boolean := false;
begin
  select count(distinct te.source_ref) into v_expected
    from public.tournament_entitlements te
    join public.tournament_payments tp on tp.id = te.source_ref
   where te.source = 'auto_upi';

  select p.id, p.email into v_other_uid, v_other_email
    from public.profiles p
   where p.id not in (select ur.user_id from public.user_roles ur where ur.role = 'master')
     and p.email is not null
   order by p.id
   limit 1;
  if v_other_uid is null then raise exception 'PROOF: no non-master account available'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_master_uid::text, 'role','authenticated','email', v_master_email)::text, true);
  v_json := public.list_auto_approvals();
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_other_uid::text, 'role','authenticated','email', v_other_email)::text, true);
  begin
    perform public.list_auto_approvals();
  exception when others then
    v_refused := true;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', NULL, true);

  if not v_refused then
    raise exception 'PROOF FAILED: a non-master session was served (%)', v_other_email;
  end if;

  if jsonb_typeof(v_json) <> 'array' then
    raise exception 'PROOF FAILED: expected a jsonb array, got %', jsonb_typeof(v_json);
  end if;

  if jsonb_array_length(v_json) <> v_expected then
    raise exception 'PROOF FAILED: expected % rows, got %', v_expected, jsonb_array_length(v_json);
  end if;

  if exists (select 1 from jsonb_array_elements(v_json) r where (r->>'entitlement_id') is null) then
    raise exception 'PROOF FAILED: a row carries no entitlement_id (X1 identity broken)';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(v_json) r
      join public.tournament_payments tp on tp.id = (r->>'payment_id')::uuid
     where (r->>'pro_still_active')::boolean is distinct from (exists (
             select 1 from public.tournament_entitlements te
              where te.tournament_id = tp.tournament_id
                and te.owner_id      = tp.user_id
                and now() >= te.starts_at and now() < te.ends_at))
  ) then
    raise exception 'PROOF FAILED: pro_still_active disagrees with an independent recompute';
  end if;
end
$proof$;

commit;

notify pgrst, 'reload schema';

select 'F3-C0 applied' as result,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'list_auto_approvals') as fn_created,
       (select has_function_privilege('authenticated', p.oid, 'EXECUTE')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'list_auto_approvals') as authenticated_execute,
       (select has_function_privilege('anon', p.oid, 'EXECUTE')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'list_auto_approvals') as anon_execute;
