-- ============================================================================
-- 20260822120000 — Remove the dead referrals snapshot trigger
-- ============================================================================
-- PROBLEM
--   public.tg_referrals_set_snapshot() writes to new.referred_email and
--   new.referred_label. Migration 20260512184720 (12 May 2026 18:47 UTC,
--   statements 7-8) dropped both columns and left the trigger attached.
--   Every INSERT into public.referrals has raised since:
--       42703  record "new" has no field "referred_email"
--   Referral capture has been dead since that moment. referral_rewards has
--   zero rows ever. Reproduced live in a rolled-back block before writing this.
--
-- WHY DROP RATHER THAN REPAIR
--   The function body does nothing except populate those two columns. With the
--   columns gone there is no behaviour left to preserve. Dropping the function
--   as well as the trigger stops it being re-attached to the table later.
--
-- BLAST RADIUS (verified, not assumed)
--   - tg_referrals_set_snapshot is the ONLY object in public or auth that
--     mentions referred_email or referred_label.
--   - It is the ONLY non-internal trigger on public.referrals.
--   - Nothing in src/ or supabase/functions/ references either column name.
--   - public.apply_referral_code(text) is the ONLY writer to the table and is
--     deliberately NOT modified here.
--
-- NOTE FOR THE RECORD
--   Neither this trigger nor its function ever appeared in a repo migration.
--   Both were created directly against the live database. See PROJECT_STATE D40.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Pre-flight. Assert the database is in the exact state that was audited.
--    If any of this is untrue, the audit is stale and nothing should be applied.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_dropped_cols int;
  v_trigger_ct   int;
  v_fn_ct        int;
BEGIN
  SELECT count(*) INTO v_dropped_cols
  FROM pg_attribute
  WHERE attrelid = 'public.referrals'::regclass AND attnum > 0 AND attisdropped;

  SELECT count(*) INTO v_trigger_ct
  FROM pg_trigger
  WHERE tgrelid = 'public.referrals'::regclass
    AND NOT tgisinternal
    AND tgname = 'trg_referrals_set_snapshot';

  SELECT count(*) INTO v_fn_ct
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'tg_referrals_set_snapshot';

  IF v_dropped_cols <> 2 THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED: expected 2 dropped columns on public.referrals, found %',
      v_dropped_cols;
  END IF;

  IF v_trigger_ct <> 1 THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED: expected trg_referrals_set_snapshot to exist exactly once, found %',
      v_trigger_ct;
  END IF;

  IF v_fn_ct <> 1 THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED: expected public.tg_referrals_set_snapshot() to exist exactly once, found %',
      v_fn_ct;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. The fix.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_referrals_set_snapshot ON public.referrals;
DROP FUNCTION IF EXISTS public.tg_referrals_set_snapshot();

-- ---------------------------------------------------------------------------
-- 3. Structural proof. Both objects are gone, and referrals now carries no
--    BEFORE INSERT trigger at all.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_trigger_ct int;
  v_fn_ct      int;
BEGIN
  SELECT count(*) INTO v_trigger_ct
  FROM pg_trigger
  WHERE tgrelid = 'public.referrals'::regclass AND NOT tgisinternal;

  SELECT count(*) INTO v_fn_ct
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'tg_referrals_set_snapshot';

  IF v_trigger_ct <> 0 THEN
    RAISE EXCEPTION
      'POSTCHECK FAILED: expected 0 non-internal triggers on public.referrals, found %',
      v_trigger_ct;
  END IF;

  IF v_fn_ct <> 0 THEN
    RAISE EXCEPTION
      'POSTCHECK FAILED: public.tg_referrals_set_snapshot() still exists (% rows)',
      v_fn_ct;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Behavioural proof. A real INSERT into public.referrals, which could not
--    have succeeded before this migration. It rolls itself back in a nested
--    sub-transaction, so the migration commits no referral row.
--
--    This is the probe that found the bug, run in reverse.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_code     uuid;
  v_referrer uuid;
  v_referred uuid;
  v_new_id   uuid;
  v_state    text;
  v_msg      text;
  v_proved   boolean := false;
BEGIN
  SELECT rc.id, rc.user_id INTO v_code, v_referrer
  FROM public.referral_codes rc
  ORDER BY rc.created_at
  LIMIT 1;

  SELECT u.id INTO v_referred
  FROM auth.users u
  WHERE u.id <> v_referrer
    AND NOT EXISTS (SELECT 1 FROM public.referrals r WHERE r.referred_id = u.id)
  LIMIT 1;

  IF v_code IS NULL OR v_referred IS NULL THEN
    RAISE EXCEPTION
      'PROOF ABORT: no usable fixture (referral_code=%, referred_user=%)',
      v_code, v_referred;
  END IF;

  BEGIN
    INSERT INTO public.referrals (referrer_id, referred_id, referral_code_id)
    VALUES (v_referrer, v_referred, v_code)
    RETURNING id INTO v_new_id;

    IF v_new_id IS NULL THEN
      RAISE EXCEPTION 'PROOF FAILED: insert returned no id';
    END IF;

    -- PL/pgSQL variables are not transactional, so this survives the rollback.
    v_proved := true;

    -- Sentinel: unwinds the sub-transaction and discards the test row.
    RAISE EXCEPTION 'PROOF_ROLLBACK_SENTINEL';

  EXCEPTION
    WHEN raise_exception THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg <> 'PROOF_ROLLBACK_SENTINEL' THEN
        RAISE;
      END IF;
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      RAISE EXCEPTION
        'PROOF FAILED: insert into public.referrals still errors: % %',
        v_state, v_msg;
  END;

  IF NOT v_proved THEN
    RAISE EXCEPTION 'PROOF FAILED: proof block did not reach the sentinel';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Leak check. The proof row must not have survived.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rows int;
BEGIN
  SELECT count(*) INTO v_rows FROM public.referrals;
  IF v_rows <> 3 THEN
    RAISE EXCEPTION
      'LEAK CHECK FAILED: expected public.referrals to still hold 3 rows, found %',
      v_rows;
  END IF;
END $$;

COMMIT;
