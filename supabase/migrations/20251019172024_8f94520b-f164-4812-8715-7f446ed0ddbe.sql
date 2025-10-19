-- ====================================================================
-- Prize Manager Database Schema v1
-- ====================================================================

-- 1) Create app_role enum for user roles (SECURITY: separate table)
create type public.app_role as enum ('master', 'organizer', 'user');

-- 2) Create user_roles table (SECURITY: avoid privilege escalation)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null default 'user',
  created_at timestamptz default now(),
  unique (user_id, role)
);

-- 3) Security definer function to check roles (prevents RLS recursion)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- 4) Core tournaments table
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  start_date date not null,
  end_date date not null,
  venue text,
  city text,
  event_code text,
  notes text,
  brochure_url text,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'published')),
  slug text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5) Categories table
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade not null,
  name text not null,
  is_main boolean default false,
  criteria_json jsonb not null default '{}'::jsonb,
  order_idx int default 0,
  created_at timestamptz default now()
);

-- 6) Prizes table
create table public.prizes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete cascade not null,
  place int not null,
  cash_amount numeric(12,2) default 0,
  has_trophy boolean default false,
  has_medal boolean default false,
  created_at timestamptz default now()
);

-- 7) Players table
create table public.players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade not null,
  rank int not null,
  name text not null,
  rating int,
  dob date,
  gender text,
  club text,
  state text,
  tags_json jsonb default '{}'::jsonb,
  warnings_json jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 8) Rule configuration table
create table public.rule_config (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  strict_age boolean default true,
  allow_unrated_in_rating boolean default false,
  prefer_category_rank_on_tie boolean default false,
  prefer_main_on_equal_value boolean default true,
  category_priority_order jsonb default '["main","others"]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 9) Allocations table (versioned)
create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade not null,
  version int not null default 1,
  prize_id uuid references public.prizes(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  reason_codes text[] not null default '{}',
  is_manual boolean default false,
  decided_by uuid references auth.users(id),
  decided_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 10) Conflicts table
create table public.conflicts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade not null,
  type text not null check (type in ('multi_eligibility', 'equal_value', 'rule_exclusion', 'insufficient', 'data')),
  impacted_prizes uuid[] not null default '{}',
  impacted_players uuid[] not null default '{}',
  suggested jsonb,
  reasons text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'resolved', 'accepted')),
  created_at timestamptz default now()
);

-- 11) Conflict decisions table
create table public.conflict_decisions (
  id uuid primary key default gen_random_uuid(),
  conflict_id uuid references public.conflicts(id) on delete cascade not null,
  decision jsonb,
  note text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz default now()
);

-- 12) Publications table (versioning)
create table public.publications (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade not null,
  version int not null default 1,
  slug text not null,
  published_by uuid references auth.users(id),
  published_at timestamptz default now(),
  is_active boolean default true
);

-- 13) Create indexes for performance
create index idx_players_tournament_rank on public.players (tournament_id, rank);
create index idx_prizes_category_place on public.prizes (category_id, place);
create index idx_categories_tournament_order on public.categories (tournament_id, order_idx);
create index idx_allocations_tournament_version on public.allocations (tournament_id, version);
create index idx_conflicts_tournament on public.conflicts (tournament_id);
create index idx_publications_tournament on public.publications (tournament_id, is_active);
create index idx_user_roles_user_id on public.user_roles (user_id);

-- 14) Enable RLS on all tables (deny-by-default)
alter table public.user_roles enable row level security;
alter table public.tournaments enable row level security;
alter table public.categories enable row level security;
alter table public.prizes enable row level security;
alter table public.players enable row level security;
alter table public.rule_config enable row level security;
alter table public.allocations enable row level security;
alter table public.conflicts enable row level security;
alter table public.conflict_decisions enable row level security;
alter table public.publications enable row level security;

-- 15) RLS Policies for user_roles (users can read their own roles)
create policy "users_read_own_roles"
on public.user_roles for select
using (user_id = auth.uid());

-- 16) RLS Policies for tournaments
-- Organizer can read their own tournaments + published tournaments
create policy "org_read_own_tournaments"
on public.tournaments for select
using (
  owner_id = auth.uid() 
  or exists(
    select 1 from public.publications p 
    where p.tournament_id = id and p.is_active = true
  )
);

-- Organizer can insert their own tournaments
create policy "org_insert_own_tournaments"
on public.tournaments for insert
with check (owner_id = auth.uid());

-- Organizer can update their own tournaments
create policy "org_update_own_tournaments"
on public.tournaments for update
using (owner_id = auth.uid());

-- Organizer can delete their own tournaments
create policy "org_delete_own_tournaments"
on public.tournaments for delete
using (owner_id = auth.uid());

-- Master has full access to all tournaments
create policy "master_full_access_tournaments"
on public.tournaments for all
using (public.has_role(auth.uid(), 'master'));

-- 17) RLS Policies for categories (follow parent tournament)
create policy "org_categories_access"
on public.categories for all
using (
  exists(
    select 1 from public.tournaments t 
    where t.id = categories.tournament_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
)
with check (
  exists(
    select 1 from public.tournaments t 
    where t.id = categories.tournament_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
);

-- Public can read published categories
create policy "public_read_published_categories"
on public.categories for select
using (
  exists(
    select 1 from public.publications p 
    where p.tournament_id = categories.tournament_id 
    and p.is_active = true
  )
);

-- 18) RLS Policies for prizes
create policy "org_prizes_access"
on public.prizes for all
using (
  exists(
    select 1 from public.categories c
    join public.tournaments t on t.id = c.tournament_id
    where c.id = prizes.category_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
)
with check (
  exists(
    select 1 from public.categories c
    join public.tournaments t on t.id = c.tournament_id
    where c.id = prizes.category_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
);

-- Public can read published prizes
create policy "public_read_published_prizes"
on public.prizes for select
using (
  exists(
    select 1 from public.categories c
    join public.publications p on p.tournament_id = c.tournament_id
    where c.id = prizes.category_id 
    and p.is_active = true
  )
);

-- 19) RLS Policies for players
create policy "org_players_access"
on public.players for all
using (
  exists(
    select 1 from public.tournaments t 
    where t.id = players.tournament_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
)
with check (
  exists(
    select 1 from public.tournaments t 
    where t.id = players.tournament_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
);

-- 20) RLS Policies for rule_config
create policy "org_rule_config_access"
on public.rule_config for all
using (
  exists(
    select 1 from public.tournaments t 
    where t.id = rule_config.tournament_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
)
with check (
  exists(
    select 1 from public.tournaments t 
    where t.id = rule_config.tournament_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
);

-- 21) RLS Policies for allocations
create policy "org_allocations_access"
on public.allocations for all
using (
  exists(
    select 1 from public.tournaments t 
    where t.id = allocations.tournament_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
)
with check (
  exists(
    select 1 from public.tournaments t 
    where t.id = allocations.tournament_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
);

-- Public can read published allocations
create policy "public_read_published_allocations"
on public.allocations for select
using (
  exists(
    select 1 from public.publications p 
    where p.tournament_id = allocations.tournament_id 
    and p.is_active = true
  )
);

-- 22) RLS Policies for conflicts
create policy "org_conflicts_access"
on public.conflicts for all
using (
  exists(
    select 1 from public.tournaments t 
    where t.id = conflicts.tournament_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
)
with check (
  exists(
    select 1 from public.tournaments t 
    where t.id = conflicts.tournament_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
);

-- 23) RLS Policies for conflict_decisions
create policy "org_conflict_decisions_access"
on public.conflict_decisions for all
using (
  exists(
    select 1 from public.conflicts c
    join public.tournaments t on t.id = c.tournament_id
    where c.id = conflict_decisions.conflict_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
)
with check (
  exists(
    select 1 from public.conflicts c
    join public.tournaments t on t.id = c.tournament_id
    where c.id = conflict_decisions.conflict_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
);

-- 24) RLS Policies for publications
create policy "org_publications_access"
on public.publications for all
using (
  exists(
    select 1 from public.tournaments t 
    where t.id = publications.tournament_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
)
with check (
  exists(
    select 1 from public.tournaments t 
    where t.id = publications.tournament_id 
    and (t.owner_id = auth.uid() or public.has_role(auth.uid(), 'master'))
  )
);

-- Public can read active publications
create policy "public_read_active_publications"
on public.publications for select
using (is_active = true);

-- 25) Create trigger for updated_at on tournaments
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger update_tournaments_updated_at
before update on public.tournaments
for each row
execute function public.update_updated_at_column();

create trigger update_rule_config_updated_at
before update on public.rule_config
for each row
execute function public.update_updated_at_column();

-- 26) Storage buckets setup (manual step documented)
-- Buckets: 'brochures' (private), 'exports' (private)
-- RLS policies for storage will be added via Storage UI or SQL

-- Create storage buckets
insert into storage.buckets (id, name, public)
values 
  ('brochures', 'brochures', false),
  ('exports', 'exports', false)
on conflict (id) do nothing;

-- Storage RLS policies for brochures
create policy "Organizers upload brochures"
on storage.objects for insert
with check (
  bucket_id = 'brochures' 
  and auth.role() = 'authenticated'
);

create policy "Organizers read own brochures"
on storage.objects for select
using (
  bucket_id = 'brochures' 
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Public read published brochures"
on storage.objects for select
using (
  bucket_id = 'brochures'
);

-- Storage RLS policies for exports
create policy "Organizers upload exports"
on storage.objects for insert
with check (
  bucket_id = 'exports' 
  and auth.role() = 'authenticated'
);

create policy "Organizers read own exports"
on storage.objects for select
using (
  bucket_id = 'exports' 
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Public read published exports"
on storage.objects for select
using (
  bucket_id = 'exports'
);