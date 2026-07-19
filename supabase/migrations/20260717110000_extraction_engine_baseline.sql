-- Extraction engine baseline: tables, view, bucket, and policies that were created directly in
-- the live project during Gate 1 and never captured as a migration (ARCHITECTURE.md debt #1).
--
-- Captured from the live catalog (pg_type / pg_indexes / pg_constraint / pg_policies /
-- storage.buckets) rather than `supabase db diff`, which requires a Docker shadow database that
-- is unavailable in this environment. Every statement is guarded so this file is a no-op against
-- the live project and a full rebuild on a fresh one.

-- ------------------------------------------------------------------ enums
do $$ begin
  create type public.doc_type as enum ('chess_brochure', 'invoice', 'bank_statement', 'photo', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.privacy_class as enum ('public', 'sensitive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.extraction_status as enum
    ('pending', 'processing', 'auto_ok', 'needs_review', 'approved', 'rejected', 'error');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------- extraction_schemas
create table if not exists public.extraction_schemas (
  id          uuid primary key default gen_random_uuid(),
  doc_type    public.doc_type not null,
  version     integer not null default 1,
  schema_json jsonb not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (doc_type, version)
);

alter table public.extraction_schemas enable row level security;

do $$ begin
  create policy "Schemas are readable by authenticated users"
    on public.extraction_schemas for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------- extraction_documents
create table if not exists public.extraction_documents (
  id              uuid primary key default gen_random_uuid(),
  uploaded_by     uuid references auth.users(id),
  file_name       text not null,
  file_path       text not null,
  file_hash       text not null,
  file_size_bytes integer,
  mime_type       text,
  doc_type        public.doc_type not null default 'unknown',
  privacy_class   public.privacy_class not null default 'public',
  status          public.extraction_status not null default 'pending',
  ocr_text        text,
  ocr_markdown    text,
  ocr_provider    text,
  ocr_duration_ms integer,
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_extraction_documents_hash on public.extraction_documents (file_hash);
create index if not exists idx_extraction_documents_status on public.extraction_documents (status);
create index if not exists idx_extraction_documents_doc_type on public.extraction_documents (doc_type);

alter table public.extraction_documents enable row level security;

do $$ begin
  create policy "Users can view own documents"
    on public.extraction_documents for select to authenticated
    using (uploaded_by = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users can insert own documents"
    on public.extraction_documents for insert to authenticated
    with check (uploaded_by = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users can update own documents"
    on public.extraction_documents for update to authenticated
    using (uploaded_by = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Service role full access on documents"
    on public.extraction_documents for all to service_role
    using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------- extractions
create table if not exists public.extractions (
  id                   uuid primary key default gen_random_uuid(),
  document_id          uuid not null references public.extraction_documents(id) on delete cascade,
  schema_id            uuid not null references public.extraction_schemas(id),
  payload              jsonb not null default '{}'::jsonb,
  grounding            jsonb not null default '{}'::jsonb,
  field_flags          jsonb not null default '[]'::jsonb,
  confidence           numeric check (confidence >= 0 and confidence <= 1),
  status               public.extraction_status not null default 'pending',
  llm_model            text,
  llm_duration_ms      integer,
  token_input          integer,
  token_output         integer,
  reviewed_by          uuid references auth.users(id),
  reviewed_at          timestamptz,
  review_notes         text,
  linked_tournament_id uuid references public.tournaments(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_extractions_document on public.extractions (document_id);
create index if not exists idx_extractions_status on public.extractions (status);
create index if not exists idx_extractions_linked on public.extractions (linked_tournament_id);

alter table public.extractions enable row level security;

do $$ begin
  create policy "Users can view own extractions"
    on public.extractions for select to authenticated
    using (document_id in (select id from public.extraction_documents where uploaded_by = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users can update own extractions"
    on public.extractions for update to authenticated
    using (document_id in (select id from public.extraction_documents where uploaded_by = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Service role full access on extractions"
    on public.extractions for all to service_role
    using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------- extraction_review_queue
create or replace view public.extraction_review_queue as
select e.id as extraction_id,
       d.id as document_id,
       d.file_name,
       d.doc_type,
       d.file_path,
       e.payload,
       e.field_flags,
       e.confidence,
       e.status,
       e.llm_model,
       e.created_at,
       jsonb_array_length(e.field_flags) as flag_count
from public.extractions e
join public.extraction_documents d on d.id = e.document_id
where e.status = any (array['needs_review'::public.extraction_status, 'pending'::public.extraction_status])
order by e.created_at desc;

-- ------------------------------------------------------------ storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'extraction-uploads', 'extraction-uploads', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

do $$ begin
  create policy "Users can upload extraction files"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'extraction-uploads' and (storage.foldername(name))[1] = (auth.uid())::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users can read own extraction files"
    on storage.objects for select to authenticated
    using (bucket_id = 'extraction-uploads' and (storage.foldername(name))[1] = (auth.uid())::text);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Service role reads all extraction files"
    on storage.objects for select to service_role
    using (bucket_id = 'extraction-uploads');
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------- schema v1
-- v2 (the active version at capture time) is seeded by 20260717120000_seed_chess_brochure_schema_v2.sql.
insert into public.extraction_schemas (doc_type, version, schema_json, description, is_active)
select
  'chess_brochure',
  1,
  '{
    "type": "object",
    "required": ["tournament_name", "start_date"],
    "properties": {
      "city": { "type": "string" },
      "state": { "type": "string" },
      "venue": { "type": "string" },
      "rounds": { "type": "integer", "description": "Number of rounds" },
      "website": { "type": "string" },
      "end_date": { "type": "string", "format": "date", "description": "YYYY-MM-DD" },
      "organizer": { "type": "string", "description": "Organizing body or person" },
      "aicf_rated": { "type": "boolean" },
      "entry_fees": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "category": { "type": "string", "description": "e.g. General, Rated above 1500" },
            "currency": { "type": "string", "default": "INR" },
            "amount_inr": { "type": "number" }
          }
        }
      },
      "fide_rated": { "type": "boolean" },
      "start_date": { "type": "string", "format": "date", "description": "YYYY-MM-DD" },
      "time_control": {
        "type": "object",
        "properties": {
          "category": { "enum": ["classical", "rapid", "blitz", "bullet"], "type": "string" },
          "base_minutes": { "type": "integer" },
          "increment_seconds": { "type": "integer" }
        }
      },
      "chief_arbiter": { "type": "string" },
      "contact_email": { "type": "string" },
      "contact_phone": { "type": "string" },
      "tournament_name": { "type": "string", "description": "Full tournament title" },
      "prize_categories": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string", "description": "e.g. Open, Under-1500, Under-11 Boys" },
            "prizes": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "place": { "type": "integer" },
                  "has_medal": { "type": "boolean" },
                  "has_trophy": { "type": "boolean" },
                  "cash_amount": { "type": "number" },
                  "gift_description": { "type": "string" }
                }
              }
            },
            "is_main": { "type": "boolean" },
            "criteria": {
              "type": "object",
              "properties": {
                "gender": { "enum": ["male", "female", "any"], "type": "string" },
                "age_max": { "type": "integer" },
                "rating_max": { "type": "integer" },
                "rating_min": { "type": "integer" }
              }
            }
          }
        }
      },
      "total_prize_fund": { "type": "number", "description": "Total cash prize fund" },
      "tournament_director": { "type": "string" },
      "registration_deadline": { "type": "string", "format": "date" }
    }
  }'::jsonb,
  'Chess tournament brochure — v1 schema covering event details, entry fees, prize structure, and contact info. Maps directly to Prize Manager tournaments/categories/prizes tables.',
  false
where not exists (
  select 1 from public.extraction_schemas where doc_type = 'chess_brochure' and version = 1
);
