-- A row claimed into 'sending' by an isolate that then died would never be
-- retried, because the drain query only selects 'pending' and 'failed'.
-- Mirrors the existing expire_stuck_extraction_documents reaper.
create or replace function public.reap_stuck_payment_notifications()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  update public.payment_notification_outbox
     set email_status = 'failed',
         email_error  = 'reaped_stuck_sending'
   where email_status = 'sending'
     and updated_at < now() - interval '10 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.reap_stuck_payment_notifications() from public;
grant  execute on function public.reap_stuck_payment_notifications() to postgres, service_role;
