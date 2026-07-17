-- Transactional core of the commit-extraction Edge Function (PRD F8).
--
-- The Edge Function authenticates the caller, authorizes against the document uploader and the
-- organizer role, and maps the payload to row shapes; this function is the one place the rows
-- become real. It exists because PostgREST offers no multi-statement transaction to supabase-js —
-- without it a mid-commit failure would strand a half-created tournament. The FOR UPDATE lock on
-- the extraction row also makes idempotency race-safe: two concurrent approvals serialize, and
-- the second returns the first's tournament instead of creating a duplicate.
--
-- Callable by service_role only; every caller-facing check lives in the Edge Function.

CREATE OR REPLACE FUNCTION public.commit_extraction_transaction(
  p_extraction_id uuid,
  p_reviewer_id uuid,
  p_tournament jsonb,
  p_categories jsonb
)
RETURNS TABLE(tournament_id uuid, already_committed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked uuid;
  v_status public.extraction_status;
  v_tournament_id uuid;
  v_category jsonb;
  v_category_id uuid;
  v_prize jsonb;
BEGIN
  SELECT e.linked_tournament_id, e.status
    INTO v_linked, v_status
    FROM public.extractions e
   WHERE e.id = p_extraction_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'extraction not found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: an already-linked extraction returns its tournament, creates nothing.
  IF v_linked IS NOT NULL THEN
    RETURN QUERY SELECT v_linked, true;
    RETURN;
  END IF;

  IF v_status NOT IN ('needs_review', 'auto_ok') THEN
    RAISE EXCEPTION 'extraction status % cannot be committed', v_status USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.tournaments (
    owner_id, title, start_date, end_date, status,
    venue, city, event_code,
    time_control_base_minutes, time_control_increment_seconds, time_control_category,
    chief_arbiter, tournament_director, entry_fee_amount, cash_prize_total
  ) VALUES (
    (p_tournament->>'owner_id')::uuid,
    p_tournament->>'title',
    (p_tournament->>'start_date')::date,
    (p_tournament->>'end_date')::date,
    'draft',
    p_tournament->>'venue',
    p_tournament->>'city',
    p_tournament->>'event_code',
    (p_tournament->>'time_control_base_minutes')::integer,
    (p_tournament->>'time_control_increment_seconds')::integer,
    p_tournament->>'time_control_category',
    p_tournament->>'chief_arbiter',
    p_tournament->>'tournament_director',
    (p_tournament->>'entry_fee_amount')::numeric,
    (p_tournament->>'cash_prize_total')::numeric
  )
  RETURNING id INTO v_tournament_id;

  FOR v_category IN SELECT * FROM jsonb_array_elements(p_categories)
  LOOP
    INSERT INTO public.categories (tournament_id, name, is_main, criteria_json, order_idx)
    VALUES (
      v_tournament_id,
      v_category->>'name',
      COALESCE((v_category->>'is_main')::boolean, false),
      COALESCE(v_category->'criteria_json', '{}'::jsonb),
      COALESCE((v_category->>'order_idx')::integer, 0)
    )
    RETURNING id INTO v_category_id;

    FOR v_prize IN SELECT * FROM jsonb_array_elements(COALESCE(v_category->'prizes', '[]'::jsonb))
    LOOP
      INSERT INTO public.prizes (category_id, place, cash_amount, has_trophy, has_medal, gift_items)
      VALUES (
        v_category_id,
        (v_prize->>'place')::integer,
        COALESCE((v_prize->>'cash_amount')::numeric, 0),
        COALESCE((v_prize->>'has_trophy')::boolean, false),
        COALESCE((v_prize->>'has_medal')::boolean, false),
        COALESCE(v_prize->'gift_items', '[]'::jsonb)
      );
    END LOOP;
  END LOOP;

  UPDATE public.extractions
     SET status = 'approved',
         linked_tournament_id = v_tournament_id,
         reviewed_by = p_reviewer_id,
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_extraction_id;

  RETURN QUERY SELECT v_tournament_id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_extraction_transaction(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_extraction_transaction(uuid, uuid, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.commit_extraction_transaction(uuid, uuid, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.commit_extraction_transaction(uuid, uuid, jsonb, jsonb) TO service_role;
