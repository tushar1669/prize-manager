create table if not exists public.payment_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.tournament_payments(id) on delete cascade,
  tournament_id uuid not null,
  user_id uuid not null,
  action text not null check (action in ('approved','rejected')),
  recipient_email text,
  review_note text,
  email_status text not null default 'pending'
    check (email_status in ('pending','sending','sent','failed','skipped')),
  email_enqueued_at timestamptz not null default now(),
  email_sent_at timestamptz,
  email_error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_payment_notification_outbox_payment_action
  on public.payment_notification_outbox (payment_id, action);

create index if not exists idx_payment_notification_outbox_drain
  on public.payment_notification_outbox (email_enqueued_at)
  where email_status in ('pending','failed');

alter table public.payment_notification_outbox enable row level security;

drop policy if exists "masters_read_payment_notification_outbox"
  on public.payment_notification_outbox;
create policy "masters_read_payment_notification_outbox"
  on public.payment_notification_outbox for select to authenticated
  using (public.is_master());
