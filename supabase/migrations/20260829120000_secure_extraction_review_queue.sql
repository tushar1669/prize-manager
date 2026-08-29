-- Close unauthenticated read of extraction payloads via a SECURITY DEFINER view.
-- Found 29 Aug 2026 by the Supabase security advisor; control-tested as anon:
-- 138 rows readable (23 payment_screenshot) including utr, payer_name,
-- payee_vpa, amount_inr, txn_id, txn_date, file_path.
-- extractions and extraction_documents carry NO anon policies, so invoker
-- semantics reduce anon to zero rows. Master and owner access are unchanged.

begin;

-- pre-flight: assert the audited state
do $pre$
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public' and c.relname='extraction_review_queue' and c.relkind='v') then
    raise exception 'PREFLIGHT: view is missing';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relname='extraction_review_queue'
               and coalesce(c.reloptions,'{}') && array['security_invoker=on','security_invoker=true']) then
    raise exception 'PREFLIGHT: already invoker - nothing to do';
  end if;
  if not has_table_privilege('anon','public.extraction_review_queue','SELECT') then
    raise exception 'PREFLIGHT: anon already lacks SELECT - state differs from audit';
  end if;
end $pre$;

alter view public.extraction_review_queue set (security_invoker = on);

-- D18: close both grant paths
revoke select on public.extraction_review_queue from anon;
revoke select on public.extraction_review_queue from public;

-- post-check: prove it, or roll the whole thing back
do $post$
declare v_rows int;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public' and c.relname='extraction_review_queue'
                   and coalesce(c.reloptions,'{}') && array['security_invoker=on','security_invoker=true']) then
    raise exception 'POSTCHECK: security_invoker not set';
  end if;
  if has_table_privilege('anon','public.extraction_review_queue','SELECT') then
    raise exception 'POSTCHECK: anon still holds SELECT';
  end if;
  begin
    set local role anon;
    select count(*) into v_rows from public.extraction_review_queue;
    reset role;
    raise exception 'POSTCHECK: anon still read % rows', v_rows;
  exception when insufficient_privilege then
    reset role;
  end;
  if not has_table_privilege('authenticated','public.extraction_review_queue','SELECT') then
    raise exception 'POSTCHECK: authenticated lost SELECT - too broad';
  end if;
end $post$;

notify pgrst, 'reload schema';

commit;

select 'extraction_review_queue secured' as result,
       has_table_privilege('anon','public.extraction_review_queue','SELECT') as anon_select,
       has_table_privilege('authenticated','public.extraction_review_queue','SELECT') as auth_select;
