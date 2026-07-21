-- FIX 1 (QA #1): preserve Details-tab fields that have no dedicated tournaments column.
--
-- registration_deadline, contact email/phone, website and FIDE/AICF rating status are extracted
-- from the brochure but the tournaments table has no columns for them. The mapper now folds them
-- into a "Label: value" block, and this revision writes that block into the existing
-- tournaments.notes column so the imported tournament shows them exactly like a manual entry.
--
-- Only the INSERT column list changes; all authorization, idempotency and criteria_json handling
-- are identical to 20260717150000_add_commit_extraction_transaction.sql.

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

  IF v_linked IS NOT NULL THEN
    RETURN QUERY SELECT v_linked, true;
    RETURN;
  END IF;

  IF v_status NOT IN ('needs_review', 'auto_ok') THEN
    RAISE EXCEPTION 'extraction status % cannot be committed', v_status USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.tournaments (
    owner_id, title, start_date, end_date, status,
    venue, city, event_code, notes,
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
    p_tournament->>'notes',
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
    -- criteria_json is deliberately '{}' regardless of what the caller sends: brochure-committed
    -- categories are structure only, matching the manual creation flow. Eligibility rules are
    -- configured by the organizer in the app, never written by an import.
    INSERT INTO public.categories (tournament_id, name, is_main, criteria_json, order_idx)
    VALUES (
      v_tournament_id,
      v_category->>'name',
      COALESCE((v_category->>'is_main')::boolean, false),
      '{}'::jsonb,
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
