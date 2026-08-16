-- ===========================================================================
-- F2-A · payment_invariant_verdicts
--
-- A positive record that all eight named invariants were EVALUATED, and what
-- each one returned. "No flag present" cannot distinguish "checked and clean"
-- from "never ran" (PROJECT_STATE §11 finding 2) — this table can.
--
-- No client grants, by design. The organizer must not be able to read the
-- gate input (F2-2, fraud oracle). Note that extractions.field_flags IS
-- readable by its uploader today, which is why the verdicts do not live there.
--
-- Additive only. Nothing reads or writes this table until F2-C and F2-D.
-- ===========================================================================

begin;

create table public.payment_invariant_verdicts (
  extraction_id   uuid        primary key
                    references public.extractions(id) on delete cascade,
  checker_version integer     not null,
  verdicts        jsonb       not null,
  computed_at     timestamptz not null default now(),

  constraint pivx_checker_version_positive check (checker_version > 0),

  constraint pivx_verdicts_exact_shape check (
        jsonb_typeof(verdicts) = 'object'
    and verdicts - array[
          'utr_format','utr_duplicate','amount_mismatch','payee_vpa_mismatch',
          'payee_vpa_missing','date_stale','direction_not_outgoing',
          'required_fields_missing'
        ] = '{}'::jsonb
    and coalesce(verdicts->>'utr_format','')              in ('pass','fail','skipped')
    and coalesce(verdicts->>'utr_duplicate','')           in ('pass','fail','skipped')
    and coalesce(verdicts->>'amount_mismatch','')         in ('pass','fail','skipped')
    and coalesce(verdicts->>'payee_vpa_mismatch','')      in ('pass','fail','skipped')
    and coalesce(verdicts->>'payee_vpa_missing','')       in ('pass','fail','skipped')
    and coalesce(verdicts->>'date_stale','')              in ('pass','fail','skipped')
    and coalesce(verdicts->>'direction_not_outgoing','')  in ('pass','fail','skipped')
    and coalesce(verdicts->>'required_fields_missing','') in ('pass','fail','skipped')
  )
);

comment on table public.payment_invariant_verdicts is
  'F2. One row per payment_screenshot extraction. Records that all eight named invariants ran, and each verdict: pass / fail / skipped. skipped is NOT pass. No client grants — the gate input must not be readable by the payer (F2-2).';

comment on column public.payment_invariant_verdicts.checker_version is
  'Bump whenever the invariant set changes. The F2 gate demands an exact match, so verdicts written by an older extract build can never authorize an approval. Measured need: image ebba2416fd produced three different named flag sets from byte-identical payloads, purely because F0c shipped between the runs.';

alter table public.payment_invariant_verdicts enable row level security;
-- Deliberately ZERO policies — same shape as platform_feature_flags.
-- service_role bypasses RLS; the claim RPC reads it as SECURITY DEFINER (owner postgres).

revoke all on public.payment_invariant_verdicts from public;
revoke all on public.payment_invariant_verdicts from anon;
revoke all on public.payment_invariant_verdicts from authenticated;
grant  all on public.payment_invariant_verdicts to service_role;

-- ---------------------------------------------------------------------------
-- Self-verification. Any failure aborts the whole migration.
-- ---------------------------------------------------------------------------
do $$
declare
  v_ex       uuid;
  v_rls      boolean;
  v_policies integer;
  v_role     text;
  v_priv     text;
  v_roles    text[] := array['anon','authenticated'];
  v_privs    text[] := array['SELECT','INSERT','UPDATE','DELETE',
                             'REFERENCES','TRIGGER','TRUNCATE'];
  v_good     jsonb  := jsonb_build_object(
    'utr_format','pass', 'utr_duplicate','pass', 'amount_mismatch','pass',
    'payee_vpa_mismatch','pass', 'payee_vpa_missing','pass', 'date_stale','pass',
    'direction_not_outgoing','pass', 'required_fields_missing','skipped');
begin
  select c.relrowsecurity into v_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relname='payment_invariant_verdicts';
  if not coalesce(v_rls,false) then
    raise exception 'F2A FAIL: RLS is not enabled';
  end if;

  select count(*) into v_policies from pg_policies
  where schemaname='public' and tablename='payment_invariant_verdicts';
  if v_policies <> 0 then
    raise exception 'F2A FAIL: expected zero policies, found %', v_policies;
  end if;

  foreach v_role in array v_roles loop
    foreach v_priv in array v_privs loop
      if has_table_privilege(v_role,'public.payment_invariant_verdicts',v_priv) then
        raise exception 'F2A FAIL: % holds % on payment_invariant_verdicts', v_role, v_priv;
      end if;
    end loop;
  end loop;

  if not has_table_privilege('service_role','public.payment_invariant_verdicts','INSERT') then
    raise exception 'F2A FAIL: service_role cannot INSERT — extract could not write verdicts';
  end if;

  select e.id into v_ex
  from public.extractions e
  join public.extraction_documents d on d.id = e.document_id
  where d.doc_type = 'payment_screenshot'
  limit 1;
  if v_ex is null then
    raise exception 'F2A FAIL: no payment_screenshot extraction to test against';
  end if;

  -- NEGATIVE cases first: FK is satisfied and the PK is still free, so a
  -- check_violation here is unambiguous. D35 — a guard never observed
  -- failing is an assumption, not a check.
  begin
    insert into public.payment_invariant_verdicts(extraction_id, checker_version, verdicts)
    values (v_ex, 1, v_good - 'date_stale');
    raise exception 'F2A FAIL: guard accepted an object with a MISSING key';
  exception when check_violation then null;
  end;

  begin
    insert into public.payment_invariant_verdicts(extraction_id, checker_version, verdicts)
    values (v_ex, 1, v_good || '{"ungrounded":"pass"}'::jsonb);
    raise exception 'F2A FAIL: guard accepted an object with an EXTRA key';
  exception when check_violation then null;
  end;

  begin
    insert into public.payment_invariant_verdicts(extraction_id, checker_version, verdicts)
    values (v_ex, 1, jsonb_set(v_good,'{utr_format}','"maybe"'));
    raise exception 'F2A FAIL: guard accepted an INVALID verdict value';
  exception when check_violation then null;
  end;

  begin
    insert into public.payment_invariant_verdicts(extraction_id, checker_version, verdicts)
    values (v_ex, 0, v_good);
    raise exception 'F2A FAIL: guard accepted checker_version = 0';
  exception when check_violation then null;
  end;

  -- POSITIVE case: a complete, valid object must be accepted.
  insert into public.payment_invariant_verdicts(extraction_id, checker_version, verdicts)
  values (v_ex, 1, v_good);

  delete from public.payment_invariant_verdicts where extraction_id = v_ex;

  if exists (select 1 from public.payment_invariant_verdicts) then
    raise exception 'F2A FAIL: test residue left behind';
  end if;
end $$;

notify pgrst, 'reload schema';

select 'F2A OK' as result;

commit;
