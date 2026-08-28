-- ============================================================================
-- f3_audit_checks.sql — F3-A / F3-B regression harness
--
--   supabase db query --linked -f supabase/tests/f3_audit_checks.sql
--
-- PASS CONDITION: "33 passed, 0 failed" inside an ERROR.
-- One self-aborting statement. Everything is rolled back, including every
-- fixture it seeds. It touches NO production row: all payments and
-- entitlements are created inside the transaction against entitlement-free
-- tournaments, so re-running it is always safe.
--
-- TWO MATCHED-PAIR CONTROLS, both load-bearing:
--   B13/B14 — B13 shows the RPC revokes a same-instant entitlement cleanly;
--             B14 shows that a plain ends_at=now() on that same fixture
--             violates tournament_entitlements_window_valid (23514). Without
--             B14, B13 would pass even if greatest(...) were deleted.
--   B5/B6   — B5 shows revocation writes no outbox row; B6 shows the trigger
--             DOES fire on a real status flip. Without B6, B5 would pass even
--             if the notification trigger were broken outright.
--
-- FIXTURES ARE CAPTURED BEFORE ANY CASE RUNS. A case body that also selects
-- its own fixture can be contaminated by an earlier case's writes — that
-- exact mistake produced a false failure while F3-B was being verified.
-- ============================================================================

DO $h$
DECLARE
  v_master uuid; v_mmail text;
  v_nm uuid;     v_nmmail text;
  v_t uuid[];
  v_baseline int;
  p_auto uuid; p_manual uuid; p_instant uuid; p_stack uuid; p_spare uuid;
  u_auto text;
  v_res jsonb; v_n int; v_pay record; v_aud record;
  v_pass int := 0; v_fail int := 0; v_all text := ''; v_line text; v_lines text[];
  a1 text:='not-run'; a2 text:='not-run'; a3 text:='not-run'; a4 text:='not-run';
  a5 text:='not-run'; a6 text:='not-run'; a7 text:='not-run'; a8 text:='not-run';
  a9 text:='not-run';
  b1 text:='not-run'; b2 text:='not-run'; b3 text:='not-run'; b4 text:='not-run';
  b5 text:='not-run'; b6 text:='not-run'; b7 text:='not-run'; b8 text:='not-run';
  b9 text:='not-run'; b10 text:='not-run'; b11 text:='not-run'; b12 text:='not-run';
  b13 text:='not-run'; b14 text:='not-run'; b15 text:='not-run';
  s1 text:='not-run'; s2 text:='not-run'; s3 text:='not-run'; s4 text:='not-run';
  s5 text:='not-run'; s6 text:='not-run'; s7 text:='not-run'; s8 text:='not-run';
  s9 text:='not-run';
BEGIN
  ---------------------------------------------------------------------------
  -- FIXTURE CAPTURE (before anything mutates)
  ---------------------------------------------------------------------------
  SELECT u.id, u.email INTO v_master, v_mmail
    FROM auth.users u
    JOIN public.user_roles ur ON ur.user_id=u.id AND ur.role='master' AND ur.is_verified
    JOIN public.master_allowlist ma ON ma.email=u.email
   LIMIT 1;
  IF v_master IS NULL THEN RAISE EXCEPTION 'CAPTURE FAIL: no verified master'; END IF;

  -- The composite FK tournament_entitlements(tournament_id, owner_id) ->
  -- tournaments(id, owner_id) means an entitlement's owner MUST be the
  -- tournament's owner. Fixtures are therefore chosen as a MATCHED SET: one
  -- non-master owner, and three of that owner's tournaments that carry no
  -- entitlement and no payment. Picking a user and some tournaments
  -- independently raises 23503 -- that is how this constraint was found.
  SELECT t.owner_id INTO v_nm
    FROM public.tournaments t
   WHERE t.owner_id <> v_master
     AND EXISTS (SELECT 1 FROM public.profiles pr
                  WHERE pr.id = t.owner_id AND pr.email IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM public.tournament_entitlements te
                      WHERE te.tournament_id = t.id)
     AND NOT EXISTS (SELECT 1 FROM public.tournament_payments tp
                      WHERE tp.tournament_id = t.id)
   GROUP BY t.owner_id
  HAVING count(*) >= 3
   ORDER BY count(*) DESC, t.owner_id
   LIMIT 1;
  IF v_nm IS NULL THEN
    RAISE EXCEPTION 'CAPTURE FAIL: no non-master owner with 3 clean tournaments';
  END IF;

  SELECT pr.email INTO v_nmmail FROM public.profiles pr WHERE pr.id = v_nm;
  IF v_nmmail IS NULL THEN
    RAISE EXCEPTION 'CAPTURE FAIL: fixture owner has no email';
  END IF;

  SELECT array_agg(x.id) INTO v_t FROM (
    SELECT t.id FROM public.tournaments t
     WHERE t.owner_id = v_nm
       AND NOT EXISTS (SELECT 1 FROM public.tournament_entitlements te
                        WHERE te.tournament_id = t.id)
       AND NOT EXISTS (SELECT 1 FROM public.tournament_payments tp
                        WHERE tp.tournament_id = t.id)
     ORDER BY t.id LIMIT 3) x;
  IF v_t IS NULL OR array_length(v_t,1) <> 3 THEN
    RAISE EXCEPTION 'CAPTURE FAIL: need 3 clean tournaments for the fixture owner';
  END IF;

  SELECT count(*) INTO v_baseline FROM public.tournament_payments;

  ---------------------------------------------------------------------------
  -- SEED (all rolled back)
  ---------------------------------------------------------------------------
  u_auto := '99' || lpad(floor(random()*10000000000)::text, 10, '0');

  INSERT INTO public.tournament_payments (tournament_id,user_id,amount_inr,utr,status)
  VALUES (v_t[1], v_nm, 500, u_auto, 'approved'::payment_status) RETURNING id INTO p_auto;
  INSERT INTO public.tournament_entitlements (tournament_id,owner_id,source,source_ref,starts_at,ends_at)
  VALUES (v_t[1], v_nm, 'auto_upi', p_auto, now()-interval '1 day', now()+interval '365 days');

  INSERT INTO public.tournament_payments (tournament_id,user_id,amount_inr,utr,status,reviewed_by,reviewed_at)
  VALUES (v_t[1], v_nm, 500, '99'||lpad(floor(random()*10000000000)::text,10,'0'),
          'approved'::payment_status, v_master, now()) RETURNING id INTO p_manual;

  INSERT INTO public.tournament_payments (tournament_id,user_id,amount_inr,utr,status)
  VALUES (v_t[1], v_nm, 500, '99'||lpad(floor(random()*10000000000)::text,10,'0'),
          'approved'::payment_status) RETURNING id INTO p_spare;

  INSERT INTO public.tournament_payments (tournament_id,user_id,amount_inr,utr,status)
  VALUES (v_t[2], v_nm, 500, '99'||lpad(floor(random()*10000000000)::text,10,'0'),
          'approved'::payment_status) RETURNING id INTO p_instant;
  INSERT INTO public.tournament_entitlements (tournament_id,owner_id,source,source_ref,starts_at,ends_at)
  VALUES (v_t[2], v_nm, 'auto_upi', p_instant, now(), now()+interval '365 days');

  INSERT INTO public.tournament_payments (tournament_id,user_id,amount_inr,utr,status)
  VALUES (v_t[3], v_nm, 500, '99'||lpad(floor(random()*10000000000)::text,10,'0'),
          'approved'::payment_status) RETURNING id INTO p_stack;
  INSERT INTO public.tournament_entitlements (tournament_id,owner_id,source,source_ref,starts_at,ends_at)
  VALUES (v_t[3], v_nm, 'auto_upi', p_stack, now()-interval '1 day', now()+interval '365 days');
  INSERT INTO public.tournament_entitlements (tournament_id,owner_id,source,source_ref,starts_at,ends_at)
  VALUES (v_t[3], v_nm, 'coupon', gen_random_uuid(), now()-interval '1 day', now()+interval '30 days');

  ---------------------------------------------------------------------------
  -- A GROUP — record_auto_approval_audit
  ---------------------------------------------------------------------------
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
    EXECUTE 'set local role authenticated';
    PERFORM public.record_auto_approval_audit(p_auto,'ok','harness A1','none');
    EXECUTE 'reset role';
    SELECT * INTO v_aud FROM public.payment_auto_approval_audit WHERE payment_id=p_auto;
    a1 := CASE WHEN v_aud.payment_id IS NULL THEN 'FAIL: no row'
               WHEN v_aud.outcome<>'ok' THEN 'FAIL: outcome'
               WHEN v_aud.audited_by<>v_master THEN 'FAIL: audited_by'
               WHEN v_aud.action_taken<>'none' THEN 'FAIL: action_taken'
               ELSE 'pass' END;
  EXCEPTION WHEN OTHERS THEN a1 := 'FAIL: '||sqlerrm; END;
  EXECUTE 'reset role';

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
    EXECUTE 'set local role authenticated';
    PERFORM public.record_auto_approval_audit(p_auto,'uncertain','harness A2','none');
    EXECUTE 'reset role';
    SELECT count(*) INTO v_n FROM public.payment_auto_approval_audit WHERE payment_id=p_auto;
    SELECT * INTO v_aud FROM public.payment_auto_approval_audit WHERE payment_id=p_auto;
    a2 := CASE WHEN v_n<>1 THEN 'FAIL: '||v_n||' rows'
               WHEN v_aud.outcome<>'uncertain' THEN 'FAIL: not updated'
               ELSE 'pass' END;
  EXCEPTION WHEN OTHERS THEN a2 := 'FAIL: '||sqlerrm; END;
  EXECUTE 'reset role';

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_nm::text,'role','authenticated','email',v_nmmail)::text, true);
    EXECUTE 'set local role authenticated';
    PERFORM public.record_auto_approval_audit(p_auto,'ok','harness A3','none');
    a3 := 'FAIL: non-master wrote';
  EXCEPTION WHEN OTHERS THEN
    a3 := CASE WHEN sqlerrm='not_master' THEN 'pass' ELSE 'FAIL: '||sqlerrm END; END;
  EXECUTE 'reset role';

  BEGIN
    EXECUTE 'set local role anon';
    PERFORM public.record_auto_approval_audit(p_auto,'ok','harness A4','none');
    a4 := 'FAIL: anon executed';
  EXCEPTION WHEN insufficient_privilege THEN a4 := 'pass';
            WHEN OTHERS THEN a4 := 'FAIL: '||sqlstate||' '||sqlerrm; END;
  EXECUTE 'reset role';

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
    EXECUTE 'set local role authenticated';
    PERFORM public.record_auto_approval_audit(p_auto,'ok','   ','none');
    a5 := 'FAIL: blank reason accepted';
  EXCEPTION WHEN OTHERS THEN
    a5 := CASE WHEN sqlerrm='reason_required' THEN 'pass' ELSE 'FAIL: '||sqlerrm END; END;
  EXECUTE 'reset role';

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
    EXECUTE 'set local role authenticated';
    PERFORM public.record_auto_approval_audit(p_auto,'fine','harness A6','none');
    a6 := 'FAIL: bogus outcome accepted';
  EXCEPTION WHEN OTHERS THEN
    a6 := CASE WHEN sqlerrm='invalid_outcome' THEN 'pass' ELSE 'FAIL: '||sqlerrm END; END;
  EXECUTE 'reset role';

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
    EXECUTE 'set local role authenticated';
    PERFORM public.record_auto_approval_audit(p_auto,'ok','harness A7','deleted');
    a7 := 'FAIL: bogus action_taken accepted';
  EXCEPTION WHEN OTHERS THEN
    a7 := CASE WHEN sqlerrm='invalid_action_taken' THEN 'pass' ELSE 'FAIL: '||sqlerrm END; END;
  EXECUTE 'reset role';

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
    EXECUTE 'set local role authenticated';
    PERFORM public.record_auto_approval_audit(p_manual,'ok','harness A8','none');
    a8 := 'FAIL: non-auto-approval accepted';
  EXCEPTION WHEN OTHERS THEN
    a8 := CASE WHEN sqlerrm='not_an_auto_approval' THEN 'pass' ELSE 'FAIL: '||sqlerrm END; END;
  EXECUTE 'reset role';

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_nm::text,'role','authenticated','email',v_nmmail)::text, true);
    EXECUTE 'set local role authenticated';
    SELECT count(*) INTO v_n FROM public.payment_auto_approval_audit;
    a9 := 'FAIL: non-master read '||v_n||' rows';
  EXCEPTION WHEN insufficient_privilege THEN a9 := 'pass';
            WHEN OTHERS THEN a9 := 'FAIL: '||sqlstate||' '||sqlerrm; END;
  EXECUTE 'reset role';

  ---------------------------------------------------------------------------
  -- B GROUP — revoke_auto_entitlement
  ---------------------------------------------------------------------------
  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
    EXECUTE 'set local role authenticated';
    v_res := public.revoke_auto_entitlement(p_auto,'harness revoke');
    EXECUTE 'reset role';
    SELECT * INTO v_pay FROM public.tournament_payments WHERE id=p_auto;
    SELECT * INTO v_aud FROM public.payment_auto_approval_audit WHERE payment_id=p_auto;

    b1 := CASE WHEN (v_res->>'entitlements_ended')::int<>1 THEN 'FAIL: ended='||(v_res->>'entitlements_ended')
               WHEN (v_res->>'pro_still_active')::boolean THEN 'FAIL: pro still active'
               ELSE 'pass' END;
    b2 := CASE WHEN v_pay.status::text='approved' THEN 'pass'
               ELSE 'FAIL: status='||v_pay.status::text END;
    b3 := CASE WHEN v_pay.reviewed_by<>v_master THEN 'FAIL: reviewed_by'
               WHEN v_pay.review_note NOT LIKE 'Revoked:%' THEN 'FAIL: note='||coalesce(v_pay.review_note,'(null)')
               ELSE 'pass' END;
    b4 := CASE WHEN v_aud.outcome<>'loophole' THEN 'FAIL: outcome'
               WHEN v_aud.action_taken<>'entitlement_revoked' THEN 'FAIL: action_taken'
               ELSE 'pass' END;
    SELECT count(*) INTO v_n FROM public.payment_notification_outbox WHERE payment_id=p_auto;
    b5 := CASE WHEN v_n=0 THEN 'pass' ELSE 'FAIL: '||v_n||' outbox rows' END;
  EXCEPTION WHEN OTHERS THEN b1 := 'FAIL: '||sqlerrm; END;
  EXECUTE 'reset role';

  -- B6 CONTROL: a genuine status flip DOES enqueue. Without this, B5 would
  -- pass even if the notification trigger were entirely broken.
  BEGIN
    UPDATE public.tournament_payments SET status='rejected'::payment_status,
           review_note='harness control' WHERE id=p_spare;
    SELECT count(*) INTO v_n FROM public.payment_notification_outbox
     WHERE payment_id=p_spare AND action='rejected';
    b6 := CASE WHEN v_n=1 THEN 'pass' ELSE 'FAIL: '||v_n||' rejected rows' END;
  EXCEPTION WHEN OTHERS THEN b6 := 'FAIL: '||sqlerrm; END;

  BEGIN
    INSERT INTO public.tournament_payments (tournament_id,user_id,amount_inr,utr,status)
    VALUES (v_t[1], v_nm, 500, u_auto, 'approved'::payment_status);
    b7 := 'FAIL: revoked payment released its UTR';
  EXCEPTION WHEN unique_violation THEN b7 := 'pass';
            WHEN OTHERS THEN b7 := 'FAIL: '||sqlstate||' '||sqlerrm; END;

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
    EXECUTE 'set local role authenticated';
    v_res := public.revoke_auto_entitlement(p_auto,'harness second call');
    EXECUTE 'reset role';
    b8 := CASE WHEN (v_res->>'entitlements_ended')::int=0 THEN 'pass'
               ELSE 'FAIL: ended='||(v_res->>'entitlements_ended') END;
  EXCEPTION WHEN OTHERS THEN b8 := 'FAIL: '||sqlerrm; END;
  EXECUTE 'reset role';

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_nm::text,'role','authenticated','email',v_nmmail)::text, true);
    EXECUTE 'set local role authenticated';
    PERFORM public.revoke_auto_entitlement(p_stack,'harness B9');
    b9 := 'FAIL: non-master revoked';
  EXCEPTION WHEN OTHERS THEN
    b9 := CASE WHEN sqlerrm='not_master' THEN 'pass' ELSE 'FAIL: '||sqlerrm END; END;
  EXECUTE 'reset role';

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
    EXECUTE 'set local role authenticated';
    PERFORM public.revoke_auto_entitlement(p_stack,'  ');
    b10 := 'FAIL: blank reason accepted';
  EXCEPTION WHEN OTHERS THEN
    b10 := CASE WHEN sqlerrm='reason_required' THEN 'pass' ELSE 'FAIL: '||sqlerrm END; END;
  EXECUTE 'reset role';

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
    EXECUTE 'set local role authenticated';
    PERFORM public.revoke_auto_entitlement(gen_random_uuid(),'harness B11');
    b11 := 'FAIL: unknown payment accepted';
  EXCEPTION WHEN OTHERS THEN
    b11 := CASE WHEN sqlerrm='payment_not_found' THEN 'pass' ELSE 'FAIL: '||sqlerrm END; END;
  EXECUTE 'reset role';

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
    EXECUTE 'set local role authenticated';
    PERFORM public.revoke_auto_entitlement(p_manual,'harness B12');
    b12 := 'FAIL: manual approval accepted';
  EXCEPTION WHEN OTHERS THEN
    b12 := CASE WHEN sqlerrm='not_an_auto_approval' THEN 'pass' ELSE 'FAIL: '||sqlerrm END; END;
  EXECUTE 'reset role';

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
    EXECUTE 'set local role authenticated';
    v_res := public.revoke_auto_entitlement(p_instant,'harness same-instant');
    EXECUTE 'reset role';
    b13 := CASE WHEN (v_res->>'entitlements_ended')::int=1 THEN 'pass'
                ELSE 'FAIL: '||v_res::text END;
  EXCEPTION WHEN OTHERS THEN b13 := 'FAIL: '||sqlstate||' '||sqlerrm; END;
  EXECUTE 'reset role';

  -- B14 CONTROL: the same fixture, revoked by hand with a plain now().
  -- MUST violate the window CHECK. If this ever passes, greatest(...) in
  -- revoke_auto_entitlement has become dead code and B13 proves nothing.
  BEGIN
    INSERT INTO public.tournament_payments (tournament_id,user_id,amount_inr,utr,status)
    VALUES (v_t[2], v_nm, 500, '99'||lpad(floor(random()*10000000000)::text,10,'0'),
            'approved'::payment_status) RETURNING id INTO p_spare;
    INSERT INTO public.tournament_entitlements (tournament_id,owner_id,source,source_ref,starts_at,ends_at)
    VALUES (v_t[2], v_nm, 'auto_upi', p_spare, now(), now()+interval '365 days');
    UPDATE public.tournament_entitlements SET ends_at=now() WHERE source_ref=p_spare;
    b14 := 'FAIL: plain now() did not violate the window CHECK';
  EXCEPTION WHEN check_violation THEN b14 := 'pass';
            WHEN OTHERS THEN b14 := 'FAIL: '||sqlstate||' '||sqlerrm; END;

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',v_master::text,'role','authenticated','email',v_mmail)::text, true);
    EXECUTE 'set local role authenticated';
    v_res := public.revoke_auto_entitlement(p_stack,'harness stacking');
    EXECUTE 'reset role';
    b15 := CASE WHEN (v_res->>'pro_still_active')::boolean
                 AND v_res->'active_sources' @> '["coupon"]'::jsonb
                THEN 'pass' ELSE 'FAIL: '||v_res::text END;
  EXCEPTION WHEN OTHERS THEN b15 := 'FAIL: '||sqlerrm; END;
  EXECUTE 'reset role';

  ---------------------------------------------------------------------------
  -- S GROUP — structure and leaks
  ---------------------------------------------------------------------------
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='payment_auto_approval_audit' AND c.relrowsecurity;
  s1 := CASE WHEN v_n=1 AND (SELECT count(*) FROM pg_policy
                              WHERE polrelid='public.payment_auto_approval_audit'::regclass)=0
             THEN 'pass' ELSE 'FAIL: RLS/policies' END;

  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='payment_auto_approval_audit'
     AND grantee IN ('anon','authenticated','PUBLIC');
  s2 := CASE WHEN v_n=0 THEN 'pass' ELSE 'FAIL: '||v_n||' client grants' END;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('record_auto_approval_audit','revoke_auto_entitlement')
     AND has_function_privilege('anon',p.oid,'EXECUTE');
  s3 := CASE WHEN v_n=0 THEN 'pass' ELSE 'FAIL: anon holds EXECUTE on '||v_n END;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('record_auto_approval_audit','revoke_auto_entitlement')
     AND has_function_privilege('authenticated',p.oid,'EXECUTE');
  s4 := CASE WHEN v_n=2 THEN 'pass' ELSE 'FAIL: authenticated holds EXECUTE on '||v_n||'/2' END;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('record_auto_approval_audit','revoke_auto_entitlement')
     AND p.prosecdef AND 'search_path=public' = ANY(p.proconfig);
  s5 := CASE WHEN v_n=2 THEN 'pass' ELSE 'FAIL: secdef/search_path on '||v_n||'/2' END;

  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid='public.payment_auto_approval_audit'::regclass AND contype='c';
  s6 := CASE WHEN v_n=3 THEN 'pass' ELSE 'FAIL: '||v_n||' CHECKs (expected 3)' END;

  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid='public.tournament_entitlements'::regclass
     AND conname='tournament_entitlements_window_valid';
  s7 := CASE WHEN v_n=1 THEN 'pass' ELSE 'FAIL: window CHECK missing (B14 is meaningless)' END;

  SELECT count(*) INTO v_n FROM public.payment_auto_approval_audit
   WHERE payment_id NOT IN (p_auto,p_manual,p_instant,p_stack);
  s8 := CASE WHEN v_n=0 THEN 'pass' ELSE 'FAIL: '||v_n||' production payments audited' END;

  SELECT count(*) INTO v_n FROM public.tournament_payments;
  s9 := CASE WHEN v_n=v_baseline+5 THEN 'pass'
             ELSE 'FAIL: payments='||v_n||' baseline='||v_baseline END;

  ---------------------------------------------------------------------------
  -- TALLY
  ---------------------------------------------------------------------------
  v_lines := ARRAY[
    'A1  master records an audit row              | '||a1,
    'A2  re-audit upserts, does not duplicate     | '||a2,
    'A3  non-master refused                       | '||a3,
    'A4  anon EXECUTE refused                     | '||a4,
    'A5  blank reason refused                     | '||a5,
    'A6  invalid outcome refused                  | '||a6,
    'A7  invalid action_taken refused             | '||a7,
    'A8  non-auto-approval refused                | '||a8,
    'A9  non-master SELECT refused                | '||a9,
    'B1  revoke ends 1 entitlement, Pro gone      | '||b1,
    'B2  payment status UNCHANGED (stays approved)| '||b2,
    'B3  reviewed_by stamped, note prefixed       | '||b3,
    'B4  audit row written automatically          | '||b4,
    'B5  no outbox row (organizer not emailed)    | '||b5,
    'B6  CONTROL status flip DOES enqueue         | '||b6,
    'B7  UTR still blocked after revocation       | '||b7,
    'B8  second revoke is idempotent              | '||b8,
    'B9  non-master refused                       | '||b9,
    'B10 blank reason refused                     | '||b10,
    'B11 unknown payment refused                  | '||b11,
    'B12 manual approval refused                  | '||b12,
    'B13 same-instant entitlement revokes cleanly | '||b13,
    'B14 CONTROL plain now() violates the CHECK   | '||b14,
    'B15 stacking reported honestly               | '||b15,
    'S1  audit table RLS on, zero policies        | '||s1,
    'S2  zero client table grants                 | '||s2,
    'S3  anon holds no EXECUTE                    | '||s3,
    'S4  authenticated holds EXECUTE on both      | '||s4,
    'S5  both SECURITY DEFINER, search_path pinned| '||s5,
    'S6  audit table CHECK constraints intact     | '||s6,
    'S7  entitlement window CHECK present         | '||s7,
    'S8  no production payment was audited        | '||s8,
    'S9  no stray payment rows                    | '||s9
  ];

  FOREACH v_line IN ARRAY v_lines LOOP
    IF v_line LIKE '%| pass' THEN v_pass := v_pass + 1;
    ELSE v_fail := v_fail + 1; END IF;
    v_all := v_all || E'\n  ' || v_line;
  END LOOP;

  RAISE EXCEPTION E'F3 AUDIT HARNESS RESULTS: % passed, % failed\n%\n\n(This error is expected. Everything was rolled back.)',
    v_pass, v_fail, v_all;
END
$h$;
