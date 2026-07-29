-- L6 flow resumption: carry the organizer's in-flow location through the
-- payment lifecycle so the approval email can deep-link them back in one click.
--
-- return_to is a same-site RELATIVE PATH ONLY. It is interpolated into an email
-- link, so an absolute URL or a protocol-relative "//evil.com" would be an open
-- redirect. The constraint below is the authoritative gate; the claim RPC and
-- the edge function each re-check independently (defence in depth).

-- 1. tournament_payments.return_to ------------------------------------------
alter table public.tournament_payments
  add column if not exists return_to text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tournament_payments'::regclass
      and conname = 'tournament_payments_return_to_relative_path'
  ) then
    alter table public.tournament_payments
      add constraint tournament_payments_return_to_relative_path check (
        return_to is null or (
          length(return_to) between 1 and 500
          and return_to ~ '^/[^/\\]'
          and return_to !~ '[[:cntrl:]]'
        )
      );
  end if;
end $$;

-- 2. payment_notification_outbox.return_to ----------------------------------
alter table public.payment_notification_outbox
  add column if not exists return_to text;

-- 3. Trigger fn: copy return_to onto the outbox row -------------------------
-- Unchanged from the current definition except for the return_to column/value.
-- The trigger itself is left in place — only the function body is replaced.
create or replace function public.enqueue_payment_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status is distinct from old.status
     and new.status::text in ('approved','rejected') then
    insert into public.payment_notification_outbox
      (payment_id, tournament_id, user_id, action, recipient_email, review_note, return_to)
    values (
      new.id,
      new.tournament_id,
      new.user_id,
      new.status::text,
      (select p.email from public.profiles p where p.id = new.user_id),
      nullif(new.review_note, ''),
      new.return_to
    )
    on conflict (payment_id, action) do nothing;
  end if;
  return new;
end;
$$;

-- CREATE OR REPLACE resets the ACL to the default privileges for schema public,
-- which on this project grant EXECUTE to PUBLIC *and* directly to anon and
-- authenticated. Both paths must be closed again after every replace.
revoke execute on function public.enqueue_payment_notification() from public;
revoke execute on function public.enqueue_payment_notification() from anon, authenticated;
grant  execute on function public.enqueue_payment_notification() to postgres, service_role;

-- 4. 5-arg claim overload ----------------------------------------------------
-- Body is the 4-arg overload verbatim, plus v_return_to. A malformed return_to
-- degrades to NULL rather than raising: losing the deep link must never cost
-- the organizer their payment.
create or replace function public.submit_tournament_payment_claim(
  p_tournament_id uuid,
  p_amount_inr integer,
  p_utr text,
  p_screenshot_extraction_id uuid,
  p_return_to text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_canonical_amount integer;
  v_expected_amount integer;
  v_payment_id uuid;
  v_return_to text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT t.owner_id INTO v_owner_id FROM public.tournaments t
  WHERE t.id = p_tournament_id AND t.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT (v_owner_id = v_user_id OR public.has_role(v_user_id, 'master'::public.app_role)) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT price.amount_inr INTO v_canonical_amount
  FROM public.get_tournament_pro_price(p_tournament_id) price;

  IF v_canonical_amount = 0 THEN RAISE EXCEPTION 'TOURNAMENT_ALREADY_FREE'; END IF;
  IF p_utr IS NULL OR length(trim(p_utr)) < 6 THEN RAISE EXCEPTION 'INVALID_UTR'; END IF;

  SELECT cr.amount_after INTO v_expected_amount
  FROM public.coupon_redemptions cr
  WHERE cr.tournament_id = p_tournament_id
    AND cr.redeemed_by_user_id = v_user_id
    AND cr.amount_before = v_canonical_amount
    AND cr.amount_after > 0
    AND cr.amount_after < v_canonical_amount
    AND NOT EXISTS (
      SELECT 1 FROM public.tournament_entitlements te
      WHERE te.tournament_id = cr.tournament_id
        AND te.source = 'coupon'
        AND te.source_ref = cr.id
        AND now() >= te.starts_at
        AND now() < te.ends_at
    )
  ORDER BY cr.redeemed_at DESC
  LIMIT 1;

  v_expected_amount := COALESCE(v_expected_amount, v_canonical_amount);
  IF p_amount_inr IS DISTINCT FROM v_expected_amount THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_payments tp
    WHERE tp.tournament_id = p_tournament_id AND tp.user_id = v_user_id AND tp.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'PENDING_PAYMENT_ALREADY_EXISTS';
  END IF;

  IF p_return_to IS NOT NULL
     AND length(p_return_to) BETWEEN 1 AND 500
     AND p_return_to ~ '^/[^/\\]'
     AND p_return_to !~ '[[:cntrl:]]'
  THEN
    v_return_to := p_return_to;
  ELSE
    v_return_to := NULL;
  END IF;

  INSERT INTO public.tournament_payments(
    tournament_id, user_id, amount_inr, utr, status, screenshot_extraction_id, return_to)
  VALUES (
    p_tournament_id, v_user_id, p_amount_inr, trim(p_utr), 'pending', p_screenshot_extraction_id, v_return_to)
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$function$;

-- User-callable, unlike the trigger fn. anon is excluded deliberately: the
-- function already raises UNAUTHORIZED on a null auth.uid(), so dropping the
-- grant closes the hole without breaking any live flow.
revoke execute on function public.submit_tournament_payment_claim(uuid,integer,text,uuid,text) from public;
revoke execute on function public.submit_tournament_payment_claim(uuid,integer,text,uuid,text) from anon;
grant  execute on function public.submit_tournament_payment_claim(uuid,integer,text,uuid,text) to authenticated, service_role;
