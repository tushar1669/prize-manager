drop trigger if exists trg_payment_notification_outbox_updated_at
  on public.payment_notification_outbox;
create trigger trg_payment_notification_outbox_updated_at
before update on public.payment_notification_outbox
for each row execute function public.set_updated_at();
