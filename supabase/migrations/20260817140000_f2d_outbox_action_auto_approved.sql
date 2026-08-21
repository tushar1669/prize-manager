-- ===========================================================================
-- F2-D · payment_notification_outbox.action admits 'auto_approved'
--
-- Ordering note, because this migration is the second half of a pair:
-- buildEmail() in send-payment-notifications previously branched on action
-- with an `if` and NO default, so any third value would have rendered the
-- REJECTION email. This CHECK was the only thing making that safe.
--
-- v8 (bundle ccf8c3be, 180 clean cron ticks) added the default branch first.
-- Relaxing the CHECK before that would have been the D36 mistake in reverse:
-- removing a guard before the code that replaces it exists.
--
-- Uniqueness is uq_payment_notification_outbox_payment_action, a UNIQUE INDEX
-- on (payment_id, action) — untouched. An auto-approved payment therefore
-- carries two rows: 'approved' (trigger -> organizer) and 'auto_approved'
-- (F2 RPC -> platform owner). Distinct actions, so no conflict.
--
-- email_status already permits 'skipped', which is what the drain writes for
-- an unrenderable action. No second widening required.
-- ===========================================================================

begin;

alter table public.payment_notification_outbox
  drop constraint payment_notification_outbox_action_check;

alter table public.payment_notification_outbox
  add constraint payment_notification_outbox_action_check
  check (action = any (array['approved','rejected','auto_approved']));

comment on column public.payment_notification_outbox.action is
  'Which lifecycle event this row notifies. approved | rejected are enqueued by the enqueue_payment_notification trigger and go to the organizer. auto_approved is enqueued directly by the F2 auto-approval branch of submit_tournament_payment_claim and goes to the platform owner as a post-hoc oversight notice (PRD F2-4). Any value not handled by buildEmail() is marked skipped/unknown_action by the drain rather than emailed.';

-- ---------------------------------------------------------------------------
-- Self-verification. Any failure aborts the whole migration.
-- ---------------------------------------------------------------------------
do $$
declare
  v_pay   record;
  v_total integer;
  v_after integer;
  v_sent  integer;
begin
  select count(*) into v_total from public.payment_notification_outbox;
  select count(*) into v_sent  from public.payment_notification_outbox where email_status='sent';
  if v_total <> 6 or v_sent <> 6 then
    raise exception 'F2D FAIL: baseline moved — % rows, % sent (expected 6/6)', v_total, v_sent;
  end if;

  select p.id, p.tournament_id, p.user_id into v_pay
  from public.tournament_payments p
  where not exists (
    select 1 from public.payment_notification_outbox o
    where o.payment_id = p.id and o.action = 'auto_approved')
  limit 1;
  if v_pay.id is null then
    raise exception 'F2D FAIL: no payment available to test against';
  end if;

  -- POSITIVE: the new value must now be accepted.
  begin
    insert into public.payment_notification_outbox
      (payment_id, tournament_id, user_id, action, recipient_email, email_status)
    values (v_pay.id, v_pay.tournament_id, v_pay.user_id,
            'auto_approved', 'chess.tushar@gmail.com', 'skipped');
  exception when check_violation then
    raise exception 'F2D FAIL: auto_approved rejected — the widening did not take';
  end;
  delete from public.payment_notification_outbox
    where payment_id = v_pay.id and action = 'auto_approved';

  -- NEGATIVE: an unhandled value must still be refused, so the CHECK stays the
  -- first line of defence and the code default is defence in depth, not the
  -- only defence. D35 — a guard never observed failing is an assumption.
  begin
    insert into public.payment_notification_outbox
      (payment_id, tournament_id, user_id, action, recipient_email, email_status)
    values (v_pay.id, v_pay.tournament_id, v_pay.user_id,
            'auto_declined', 'chess.tushar@gmail.com', 'skipped');
    raise exception 'F2D FAIL: CHECK accepted an unhandled action value';
  exception when check_violation then null;
  end;

  -- NEGATIVE: case and whitespace variants must not slip through, so the
  -- drain's === comparisons cannot be defeated by a near-miss spelling.
  begin
    insert into public.payment_notification_outbox
      (payment_id, tournament_id, user_id, action, recipient_email, email_status)
    values (v_pay.id, v_pay.tournament_id, v_pay.user_id,
            'Auto_Approved', 'chess.tushar@gmail.com', 'skipped');
    raise exception 'F2D FAIL: CHECK accepted a case variant';
  exception when check_violation then null;
  end;

  begin
    insert into public.payment_notification_outbox
      (payment_id, tournament_id, user_id, action, recipient_email, email_status)
    values (v_pay.id, v_pay.tournament_id, v_pay.user_id,
            ' auto_approved', 'chess.tushar@gmail.com', 'skipped');
    raise exception 'F2D FAIL: CHECK accepted a padded variant';
  exception when check_violation then null;
  end;

  -- NEGATIVE: the two original values must still be accepted. The unique index
  -- on (payment_id, action) is what bites here, not the CHECK — reaching a
  -- unique_violation proves the CHECK let the value through.
  begin
    insert into public.payment_notification_outbox
      (payment_id, tournament_id, user_id, action, recipient_email, email_status)
    values (v_pay.id, v_pay.tournament_id, v_pay.user_id,
            'approved', 'chess.tushar@gmail.com', 'skipped');
    delete from public.payment_notification_outbox
      where payment_id = v_pay.id and action = 'approved' and email_status = 'skipped';
  exception
    when check_violation then
      raise exception 'F2D FAIL: approved is no longer accepted — widening broke an old value';
    when unique_violation then null;
  end;

  select count(*) into v_after from public.payment_notification_outbox;
  if v_after <> v_total then
    raise exception 'F2D FAIL: residue — % rows before, % after', v_total, v_after;
  end if;
end $$;

select 'F2D OK' as result;

commit;
