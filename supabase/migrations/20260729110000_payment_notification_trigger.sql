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
      (payment_id, tournament_id, user_id, action, recipient_email, review_note)
    values (
      new.id,
      new.tournament_id,
      new.user_id,
      new.status::text,
      (select p.email from public.profiles p where p.id = new.user_id),
      nullif(new.review_note, '')
    )
    on conflict (payment_id, action) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_payment_notification on public.tournament_payments;
create trigger trg_enqueue_payment_notification
after update of status on public.tournament_payments
for each row execute function public.enqueue_payment_notification();
