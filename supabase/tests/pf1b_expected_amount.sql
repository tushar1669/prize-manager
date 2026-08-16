-- PF1-B fixture harness — proves the coupon predicate still behaves identically
-- after being moved out of submit_tournament_payment_claim into
-- expected_payment_amount_inr.
--
-- WHY THIS EXISTS: all 6 live coupon_redemptions are 100%-off (amount_after = 0),
-- so the partial-discount branch has NEVER executed in production. Live data
-- cannot prove the move was faithful. These fixtures can.
--
-- Self-aborting: always ends with ERROR. Seeing
--   "PF1B HARNESS RESULTS: 9 of 9 cases passed"
-- IS the pass condition. Every fixture is rolled back by that final RAISE.
--
-- Run: supabase db query --linked -f supabase/tests/pf1b_expected_amount.sql

DO $harness$
DECLARE
  T uuid := 'f50240b7-c1a0-4657-8f4d-5415cb444903';  -- owned by U
  U uuid := '753b536b-5617-4948-8686-5adff65e879a';  -- non-master organizer
  M uuid := '48e9e020-e20b-4db0-9ee9-c9f2367cdab0';  -- master, for isolation
  v_coupon1 uuid; v_coupon2 uuid; v_red1 uuid; v_red2 uuid;
  v_basis int; v_canon int; v_exp int;
  v_disc int; v_disc2 int;
  v_err text; v_pid uuid;
  v_n int := 0;
BEGIN
  -- Seed our own preconditions. Never test the live profile (13 Aug lesson).
  UPDATE public.profiles SET phone = '+919999999999' WHERE id = U;

  -- ── C0: baseline, no coupon → expected = canonical ───────────────────────
  SELECT billing_basis, canonical_amount_inr, expected_amount_inr
    INTO v_basis, v_canon, v_exp
    FROM public.expected_payment_amount_inr(T, U);

  IF v_canon < 500 THEN
    RAISE EXCEPTION 'FIXTURE INVALID: tournament % now prices at % (basis %); pick another', T, v_canon, v_basis;
  END IF;
  IF v_exp <> v_canon THEN
    RAISE EXCEPTION 'C0 FAILED: no coupon should mean expected=canonical, got %/%', v_exp, v_canon;
  END IF;
  v_n := v_n + 1;

  v_disc  := v_canon - 200;
  v_disc2 := v_canon - 150;

  INSERT INTO public.coupons(code, discount_type, discount_value, applies_to, is_active)
  VALUES ('PF1BTESTA', 'fixed_price', v_disc, 'tournament_pro', true) RETURNING id INTO v_coupon1;
  INSERT INTO public.coupons(code, discount_type, discount_value, applies_to, is_active)
  VALUES ('PF1BTESTB', 'fixed_price', v_disc2, 'tournament_pro', true) RETURNING id INTO v_coupon2;

  -- ── C1: partial discount, unconsumed → expected = discounted ─────────────
  INSERT INTO public.coupon_redemptions(
    coupon_id, user_id, redeemed_by_user_id, tournament_id,
    amount_before, amount_after, discount_amount, redeemed_at)
  VALUES (v_coupon1, U, U, T, v_canon, v_disc, 200, now() - interval '2 hours')
  RETURNING id INTO v_red1;

  SELECT expected_amount_inr INTO v_exp FROM public.expected_payment_amount_inr(T, U);
  IF v_exp <> v_disc THEN
    RAISE EXCEPTION 'C1 FAILED: partial discount ignored, expected % got %', v_disc, v_exp;
  END IF;
  v_n := v_n + 1;

  -- ── C2: same redemption, already consumed by an active coupon entitlement ─
  INSERT INTO public.tournament_entitlements(
    tournament_id, owner_id, source, source_ref, starts_at, ends_at)
  VALUES (T, U, 'coupon', v_red1, now() - interval '1 hour', now() + interval '1 hour');

  SELECT expected_amount_inr INTO v_exp FROM public.expected_payment_amount_inr(T, U);
  IF v_exp <> v_canon THEN
    RAISE EXCEPTION 'C2 FAILED: consumed coupon must revert to canonical %, got %', v_canon, v_exp;
  END IF;
  v_n := v_n + 1;

  DELETE FROM public.tournament_entitlements WHERE source_ref = v_red1;

  -- ── C3: amount_before does not match canonical → predicate must not match ─
  UPDATE public.coupon_redemptions SET amount_before = v_canon + 499 WHERE id = v_red1;
  SELECT expected_amount_inr INTO v_exp FROM public.expected_payment_amount_inr(T, U);
  IF v_exp <> v_canon THEN
    RAISE EXCEPTION 'C3 FAILED: stale amount_before must be ignored, expected % got %', v_canon, v_exp;
  END IF;
  v_n := v_n + 1;

  -- ── C4: amount_after = 0 (100%-off) is not a payment path ────────────────
  UPDATE public.coupon_redemptions SET amount_before = v_canon, amount_after = 0 WHERE id = v_red1;
  SELECT expected_amount_inr INTO v_exp FROM public.expected_payment_amount_inr(T, U);
  IF v_exp <> v_canon THEN
    RAISE EXCEPTION 'C4 FAILED: amount_after=0 must not become the expected price, got %', v_exp;
  END IF;
  v_n := v_n + 1;

  -- ── C5: most recent partial redemption wins ──────────────────────────────
  UPDATE public.coupon_redemptions SET amount_after = v_disc WHERE id = v_red1;
  INSERT INTO public.coupon_redemptions(
    coupon_id, user_id, redeemed_by_user_id, tournament_id,
    amount_before, amount_after, discount_amount, redeemed_at)
  VALUES (v_coupon2, U, U, T, v_canon, v_disc2, 150, now() - interval '5 minutes')
  RETURNING id INTO v_red2;

  SELECT expected_amount_inr INTO v_exp FROM public.expected_payment_amount_inr(T, U);
  IF v_exp <> v_disc2 THEN
    RAISE EXCEPTION 'C5 FAILED: newest redemption should win (%), got %', v_disc2, v_exp;
  END IF;
  v_n := v_n + 1;

  DELETE FROM public.coupon_redemptions WHERE id = v_red2;

  -- ── C6: another user must not inherit this user's discount ───────────────
  SELECT expected_amount_inr INTO v_exp FROM public.expected_payment_amount_inr(T, M);
  IF v_exp <> v_canon THEN
    RAISE EXCEPTION 'C6 FAILED: discount leaked to another user, expected % got %', v_canon, v_exp;
  END IF;
  v_n := v_n + 1;

  -- ── C7/C8: end to end, the claim RPC must charge the DISCOUNTED price ────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', U::text, 'role', 'authenticated')::text, true);

  BEGIN
    v_pid := public.submit_tournament_payment_claim(T, v_canon, 'PF1BTESTUTR001', NULL, NULL);
    RAISE EXCEPTION 'C7 FAILED: claim at canonical % was accepted while a discount was active', v_canon;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err <> 'INVALID_PAYMENT_AMOUNT' THEN
      RAISE EXCEPTION 'C7 FAILED: expected INVALID_PAYMENT_AMOUNT, got %', v_err;
    END IF;
  END;
  v_n := v_n + 1;

  BEGIN
    v_pid := public.submit_tournament_payment_claim(T, v_disc, 'PF1BTESTUTR002', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'C8 FAILED: claim at the discounted price % was rejected with %', v_disc, SQLERRM;
  END;
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'C8 FAILED: discounted claim returned NULL payment id';
  END IF;
  v_n := v_n + 1;

  RAISE EXCEPTION 'PF1B HARNESS RESULTS: % of 9 cases passed (canonical=%, discounted=%) — all fixtures rolled back',
    v_n, v_canon, v_disc;
END
$harness$;
