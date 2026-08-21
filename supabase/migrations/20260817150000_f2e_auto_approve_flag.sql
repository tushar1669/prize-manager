-- ===========================================================================
-- F2-E · payment_auto_approve kill switch
--
-- PRD amendment, recorded in PROJECT_STATE §12.4: F2-5 originally specified an
-- Edge Function secret. A database RPC cannot read one, and the auto-approval
-- decision lives in submit_tournament_payment_claim (§12.1), so a secret is
-- not merely inconvenient — it is unreachable from where the decision is made.
--
-- platform_feature_flags satisfies every property the requirement actually
-- asks for, and is MORE auditable than a secret because it carries updated_at
-- and updated_by. Verified live: RLS on, ZERO policies, anon and authenticated
-- hold no SELECT and no UPDATE. Unreachable from any client, by construction.
--
-- Created DISABLED. Turning F2 on is a deliberate, separate, one-row UPDATE
-- that leaves a timestamp behind.
-- ===========================================================================

begin;

insert into public.platform_feature_flags (key, enabled, description)
values (
  'payment_auto_approve',
  false,
  'F2 conditional auto-approval. When true, submit_tournament_payment_claim may approve a claim in-transaction if ALL of: every one of the eight named payment invariants recorded a pass verdict at the current checker_version (skipped is NOT pass); the caller is not master; a screenshot extraction is pinned; and no non-rejected payment already uses that screenshot file_hash. When false, every claim goes to the manual queue exactly as before F2. Flip to false to revert instantly with no code change (PRD F2-5).'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Self-verification. Any failure aborts the whole migration.
-- ---------------------------------------------------------------------------
do $$
declare
  v_enabled  boolean;
  v_rls      boolean;
  v_policies integer;
  v_role     text;
  v_priv     text;
begin
  select enabled into v_enabled
  from public.platform_feature_flags where key = 'payment_auto_approve';

  if v_enabled is null then
    raise exception 'F2E FAIL: flag row was not created';
  end if;

  -- The whole point. A flag that ships on is a flag that shipped untested.
  if v_enabled then
    raise exception 'F2E FAIL: flag is ENABLED — it must ship off';
  end if;

  select c.relrowsecurity into v_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'platform_feature_flags';
  if not coalesce(v_rls, false) then
    raise exception 'F2E FAIL: RLS is not enabled on platform_feature_flags';
  end if;

  select count(*) into v_policies from pg_policies
  where schemaname = 'public' and tablename = 'platform_feature_flags';
  if v_policies <> 0 then
    raise exception 'F2E FAIL: expected zero policies, found % — the kill switch is reachable', v_policies;
  end if;

  -- Written from measurement, not memory (PF1-A's lesson): this state was
  -- queried live before the assertion was written.
  foreach v_role in array array['anon','authenticated'] loop
    foreach v_priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] loop
      if has_table_privilege(v_role, 'public.platform_feature_flags', v_priv) then
        raise exception 'F2E FAIL: % holds % on platform_feature_flags', v_role, v_priv;
      end if;
    end loop;
  end loop;

  -- The existing flag must be undisturbed.
  if not exists (
    select 1 from public.platform_feature_flags
    where key = 'brochure_import' and enabled
  ) then
    raise exception 'F2E FAIL: brochure_import flag was disturbed';
  end if;

  if (select count(*) from public.platform_feature_flags) <> 2 then
    raise exception 'F2E FAIL: expected exactly 2 flag rows, found %',
      (select count(*) from public.platform_feature_flags);
  end if;
end $$;

select 'F2E OK' as result;

commit;
