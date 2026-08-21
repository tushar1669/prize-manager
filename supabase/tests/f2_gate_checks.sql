-- ============================================================================
-- f2_gate_checks.sql — harness for the F2 conditional auto-approval gate
-- ============================================================================
--
-- Run with:   supabase db query --linked -f supabase/tests/f2_gate_checks.sql
--
-- CONTRACT (same as f0d_rpc_checks.sql):
--   This file is ONE statement. It ALWAYS ends in
--       ERROR:  F2 GATE HARNESS RESULTS: ...
--   That error IS the pass condition. The closing RAISE is what rolls the
--   fixtures back. Read the line: "N passed, 0 failed" is a pass.
--   RAISE NOTICE is swallowed by `supabase db query`, so every result is
--   carried in the exception text.
--
-- WHAT IT PROVES: the gate appended to submit_tournament_payment_claim fires
--   on exactly one combination and declines on every near miss. Production
--   data cannot exercise this — three named invariants have never fired and
--   'skipped' has never been recorded — so the harness seeds its own fixtures.
--
-- LIVE ROWS THIS TOUCHES THAT IT DID NOT CREATE (all rolled back):
--   1. profiles.phone on both fixture users — SEEDED, never assumed.
--      (f0d passed by luck on live phone state on 12 Aug; not repeating that.)
--   2. platform_feature_flags.payment_auto_approve — set per case inside that
--      case's sub-transaction, so no case depends on the order of any other.
--      The final check asserts the switch is back where it started.
--   3. referrals — trg_referrals_set_snapshot is DISABLED for one INSERT and
--      re-enabled immediately. That trigger references two dropped columns and
--      raises 42703 on every insert, so referrals cannot be seeded any other
--      way today. DDL is transactional; the disable rolls back too.
--
-- NOT SEEDED: auth.users.email_confirmed_at. Asserted as a precondition and
--   aborts with its own message, so an unconfirmed fixture user fails loudly
--   instead of turning cases 1 and 7B into silent false negatives.
--
-- ============================================================================

DO $harness$
DECLARE
  c_org      constant uuid  := '753b536b-5617-4948-8686-5adff65e879a';
  c_master   constant uuid  := '48e9e020-e20b-4db0-9ee9-c9f2367cdab0';
  c_schema   constant uuid  := '4e8beb4d-4a07-4ef8-a774-18b22f722522';  -- payment_screenshot v3
  c_amount   constant int   := 500;   -- watermark 200 -> basis 200 -> tier 151..500 -> Rs.500
  c_pass_all constant jsonb := jsonb_build_object(
      'utr_format','pass', 'utr_duplicate','pass', 'amount_mismatch','pass',
      'payee_vpa_mismatch','pass', 'payee_vpa_missing','pass', 'date_stale','pass',
      'direction_not_outgoing','pass', 'required_fields_missing','pass');

  v_out  text := '';
  v_ok   int  := 0;
  v_bad  int  := 0;

  v_org_email    text;
  v_master_email text;
  v_email_ok     boolean;
  v_code         uuid;
  v_flag0        boolean;
  v_flag         boolean;

  v_t uuid; v_e uuid; v_p uuid;
  v_t2 uuid; v_e2 uuid;

  v_status  text;
  v_rev_by  uuid;
  v_rev_at  timestamptz;
  v_note    text;
  v_ent     int;
  v_src     text;
  v_owner   uuid;
  v_days    numeric;
  v_ob      int;
  v_acts    text;
  v_obnote  text;
  v_rw      int;
  v_rwc     uuid;
  v_canon   int;
  v_exp     int;
  v_err     text;

  v_body text; v_gate text; v_pos int;
BEGIN
  ---------------------------------------------------------------------------
  -- 0. PRECONDITIONS — fail loudly and distinctly, never silently
  ---------------------------------------------------------------------------
  SELECT enabled INTO v_flag0 FROM public.platform_feature_flags
   WHERE key = 'payment_auto_approve';
  IF v_flag0 IS NULL THEN
    RAISE EXCEPTION 'F2 HARNESS ABORT: platform_feature_flags row payment_auto_approve is missing';
  END IF;

  SELECT p.email INTO v_org_email    FROM public.profiles p WHERE p.id = c_org;
  SELECT p.email INTO v_master_email FROM public.profiles p WHERE p.id = c_master;
  IF v_org_email IS NULL OR v_master_email IS NULL THEN
    RAISE EXCEPTION 'F2 HARNESS ABORT: fixture user missing from public.profiles';
  END IF;

  SELECT (u.email_confirmed_at IS NOT NULL) INTO v_email_ok
    FROM auth.users u WHERE u.id = c_org;
  IF NOT COALESCE(v_email_ok, false) THEN
    RAISE EXCEPTION 'F2 HARNESS ABORT: fixture organizer email is not confirmed — cases 1 and 7B would be false negatives';
  END IF;

  IF public.has_role(c_org, 'master'::public.app_role) THEN
    RAISE EXCEPTION 'F2 HARNESS ABORT: fixture organizer now holds the master role — case 5 would be meaningless';
  END IF;
  IF NOT public.has_role(c_master, 'master'::public.app_role) THEN
    RAISE EXCEPTION 'F2 HARNESS ABORT: fixture master no longer holds the master role';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.extraction_schemas WHERE id = c_schema) THEN
    RAISE EXCEPTION 'F2 HARNESS ABORT: payment_screenshot schema id not found';
  END IF;

  ---------------------------------------------------------------------------
  -- 1. SHARED FIXTURES
  ---------------------------------------------------------------------------
  -- Phone, seeded not assumed. CHECK profiles_phone_india_mobile: +91 then 10
  -- digits starting 6-9.
  UPDATE public.profiles SET phone = '+919999999999' WHERE id IN (c_org, c_master);

  -- Referral chain, so case 1 can observe issue_referral_rewards actually
  -- running (V7). Without a referrer that function is a no-op and there is
  -- nothing to assert.
  SELECT id INTO v_code FROM public.referral_codes WHERE user_id = c_master LIMIT 1;
  IF v_code IS NULL THEN
    SELECT id INTO v_code FROM public.referral_codes WHERE user_id <> c_org LIMIT 1;
  END IF;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'F2 HARNESS ABORT: no usable referral_codes row to seed a referral chain';
  END IF;

  EXECUTE 'ALTER TABLE public.referrals DISABLE TRIGGER trg_referrals_set_snapshot';
  DELETE FROM public.referrals WHERE referred_id = c_org;   -- referred_id is UNIQUE
  INSERT INTO public.referrals(referrer_id, referred_id, referral_code_id)
  VALUES (c_master, c_org, v_code);
  EXECUTE 'ALTER TABLE public.referrals ENABLE TRIGGER trg_referrals_set_snapshot';

  -- Per-case fixture seeder. Temp so it dies with the session and cannot be
  -- mistaken for a real object.
  EXECUTE $q$
    CREATE FUNCTION pg_temp.f2_seed(
      p_owner   uuid,
      p_utr     text,
      p_hash    text,
      p_verdicts jsonb,
      p_checker int,
      p_schema  uuid,
      OUT o_tournament uuid,
      OUT o_extraction uuid
    ) AS $f$
    DECLARE v_doc uuid;
    BEGIN
      INSERT INTO public.tournaments(owner_id, title, start_date, end_date, status)
      VALUES (p_owner, 'F2 HARNESS ' || p_utr, current_date, current_date, 'draft')
      RETURNING id INTO o_tournament;

      -- 200 players on the high-water mark puts the tournament in the
      -- 151..500 tier without inserting 200 player rows.
      INSERT INTO public.tournament_player_watermark(tournament_id, players_count_max)
      VALUES (o_tournament, 200);

      INSERT INTO public.extraction_documents(
        uploaded_by, file_name, file_path, file_hash, doc_type, privacy_class, status, ocr_text)
      VALUES (p_owner, 'f2-harness.png',
              'harness/' || gen_random_uuid()::text || '.png',
              p_hash, 'payment_screenshot', 'public', 'approved',
              'harness fixture')
      RETURNING id INTO v_doc;

      INSERT INTO public.extractions(document_id, schema_id, payload, status)
      VALUES (v_doc, p_schema,
              jsonb_build_object('utr', p_utr, 'amount_inr', 500),
              'needs_review')
      RETURNING id INTO o_extraction;

      IF p_verdicts IS NOT NULL THEN
        INSERT INTO public.payment_invariant_verdicts(extraction_id, checker_version, verdicts)
        VALUES (o_extraction, p_checker, p_verdicts);
      END IF;
    END $f$ LANGUAGE plpgsql;
  $q$;

  ---------------------------------------------------------------------------
  -- CASE 1 — all eight pass, flag ON, organizer, screenshot pinned
  --          => AUTO-APPROVED, and every downstream effect present
  ---------------------------------------------------------------------------
  v_err := NULL; v_status := NULL; v_rev_by := NULL; v_rev_at := NULL; v_note := NULL;
  v_ent := -1; v_src := NULL; v_owner := NULL; v_days := NULL;
  v_ob := -1; v_acts := NULL; v_obnote := NULL; v_rw := -1; v_rwc := NULL;
  v_canon := -1; v_exp := -1;
  BEGIN
    SELECT o_tournament, o_extraction INTO v_t, v_e
      FROM pg_temp.f2_seed(c_org, 'F2HARNESS0001', 'f2-hash-0001', c_pass_all, 1, c_schema);

    UPDATE public.platform_feature_flags SET enabled = true WHERE key = 'payment_auto_approve';

    SELECT canonical_amount_inr, expected_amount_inr INTO v_canon, v_exp
      FROM public.expected_payment_amount_inr(v_t, c_org);

    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', c_org::text, 'role', 'authenticated', 'email', v_org_email)::text, true);
    v_p := public.submit_tournament_payment_claim(v_t, c_amount, 'F2HARNESS0001', v_e, '/t/harness/payment');
    EXECUTE 'RESET ROLE';

    SELECT tp.status::text, tp.reviewed_by, tp.reviewed_at, tp.review_note
      INTO v_status, v_rev_by, v_rev_at, v_note
      FROM public.tournament_payments tp WHERE tp.id = v_p;

    SELECT count(*) INTO v_ent FROM public.tournament_entitlements WHERE source_ref = v_p;
    SELECT te.source, te.owner_id, round(extract(epoch FROM (te.ends_at - te.starts_at)) / 86400)
      INTO v_src, v_owner, v_days
      FROM public.tournament_entitlements te WHERE te.source_ref = v_p LIMIT 1;

    SELECT count(*), string_agg(o.action, ',' ORDER BY o.action)
      INTO v_ob, v_acts
      FROM public.payment_notification_outbox o WHERE o.payment_id = v_p;
    SELECT o.review_note INTO v_obnote
      FROM public.payment_notification_outbox o
     WHERE o.payment_id = v_p AND o.action = 'auto_approved';

    -- Isolated: the referral chain is the one fixture built on a temporarily
    -- disabled trigger, so a failure reading it must not take assertions
    -- 1a..1f down with it. v_rw = -2 means the capture itself failed.
    BEGIN
      SELECT count(*) INTO v_rw
        FROM public.referral_rewards rr
       WHERE rr.beneficiary_id = c_master AND rr.trigger_user_id = c_org
         AND rr.trigger_tournament_id = v_t AND rr.level = 1;

      SELECT rr.coupon_id INTO v_rwc
        FROM public.referral_rewards rr
       WHERE rr.beneficiary_id = c_master AND rr.trigger_user_id = c_org
         AND rr.trigger_tournament_id = v_t AND rr.level = 1
       LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_rw := -2; v_rwc := NULL;
    END;

    RAISE EXCEPTION 'CASE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CASE_ROLLBACK' THEN v_err := SQLSTATE || ' ' || SQLERRM; END IF;
  END;

  IF v_err IS NOT NULL THEN
    v_bad := v_bad + 1;
    v_out := v_out || E'\n  FAIL  1   raised: ' || v_err
                   || E'\n            captured before the raise: status=' || coalesce(v_status,'<none>')
                   || ' entitlements=' || v_ent || ' outbox=' || v_ob;
  ELSE
    IF v_canon = 500 AND v_exp = 500 THEN v_ok := v_ok + 1;
      v_out := v_out || E'\n  PASS  1a  price fixture is Rs.500/Rs.500';
    ELSE v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  1a  price fixture canonical=' || v_canon || ' expected=' || v_exp || ' (wanted 500/500)';
    END IF;

    IF v_status = 'approved' THEN v_ok := v_ok + 1;
      v_out := v_out || E'\n  PASS  1b  status=approved';
    ELSE v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  1b  status=' || coalesce(v_status,'<null>') || ' (wanted approved) — THE GATE DID NOT FIRE';
    END IF;

    IF v_rev_by IS NULL AND v_rev_at IS NOT NULL AND v_note = 'Auto-approved.' THEN v_ok := v_ok + 1;
      v_out := v_out || E'\n  PASS  1c  reviewed_by NULL, reviewed_at set, note "Auto-approved." (V8)';
    ELSE v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  1c  reviewed_by=' || coalesce(v_rev_by::text,'<null>')
                     || ' reviewed_at=' || coalesce(v_rev_at::text,'<null>')
                     || ' note=' || coalesce(v_note,'<null>');
    END IF;

    IF v_ent = 1 AND v_src = 'auto_upi' AND v_owner = c_org AND v_days = 365 THEN v_ok := v_ok + 1;
      v_out := v_out || E'\n  PASS  1d  one entitlement, source=auto_upi, owner=organizer, 365 days';
    ELSE v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  1d  entitlements=' || v_ent || ' source=' || coalesce(v_src,'<null>')
                     || ' owner=' || coalesce(v_owner::text,'<null>') || ' days=' || coalesce(v_days::text,'<null>');
    END IF;

    IF v_ob = 2 AND v_acts = 'approved,auto_approved' THEN v_ok := v_ok + 1;
      v_out := v_out || E'\n  PASS  1e  exactly 2 outbox rows: approved (trigger) + auto_approved (RPC)';
    ELSE v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  1e  outbox rows=' || v_ob || ' actions=' || coalesce(v_acts,'<null>');
    END IF;

    IF v_obnote LIKE '%checker_version 1%' THEN v_ok := v_ok + 1;
      v_out := v_out || E'\n  PASS  1f  oversight row carries the itemised verdicts';
    ELSE v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  1f  auto_approved review_note=' || coalesce(v_obnote,'<null>');
    END IF;

    IF v_rw = 1 THEN v_ok := v_ok + 1;
      v_out := v_out || E'\n  PASS  1g  issue_referral_rewards ran — level-1 reward row exists (V7)';
    ELSIF v_rw = -2 THEN v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  1g  referral capture query itself failed — harness bug, not a V7 failure';
    ELSE v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  1g  level-1 referral_rewards rows=' || v_rw || ' (wanted 1) — V7 BROKEN';
    END IF;

    IF v_rwc IS NOT NULL THEN v_ok := v_ok + 1;
      v_out := v_out || E'\n  PASS  1h  referral reward is linked to a coupon';
    ELSE v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  1h  referral reward has coupon_id NULL (coupon mint failed)';
    END IF;
  END IF;

  ---------------------------------------------------------------------------
  -- CASE 2 — one verdict 'fail' => stays pending
  ---------------------------------------------------------------------------
  v_err := NULL; v_status := NULL; v_ent := -1; v_ob := -1;
  BEGIN
    SELECT o_tournament, o_extraction INTO v_t, v_e
      FROM pg_temp.f2_seed(c_org, 'F2HARNESS0002', 'f2-hash-0002',
                           c_pass_all || jsonb_build_object('amount_mismatch','fail'), 1, c_schema);
    UPDATE public.platform_feature_flags SET enabled = true WHERE key = 'payment_auto_approve';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', c_org::text, 'role', 'authenticated', 'email', v_org_email)::text, true);
    v_p := public.submit_tournament_payment_claim(v_t, c_amount, 'F2HARNESS0002', v_e, NULL);
    EXECUTE 'RESET ROLE';
    SELECT tp.status::text INTO v_status FROM public.tournament_payments tp WHERE tp.id = v_p;
    SELECT count(*) INTO v_ent FROM public.tournament_entitlements WHERE source_ref = v_p;
    SELECT count(*) INTO v_ob FROM public.payment_notification_outbox WHERE payment_id = v_p;
    RAISE EXCEPTION 'CASE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CASE_ROLLBACK' THEN v_err := SQLSTATE || ' ' || SQLERRM; END IF;
  END;
  IF v_err IS NOT NULL THEN
    v_bad := v_bad + 1; v_out := v_out || E'\n  FAIL  2   raised: ' || v_err;
  ELSIF v_status = 'pending' AND v_ent = 0 AND v_ob = 0 THEN
    v_ok := v_ok + 1; v_out := v_out || E'\n  PASS  2   one verdict "fail" -> pending, no entitlement, no outbox';
  ELSE
    v_bad := v_bad + 1;
    v_out := v_out || E'\n  FAIL  2   status=' || coalesce(v_status,'<null>') || ' ent=' || v_ent || ' outbox=' || v_ob;
  END IF;

  ---------------------------------------------------------------------------
  -- CASE 3 — one verdict 'skipped' => stays pending          [D39, V1]
  -- utr_duplicate is the live CRED shape: a receipt with no UTR printed at all
  -- fired zero flags. Under a flags-only rule it would have auto-approved.
  ---------------------------------------------------------------------------
  v_err := NULL; v_status := NULL; v_ent := -1; v_ob := -1;
  BEGIN
    SELECT o_tournament, o_extraction INTO v_t, v_e
      FROM pg_temp.f2_seed(c_org, 'F2HARNESS0003', 'f2-hash-0003',
                           c_pass_all || jsonb_build_object('utr_duplicate','skipped'), 1, c_schema);
    UPDATE public.platform_feature_flags SET enabled = true WHERE key = 'payment_auto_approve';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', c_org::text, 'role', 'authenticated', 'email', v_org_email)::text, true);
    v_p := public.submit_tournament_payment_claim(v_t, c_amount, 'F2HARNESS0003', v_e, NULL);
    EXECUTE 'RESET ROLE';
    SELECT tp.status::text INTO v_status FROM public.tournament_payments tp WHERE tp.id = v_p;
    SELECT count(*) INTO v_ent FROM public.tournament_entitlements WHERE source_ref = v_p;
    SELECT count(*) INTO v_ob FROM public.payment_notification_outbox WHERE payment_id = v_p;
    RAISE EXCEPTION 'CASE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CASE_ROLLBACK' THEN v_err := SQLSTATE || ' ' || SQLERRM; END IF;
  END;
  IF v_err IS NOT NULL THEN
    v_bad := v_bad + 1; v_out := v_out || E'\n  FAIL  3   raised: ' || v_err;
  ELSIF v_status = 'pending' AND v_ent = 0 AND v_ob = 0 THEN
    v_ok := v_ok + 1; v_out := v_out || E'\n  PASS  3   one verdict "skipped" -> pending (D39: skipped is not pass)';
  ELSE
    v_bad := v_bad + 1;
    v_out := v_out || E'\n  FAIL  3   status=' || coalesce(v_status,'<null>') || ' ent=' || v_ent
                   || ' — SKIPPED WAS TREATED AS PASS';
  END IF;

  ---------------------------------------------------------------------------
  -- CASE 4 — flag OFF, everything else perfect => stays pending
  ---------------------------------------------------------------------------
  v_err := NULL; v_status := NULL; v_ent := -1;
  BEGIN
    SELECT o_tournament, o_extraction INTO v_t, v_e
      FROM pg_temp.f2_seed(c_org, 'F2HARNESS0004', 'f2-hash-0004', c_pass_all, 1, c_schema);
    UPDATE public.platform_feature_flags SET enabled = false WHERE key = 'payment_auto_approve';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', c_org::text, 'role', 'authenticated', 'email', v_org_email)::text, true);
    v_p := public.submit_tournament_payment_claim(v_t, c_amount, 'F2HARNESS0004', v_e, NULL);
    EXECUTE 'RESET ROLE';
    SELECT tp.status::text INTO v_status FROM public.tournament_payments tp WHERE tp.id = v_p;
    SELECT count(*) INTO v_ent FROM public.tournament_entitlements WHERE source_ref = v_p;
    RAISE EXCEPTION 'CASE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CASE_ROLLBACK' THEN v_err := SQLSTATE || ' ' || SQLERRM; END IF;
  END;
  IF v_err IS NOT NULL THEN
    v_bad := v_bad + 1; v_out := v_out || E'\n  FAIL  4   raised: ' || v_err;
  ELSIF v_status = 'pending' AND v_ent = 0 THEN
    v_ok := v_ok + 1; v_out := v_out || E'\n  PASS  4   kill switch OFF -> pending (the switch actually works)';
  ELSE
    v_bad := v_bad + 1;
    v_out := v_out || E'\n  FAIL  4   status=' || coalesce(v_status,'<null>') || ' — KILL SWITCH DOES NOT STOP THE GATE';
  END IF;

  ---------------------------------------------------------------------------
  -- CASE 5 — master submits on the organizer's tournament => stays pending [V6]
  -- Note: if V6 were removed this would attempt owner_id=master against the
  -- organizer's tournament and hit the composite FK, so the "raised" branch is
  -- reported separately from the "approved" branch.
  ---------------------------------------------------------------------------
  v_err := NULL; v_status := NULL; v_ent := -1;
  BEGIN
    SELECT o_tournament, o_extraction INTO v_t, v_e
      FROM pg_temp.f2_seed(c_org, 'F2HARNESS0005', 'f2-hash-0005', c_pass_all, 1, c_schema);
    UPDATE public.platform_feature_flags SET enabled = true WHERE key = 'payment_auto_approve';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', c_master::text, 'role', 'authenticated', 'email', v_master_email)::text, true);
    v_p := public.submit_tournament_payment_claim(v_t, c_amount, 'F2HARNESS0005', v_e, NULL);
    EXECUTE 'RESET ROLE';
    SELECT tp.status::text INTO v_status FROM public.tournament_payments tp WHERE tp.id = v_p;
    SELECT count(*) INTO v_ent FROM public.tournament_entitlements WHERE source_ref = v_p;
    RAISE EXCEPTION 'CASE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CASE_ROLLBACK' THEN v_err := SQLSTATE || ' ' || SQLERRM; END IF;
  END;
  IF v_err IS NOT NULL THEN
    v_bad := v_bad + 1;
    v_out := v_out || E'\n  FAIL  5   raised: ' || v_err || ' (V6 removed? master path reached the entitlement insert)';
  ELSIF v_status = 'pending' AND v_ent = 0 THEN
    v_ok := v_ok + 1; v_out := v_out || E'\n  PASS  5   master-submitted claim -> pending (V6 carve-out is not honoured by the gate)';
  ELSE
    v_bad := v_bad + 1;
    v_out := v_out || E'\n  FAIL  5   status=' || coalesce(v_status,'<null>') || ' — MASTER PATH AUTO-APPROVED';
  END IF;

  ---------------------------------------------------------------------------
  -- CASE 6 — no screenshot pinned => stays pending     [guardrail 11]
  ---------------------------------------------------------------------------
  v_err := NULL; v_status := NULL; v_ent := -1;
  BEGIN
    SELECT o_tournament, o_extraction INTO v_t, v_e
      FROM pg_temp.f2_seed(c_org, 'F2HARNESS0006', 'f2-hash-0006', c_pass_all, 1, c_schema);
    UPDATE public.platform_feature_flags SET enabled = true WHERE key = 'payment_auto_approve';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', c_org::text, 'role', 'authenticated', 'email', v_org_email)::text, true);
    v_p := public.submit_tournament_payment_claim(v_t, c_amount, 'F2HARNESS0006', NULL, NULL);
    EXECUTE 'RESET ROLE';
    SELECT tp.status::text INTO v_status FROM public.tournament_payments tp WHERE tp.id = v_p;
    SELECT count(*) INTO v_ent FROM public.tournament_entitlements WHERE source_ref = v_p;
    RAISE EXCEPTION 'CASE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CASE_ROLLBACK' THEN v_err := SQLSTATE || ' ' || SQLERRM; END IF;
  END;
  IF v_err IS NOT NULL THEN
    v_bad := v_bad + 1; v_out := v_out || E'\n  FAIL  6   raised: ' || v_err;
  ELSIF v_status = 'pending' AND v_ent = 0 THEN
    v_ok := v_ok + 1; v_out := v_out || E'\n  PASS  6   UTR-only claim -> pending (no screenshot can ever auto-approve)';
  ELSE
    v_bad := v_bad + 1;
    v_out := v_out || E'\n  FAIL  6   status=' || coalesce(v_status,'<null>') || ' — UTR-ONLY CLAIM AUTO-APPROVED';
  END IF;

  ---------------------------------------------------------------------------
  -- CASE 7 — same file_hash already pinned to a NON-REJECTED payment
  --          => stays pending                                [V5, F2-3]
  ---------------------------------------------------------------------------
  v_err := NULL; v_status := NULL; v_ent := -1;
  BEGIN
    SELECT o_tournament, o_extraction INTO v_t2, v_e2
      FROM pg_temp.f2_seed(c_org, 'F2HARNESS0007OTHER', 'f2-hash-0007', NULL, 1, c_schema);
    INSERT INTO public.tournament_payments(
      tournament_id, user_id, amount_inr, utr, status, screenshot_extraction_id)
    VALUES (v_t2, c_org, c_amount, 'F2HARNESS0007OTHER', 'approved', v_e2);

    SELECT o_tournament, o_extraction INTO v_t, v_e
      FROM pg_temp.f2_seed(c_org, 'F2HARNESS0007', 'f2-hash-0007', c_pass_all, 1, c_schema);
    UPDATE public.platform_feature_flags SET enabled = true WHERE key = 'payment_auto_approve';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', c_org::text, 'role', 'authenticated', 'email', v_org_email)::text, true);
    v_p := public.submit_tournament_payment_claim(v_t, c_amount, 'F2HARNESS0007', v_e, NULL);
    EXECUTE 'RESET ROLE';
    SELECT tp.status::text INTO v_status FROM public.tournament_payments tp WHERE tp.id = v_p;
    SELECT count(*) INTO v_ent FROM public.tournament_entitlements WHERE source_ref = v_p;
    RAISE EXCEPTION 'CASE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CASE_ROLLBACK' THEN v_err := SQLSTATE || ' ' || SQLERRM; END IF;
  END;
  IF v_err IS NOT NULL THEN
    v_bad := v_bad + 1; v_out := v_out || E'\n  FAIL  7   raised: ' || v_err;
  ELSIF v_status = 'pending' AND v_ent = 0 THEN
    v_ok := v_ok + 1; v_out := v_out || E'\n  PASS  7   replayed screenshot (hash on a live payment) -> pending';
  ELSE
    v_bad := v_bad + 1;
    v_out := v_out || E'\n  FAIL  7   status=' || coalesce(v_status,'<null>')
                   || ' — REPLAYED SCREENSHOT AUTO-APPROVED (is tp.id <> v_payment_id still there?)';
  END IF;

  ---------------------------------------------------------------------------
  -- CASE 7B — identical to 7 except the other payment is REJECTED
  --           => AUTO-APPROVED. Differs from case 7 by one column value, so
  --           the pair can only both pass if the file_hash rule is scoped to
  --           non-rejected payments (D15 resubmission stays possible).
  ---------------------------------------------------------------------------
  v_err := NULL; v_status := NULL; v_ent := -1;
  BEGIN
    SELECT o_tournament, o_extraction INTO v_t2, v_e2
      FROM pg_temp.f2_seed(c_org, 'F2HARNESS0008OTHER', 'f2-hash-0008', NULL, 1, c_schema);
    INSERT INTO public.tournament_payments(
      tournament_id, user_id, amount_inr, utr, status, screenshot_extraction_id)
    VALUES (v_t2, c_org, c_amount, 'F2HARNESS0008OTHER', 'rejected', v_e2);

    SELECT o_tournament, o_extraction INTO v_t, v_e
      FROM pg_temp.f2_seed(c_org, 'F2HARNESS0008', 'f2-hash-0008', c_pass_all, 1, c_schema);
    UPDATE public.platform_feature_flags SET enabled = true WHERE key = 'payment_auto_approve';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', c_org::text, 'role', 'authenticated', 'email', v_org_email)::text, true);
    v_p := public.submit_tournament_payment_claim(v_t, c_amount, 'F2HARNESS0008', v_e, NULL);
    EXECUTE 'RESET ROLE';
    SELECT tp.status::text INTO v_status FROM public.tournament_payments tp WHERE tp.id = v_p;
    SELECT count(*) INTO v_ent FROM public.tournament_entitlements WHERE source_ref = v_p;
    RAISE EXCEPTION 'CASE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CASE_ROLLBACK' THEN v_err := SQLSTATE || ' ' || SQLERRM; END IF;
  END;
  IF v_err IS NOT NULL THEN
    v_bad := v_bad + 1; v_out := v_out || E'\n  FAIL  7B  raised: ' || v_err;
  ELSIF v_status = 'approved' AND v_ent = 1 THEN
    v_ok := v_ok + 1; v_out := v_out || E'\n  PASS  7B  hash on a REJECTED payment only -> approved (D15 resubmission survives)';
  ELSE
    v_bad := v_bad + 1;
    v_out := v_out || E'\n  FAIL  7B  status=' || coalesce(v_status,'<null>') || ' ent=' || v_ent
                   || ' — file_hash rule is too wide; a rejected attempt now blocks resubmission';
  END IF;

  ---------------------------------------------------------------------------
  -- CASE 8 — all eight pass but checker_version = 2 => stays pending    [V3]
  ---------------------------------------------------------------------------
  v_err := NULL; v_status := NULL; v_ent := -1;
  BEGIN
    SELECT o_tournament, o_extraction INTO v_t, v_e
      FROM pg_temp.f2_seed(c_org, 'F2HARNESS0009', 'f2-hash-0009', c_pass_all, 2, c_schema);
    UPDATE public.platform_feature_flags SET enabled = true WHERE key = 'payment_auto_approve';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', c_org::text, 'role', 'authenticated', 'email', v_org_email)::text, true);
    v_p := public.submit_tournament_payment_claim(v_t, c_amount, 'F2HARNESS0009', v_e, NULL);
    EXECUTE 'RESET ROLE';
    SELECT tp.status::text INTO v_status FROM public.tournament_payments tp WHERE tp.id = v_p;
    SELECT count(*) INTO v_ent FROM public.tournament_entitlements WHERE source_ref = v_p;
    RAISE EXCEPTION 'CASE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CASE_ROLLBACK' THEN v_err := SQLSTATE || ' ' || SQLERRM; END IF;
  END;
  IF v_err IS NOT NULL THEN
    v_bad := v_bad + 1; v_out := v_out || E'\n  FAIL  8   raised: ' || v_err;
  ELSIF v_status = 'pending' AND v_ent = 0 THEN
    v_ok := v_ok + 1; v_out := v_out || E'\n  PASS  8   verdicts at checker_version 2 -> pending (V3)';
  ELSE
    v_bad := v_bad + 1;
    v_out := v_out || E'\n  FAIL  8   status=' || coalesce(v_status,'<null>')
                   || ' — STALE-VERSION VERDICTS WERE TRUSTED';
  END IF;

  ---------------------------------------------------------------------------
  -- STRUCTURAL — the guardrails a behavioural test cannot see
  ---------------------------------------------------------------------------
  SELECT p.prosrc INTO v_body
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'submit_tournament_payment_claim';

  IF regexp_count(v_body, 'RAISE EXCEPTION') = 15 THEN v_ok := v_ok + 1;
    v_out := v_out || E'\n  PASS  S1  raise census still 15 (V4: no new failure mode to iterate against)';
  ELSE v_bad := v_bad + 1;
    v_out := v_out || E'\n  FAIL  S1  raise census = ' || regexp_count(v_body, 'RAISE EXCEPTION') || ' (wanted 15)';
  END IF;

  v_pos := position('F2: conditional auto-approval' in v_body);
  IF v_pos > 0 THEN
    v_gate := substr(v_body, v_pos);
    v_ok := v_ok + 1; v_out := v_out || E'\n  PASS  S2  F2 gate block located in the live function body';

    IF regexp_count(v_gate, 'RAISE EXCEPTION') = 0 THEN v_ok := v_ok + 1;
      v_out := v_out || E'\n  PASS  S3  gate contains no RAISE — declines are silent (F2-2, no fraud oracle)';
    ELSE v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  S3  gate now raises — organizer can iterate toward a passing forgery';
    END IF;

    IF v_gate LIKE '%checker_version = 1%' THEN v_ok := v_ok + 1;
      v_out := v_out || E'\n  PASS  S4  gate pins checker_version = 1 (V3)';
    ELSE v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  S4  gate no longer pins checker_version = 1';
    END IF;

    IF v_gate LIKE '%tp.id <> v_payment_id%' THEN v_ok := v_ok + 1;
      v_out := v_out || E'\n  PASS  S5  file_hash self-exclusion present (V5)';
    ELSE v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  S5  tp.id <> v_payment_id is gone — the gate would silently never fire';
    END IF;

    IF v_gate LIKE '%reviewed_by = NULL%' AND v_gate NOT LIKE '%reviewed_by = auth.uid()%' THEN v_ok := v_ok + 1;
      v_out := v_out || E'\n  PASS  S6  reviewed_by stays NULL (V8: payer is never their own reviewer)';
    ELSE v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  S6  reviewed_by assignment changed';
    END IF;

    IF v_gate LIKE '%issue_referral_rewards%' THEN v_ok := v_ok + 1;
      v_out := v_out || E'\n  PASS  S7  issue_referral_rewards still mirrored (V7)';
    ELSE v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  S7  issue_referral_rewards dropped from the gate';
    END IF;
  ELSE
    v_bad := v_bad + 1;
    v_out := v_out || E'\n  FAIL  S2  F2 gate block not found in the live function body — S3..S7 not evaluated';
  END IF;

  ---------------------------------------------------------------------------
  -- LEAK CHECK — the switch must be exactly where it was when we started
  ---------------------------------------------------------------------------
  SELECT enabled INTO v_flag FROM public.platform_feature_flags WHERE key = 'payment_auto_approve';
  IF v_flag IS NOT DISTINCT FROM v_flag0 THEN v_ok := v_ok + 1;
    v_out := v_out || E'\n  PASS  S8  kill switch unchanged at ' || v_flag0::text || ' (no per-case leak)';
  ELSE v_bad := v_bad + 1;
    v_out := v_out || E'\n  FAIL  S8  kill switch leaked: started ' || v_flag0::text || ' now ' || v_flag::text;
  END IF;

  RAISE EXCEPTION E'F2 GATE HARNESS RESULTS: % passed, % failed\n%\n\n(This error is the pass condition. All fixtures rolled back.)',
    v_ok, v_bad, v_out;
END
$harness$;
