-- ============================================================================
-- F0d verification harness — submit_tournament_payment_claim error branches
-- ============================================================================
--
-- Covers the branches vitest cannot reach, because they live inside a plpgsql
-- SECURITY DEFINER function: a mocked client would only be testing the mock.
-- See PHASE2_ARCHITECTURE.md §9 (F0d additions) and D30/D31.
--
-- HOW TO RUN
--   supabase db query --linked -f supabase/tests/f0d_rpc_checks.sql
--
-- EXPECTED OUTCOME
--   The script ALWAYS ends with `ERROR: HARNESS RESULTS ...`. That is success,
--   not failure. The final RAISE is what aborts the transaction and discards
--   every fixture row the harness created — results are delivered inside the
--   error message precisely so nothing has to be committed to read them.
--
--   A dup exact                = UTR_ALREADY_USED
--   B dup separator variant    = UTR_ALREADY_USED
--   C dup case variant         = UTR_ALREADY_USED
--   D rejected-only passthrough= OK:<uuid>                (D15 resubmission)
--   E txn-id submitted         = UTR_IS_TXN_ID
--   F mismatch                 = UTR_MISMATCH
--   G unreadable extracted utr = UTR_EXTRACTION_UNREADABLE
--   H extraction of other user = EXTRACTION_NOT_OWNED
--   I extraction not found     = EXTRACTION_NOT_OWNED
--   J wrong doc_type           = EXTRACTION_NOT_OWNED
--   K master carve-out         = OK:<uuid>
--   L backstop index           = unique_violation on uq_tournament_payments_utr_active
--   M normalize_utr parity     = all 11 fixtures matched
--
--   Any "M parity FAIL <label>" line means normalize_utr and the TypeScript
--   mirror in supabase/functions/extract/paymentTrustCheck.ts have diverged.
--   The same eleven fixtures live in tests/fixtures/utrNormalizationFixtures.ts;
--   the two lists must stay identical.
--
-- SAFETY
--   Everything runs in one transaction aborted by the closing RAISE. Each case
--   additionally runs in its own BEGIN/EXCEPTION sub-transaction, so the two
--   cases that SUCCEED (D and K) roll their inserted payment row back at once
--   rather than leaking into later cases. Verified after the first run:
--   tournament_payments count unchanged at 7, zero harness documents left,
--   payment_notification_outbox unchanged at 6. The enqueue trigger is
--   AFTER UPDATE OF status, so plain INSERTs never fire it.
--
-- SCOPE / LIMITS
--   * Tests RPC logic, not RLS. Runs as a superuser session with auth.uid()
--     simulated via request.jwt.claims, which is how the RPC reads identity.
--     The grant layer (client SELECT-only on tournament_payments) is a separate
--     concern, closed by F0d Migration A.
--   * Case L proves the backstop index rejects a normalized-equal duplicate.
--     True concurrency cannot be simulated from one session; the index is the
--     mechanism that makes the TOCTOU race safe, so the index is what is tested.
--   * IDs below are specific to project nvjjifnzwrueutbirpde. If the test
--     tournament ever gains an active entitlement its price becomes 0 and the
--     RPC raises TOURNAMENT_ALREADY_FREE — pick another owned, unpaid
--     tournament and update T_ID.
-- ============================================================================

DO $harness$
DECLARE
  -- ── environment-specific fixtures ─────────────────────────────────────────
  OWNER_ID  constant uuid := '753b536b-5617-4948-8686-5adff65e879a'; -- owns T_ID, NOT master
  MASTER_ID constant uuid := '48e9e020-e20b-4db0-9ee9-c9f2367cdab0'; -- has master role
  T_ID      constant uuid := '22973d03-7dd2-42bc-9914-06570d41e18d'; -- price 500, no payments
  SCHEMA_V3 constant uuid := '4e8beb4d-4a07-4ef8-a774-18b22f722522'; -- payment_screenshot v3
  EXT_GOOD  constant uuid := 'b63c6152-9c0d-48cb-89e0-86228c7abc10'; -- utr 127287042392 / txn CICAgLii79OjJA, owned by OWNER_ID
  EXT_BROCH constant uuid := 'ba1ebf88-4314-4654-b918-a46e8f4016e3'; -- chess_brochure, owned by OWNER_ID
  d_null uuid; e_null uuid;
  d_other uuid; e_other uuid;
  d_fresh uuid; e_fresh uuid;
  v uuid; r text := ''; fx record; got text;
BEGIN
  -- ── fixtures ──────────────────────────────────────────────────────────────
  -- extraction with a null payload.utr (the cropped/unreadable screenshot shape)
  INSERT INTO public.extraction_documents(file_name,file_path,file_hash,doc_type,uploaded_by)
  VALUES ('h_null.jpg','h/null.jpg',gen_random_uuid()::text,'payment_screenshot',OWNER_ID) RETURNING id INTO d_null;
  INSERT INTO public.extractions(document_id,schema_id,payload,status)
  VALUES (d_null,SCHEMA_V3,'{}'::jsonb,'needs_review') RETURNING id INTO e_null;

  -- extraction belonging to a DIFFERENT user than the caller
  INSERT INTO public.extraction_documents(file_name,file_path,file_hash,doc_type,uploaded_by)
  VALUES ('h_other.jpg','h/other.jpg',gen_random_uuid()::text,'payment_screenshot',MASTER_ID) RETURNING id INTO d_other;
  INSERT INTO public.extractions(document_id,schema_id,payload,status)
  VALUES (d_other,SCHEMA_V3,'{"utr":"FRESHUTR001"}'::jsonb,'needs_review') RETURNING id INTO e_other;

  -- organizer-owned extraction with an unused UTR, for the master carve-out
  INSERT INTO public.extraction_documents(file_name,file_path,file_hash,doc_type,uploaded_by)
  VALUES ('h_fresh.jpg','h/fresh.jpg',gen_random_uuid()::text,'payment_screenshot',OWNER_ID) RETURNING id INTO d_fresh;
  INSERT INTO public.extractions(document_id,schema_id,payload,status)
  VALUES (d_fresh,SCHEMA_V3,'{"utr":"MASTERCARVE01"}'::jsonb,'needs_review') RETURNING id INTO e_fresh;

  -- an ACTIVE payment carrying a letter-bearing UTR, so case-insensitivity is
  -- testable (every real UTR in the table is digits-only).
  INSERT INTO public.tournament_payments(tournament_id,user_id,amount_inr,utr,status)
  VALUES (T_ID,OWNER_ID,500,'SBIN1234ABCD','approved');

  -- ── caller = organizer ────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub',OWNER_ID)::text, true);

  BEGIN v := public.submit_tournament_payment_claim(T_ID,500,'127287042392',NULL,NULL); RAISE EXCEPTION 'OK:%',v;
  EXCEPTION WHEN others THEN r := r||E'\nA dup exact                = '||SQLERRM; END;

  BEGIN v := public.submit_tournament_payment_claim(T_ID,500,' 1272-8704 2392 ',NULL,NULL); RAISE EXCEPTION 'OK:%',v;
  EXCEPTION WHEN others THEN r := r||E'\nB dup separator variant    = '||SQLERRM; END;

  BEGIN v := public.submit_tournament_payment_claim(T_ID,500,'sbin 1234-abcd',NULL,NULL); RAISE EXCEPTION 'OK:%',v;
  EXCEPTION WHEN others THEN r := r||E'\nC dup case variant         = '||SQLERRM; END;

  -- '156789012' exists only on a rejected row: D15 says it must go through.
  BEGIN v := public.submit_tournament_payment_claim(T_ID,500,'156789012',NULL,'/t/x/setup'); RAISE EXCEPTION 'OK:%',v;
  EXCEPTION WHEN others THEN r := r||E'\nD rejected-only passthrough= '||SQLERRM; END;

  BEGIN v := public.submit_tournament_payment_claim(T_ID,500,'CICAgLii79OjJA',EXT_GOOD,NULL); RAISE EXCEPTION 'OK:%',v;
  EXCEPTION WHEN others THEN r := r||E'\nE txn-id submitted         = '||SQLERRM; END;

  BEGIN v := public.submit_tournament_payment_claim(T_ID,500,'999888777666',EXT_GOOD,NULL); RAISE EXCEPTION 'OK:%',v;
  EXCEPTION WHEN others THEN r := r||E'\nF mismatch                 = '||SQLERRM; END;

  BEGIN v := public.submit_tournament_payment_claim(T_ID,500,'999888777666',e_null,NULL); RAISE EXCEPTION 'OK:%',v;
  EXCEPTION WHEN others THEN r := r||E'\nG unreadable extracted utr = '||SQLERRM; END;

  BEGIN v := public.submit_tournament_payment_claim(T_ID,500,'FRESHUTR001',e_other,NULL); RAISE EXCEPTION 'OK:%',v;
  EXCEPTION WHEN others THEN r := r||E'\nH extraction of other user = '||SQLERRM; END;

  BEGIN v := public.submit_tournament_payment_claim(T_ID,500,'999888777666',gen_random_uuid(),NULL); RAISE EXCEPTION 'OK:%',v;
  EXCEPTION WHEN others THEN r := r||E'\nI extraction not found     = '||SQLERRM; END;

  BEGIN v := public.submit_tournament_payment_claim(T_ID,500,'999888777666',EXT_BROCH,NULL); RAISE EXCEPTION 'OK:%',v;
  EXCEPTION WHEN others THEN r := r||E'\nJ wrong doc_type           = '||SQLERRM; END;

  -- ── caller = master, submitting on the organizer's behalf ─────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub',MASTER_ID)::text, true);
  BEGIN v := public.submit_tournament_payment_claim(T_ID,500,'MASTERCARVE01',e_fresh,NULL); RAISE EXCEPTION 'OK:%',v;
  EXCEPTION WHEN others THEN r := r||E'\nK master carve-out         = '||SQLERRM; END;

  -- ── backstop index: two normalized-equal UTRs cannot both be active ───────
  BEGIN
    INSERT INTO public.tournament_payments(tournament_id,user_id,amount_inr,utr,status)
    VALUES (T_ID,OWNER_ID,500,'race-utr-0001','approved');
    INSERT INTO public.tournament_payments(tournament_id,user_id,amount_inr,utr,status)
    VALUES (T_ID,OWNER_ID,500,'RACEUTR0001','approved');
    RAISE EXCEPTION 'OK:both inserts succeeded';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS got = CONSTRAINT_NAME;
    r := r||E'\nL backstop index           = unique_violation on '||got;
  WHEN others THEN r := r||E'\nL backstop index           = '||SQLERRM; END;

  -- ── normalize_utr parity: same eleven fixtures as the TypeScript mirror ───
  FOR fx IN
    SELECT * FROM (VALUES
      ('already_canonical','028862663052','028862663052'),
      ('lowercase','sbin1234abcd','SBIN1234ABCD'),
      ('internal_spaces','1234 5678 9012','123456789012'),
      ('hyphens','1234-5678-9012','123456789012'),
      ('statement_line','UPI/DR/123456789012/Name','UPIDR123456789012NAME'),
      ('leading_trailing_space','  028862663052  ','028862663052'),
      ('empty_string','',''),
      ('null_input',NULL,''),
      ('non_ascii','utr'||U&'\00DF'||'1234'||U&'\0131','UTR1234'),
      ('txn_id_shape_lower','t2607250000123456789','T2607250000123456789'),
      ('whitespace_control',E'0288\n6266\t3052','028862663052')
    ) AS t(label,input,expected)
  LOOP
    IF public.normalize_utr(fx.input) IS DISTINCT FROM fx.expected THEN
      r := r||E'\nM parity FAIL '||fx.label||' -> '||coalesce(public.normalize_utr(fx.input),'<null>');
    END IF;
  END LOOP;
  r := r||E'\nM normalize_utr parity     = all 11 fixtures matched (unless FAIL lines above)';

  -- This RAISE is the rollback. Do not remove it.
  RAISE EXCEPTION 'HARNESS RESULTS%', r;
END
$harness$;
