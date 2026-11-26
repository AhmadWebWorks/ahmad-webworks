-- Recovered schema definition for the production assistant database.
-- This file is reconstructed from the live Supabase catalog because the original
-- migration source was absent from the repository. The matching version is already
-- recorded as applied in production; this file restores reproducibility for new setups.

create table public.assistant_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type = any (array['website_page','github_file','faq','business_input','project','policy']::text[])),
  source_path text not null,
  source_url text,
  title text not null,
  content_hash text,
  sync_status text not null default 'pending' check (sync_status = any (array['pending','synced','changed','error','archived']::text[])),
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_sources_source_type_source_path_key unique (source_type, source_path)
);
comment on table public.assistant_sources is 'Source registry for verified Ahmad WebWorks assistant knowledge.';

create table public.assistant_knowledge (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.assistant_sources(id) on delete set null,
  slug text not null,
  category text not null check (category = any (array['business','service','pricing','process','portfolio','contact','policy','faq','capability']::text[])),
  title text not null,
  content text not null check (char_length(content) >= 10 and char_length(content) <= 12000),
  keywords text[] not null default '{}'::text[],
  status text not null default 'draft' check (status = any (array['draft','approved','archived']::text[])),
  is_public boolean not null default false,
  priority smallint not null default 0 check (priority >= -100 and priority <= 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_knowledge_source_id_slug_key unique (source_id, slug)
);
comment on table public.assistant_knowledge is 'Approved business knowledge and FAQ records retrieved by the Ahmad WebWorks assistant.';

create table public.assistant_sessions (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null default gen_random_uuid(),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
comment on table public.assistant_sessions is 'Anonymous visitor chat sessions; no IP address is stored.';

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assistant_sessions(id) on delete cascade,
  role text not null check (role = any (array['user','assistant','system']::text[])),
  content text not null check (char_length(content) >= 1 and char_length(content) <= 5000),
  matched_knowledge_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now()
);
comment on table public.assistant_messages is 'Visitor and assistant conversation messages.';

create table public.assistant_leads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.assistant_sessions(id) on delete set null,
  name text not null check (char_length(trim(name)) >= 2 and char_length(trim(name)) <= 120),
  email text check (email is null or email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$'),
  phone text,
  business_name text,
  service_interest text,
  budget_range text,
  project_details text not null check (char_length(trim(project_details)) >= 10 and char_length(trim(project_details)) <= 5000),
  existing_website text,
  preferred_contact text not null default 'email' check (preferred_contact = any (array['email','whatsapp','either']::text[])),
  consent boolean not null default false check (consent = true),
  consent_text_version text not null,
  source_page text,
  status text not null default 'new' check (status = any (array['new','contacted','qualified','closed','spam']::text[])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_leads_contact_required check (
    nullif(trim(coalesce(email, '')), '') is not null or nullif(trim(coalesce(phone, '')), '') is not null
  )
);
comment on table public.assistant_leads is 'Project inquiries submitted with explicit visitor consent.';

create table public.assistant_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.assistant_sessions(id) on delete set null,
  message_id uuid references public.assistant_messages(id) on delete set null,
  helpful boolean not null,
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);
comment on table public.assistant_feedback is 'Visitor feedback on assistant responses.';

create index assistant_knowledge_category_idx on public.assistant_knowledge using btree (category);
create index assistant_knowledge_keywords_gin on public.assistant_knowledge using gin (keywords);
create index assistant_knowledge_status_public_idx on public.assistant_knowledge using btree (status, is_public, priority desc);
create index assistant_sessions_visitor_idx on public.assistant_sessions using btree (visitor_id, started_at desc);
create index assistant_messages_session_time_idx on public.assistant_messages using btree (session_id, created_at);
create index assistant_leads_created_idx on public.assistant_leads using btree (created_at desc);
create index assistant_leads_status_idx on public.assistant_leads using btree (status, created_at desc);

alter table public.assistant_sources enable row level security;
alter table public.assistant_knowledge enable row level security;
alter table public.assistant_sessions enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_leads enable row level security;
alter table public.assistant_feedback enable row level security;
