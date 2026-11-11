-- NEXORA Phase 1 schema. Additive only: existing notes/files data is untouched.
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------- fix: edits must bump synced_at so other devices pull them ----------
create or replace function public.touch_synced_at() returns trigger language plpgsql set search_path = '' as $$
begin new.synced_at := now(); return new; end $$;
drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before insert or update on public.notes for each row execute function public.touch_synced_at();
drop trigger if exists files_touch on public.files;
create trigger files_touch before insert or update on public.files for each row execute function public.touch_synced_at();

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- ---------- identity ----------
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  display_name text, timezone text default 'Asia/Bangkok', locale text default 'en',
  plan text not null default 'free' check (plan in ('free','plus','pro','business')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table if not exists public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  ai_processing boolean not null default true,          -- Level 1 automatic processing
  auto_organize boolean not null default false,         -- Level 2 apply AI filing suggestions
  memory_suggestions boolean not null default true,     -- propose memories (always need approval)
  task_creation text not null default 'suggest' check (task_creation in ('off','suggest','auto')),
  calendar_permission text not null default 'off' check (calendar_permission in ('off','suggest','manage')),
  background_processing boolean not null default true,
  notifications jsonb not null default '{"briefing":true,"quiet":["22:00","07:00"]}',
  data_retention_days int,
  updated_at timestamptz not null default now());

create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  scope text not null, level text not null default 'ask' check (level in ('deny','ask','allow')),
  granted_at timestamptz not null default now(), unique (user_id, scope));

-- ---------- capture pipeline ----------
create table if not exists public.inbox_items (
  note_id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  status text not null default 'received' check (status in ('received','processing','organized','needs_review','failed')),
  source text not null default 'text',  -- text, voice, photo, file, link, paste, share, import
  result jsonb, error text, attempts int not null default 0,
  applied jsonb,                           -- what was auto-applied (for undo)
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), processed_at timestamptz);

-- ---------- conversations ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null default 'New conversation', project_ref text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null, citations jsonb not null default '[]', model text,
  tokens_in int, tokens_out int, created_at timestamptz not null default now());

-- ---------- memory ----------
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  layer text not null default 'knowledge' check (layer in ('experience','knowledge')),
  category text not null default 'personal',   -- personal, preference, work, business, project, person, goal, skill, decision, commitment
  kind text not null default 'fact' check (kind in ('fact','preference','temporary','suggestion','assumption')),
  status text not null default 'suggested' check (status in ('suggested','confirmed','rejected','outdated')),
  content text not null,
  importance smallint not null default 3 check (importance between 1 and 5),
  confidence real not null default 0.7 check (confidence between 0 and 1),
  expires_at timestamptz,
  source_type text, source_id text, source_excerpt text,
  conflicts_with uuid references public.memories on delete set null,
  embedding extensions.vector(384), version int not null default 1,
  created_by text not null default 'user' check (created_by in ('user','ai')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);

create table if not exists public.memory_versions (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  version int not null, content text not null, status text, changed_by text not null default 'user', reason text,
  created_at timestamptz not null default now());

create table if not exists public.memory_sources (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  source_type text not null, source_id text not null, excerpt text, created_at timestamptz not null default now());

-- ---------- retrieval ----------
create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  source_type text not null check (source_type in ('note','file','message','memory')),
  source_id text not null, chunk_index int not null default 0,
  title text, content text not null, content_hash text not null,
  embedding extensions.vector(384),
  tsv tsvector generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || content)) stored,
  source_updated bigint, created_at timestamptz not null default now(),
  unique (user_id, source_type, source_id, chunk_index));

create table if not exists public.index_queue (
  user_id uuid not null references auth.users on delete cascade,
  source_type text not null, source_id text not null, queued_at timestamptz not null default now(),
  primary key (user_id, source_type, source_id));

create or replace function public.queue_note_index() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted then
    delete from public.knowledge_chunks where user_id = new.user_id and source_type = 'note' and source_id = new.id;
    delete from public.index_queue where user_id = new.user_id and source_type = 'note' and source_id = new.id;
  else
    insert into public.index_queue(user_id, source_type, source_id) values (new.user_id, 'note', new.id)
    on conflict (user_id, source_type, source_id) do update set queued_at = now();
  end if;
  return new;
end $$;
drop trigger if exists notes_queue_index on public.notes;
create trigger notes_queue_index after insert or update of data, deleted on public.notes for each row execute function public.queue_note_index();

-- ---------- knowledge graph ----------
create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null, name text not null, normalized text generated always as (lower(trim(name))) stored,
  data jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, kind, normalized));

create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  from_type text not null, from_id text not null, to_type text not null, to_id text not null,
  rel text not null default 'related', strength real not null default 0.5, explanation text,
  created_by text not null default 'ai', created_at timestamptz not null default now(),
  unique (user_id, from_type, from_id, to_type, to_id, rel));

-- ---------- structured modules (Phase 3+, created now so the model is complete) ----------
create table if not exists public.workspaces (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, kind text not null default 'personal', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table if not exists public.businesses (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, workspace_id uuid references public.workspaces on delete set null, name text not null, description text, industry text, data jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table if not exists public.projects (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, business_id uuid references public.businesses on delete set null, name text not null, description text, objectives text, status text not null default 'active' check (status in ('idea','active','paused','done','archived')), start_date date, deadline date, budget numeric, progress smallint default 0, data jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table if not exists public.goals (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, title text not null, area text, target_date date, progress smallint default 0, status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table if not exists public.tasks (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, project_id uuid references public.projects on delete set null, goal_id uuid references public.goals on delete set null, note_id text, title text not null, details text, priority smallint not null default 3 check (priority between 1 and 5), due_at timestamptz, recurrence text, depends_on uuid references public.tasks on delete set null, status text not null default 'todo' check (status in ('todo','doing','done','cancelled')), created_by text not null default 'user', source_type text, source_id text, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table if not exists public.habits (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, title text not null, schedule text not null default 'daily', log jsonb not null default '[]', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table if not exists public.contacts (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, relationship text, organization text, email text, phone text, important_dates jsonb not null default '[]', notes text, data jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table if not exists public.calendar_events (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, title text not null, starts_at timestamptz not null, ends_at timestamptz, all_day boolean not null default false, location text, recurrence text, project_id uuid references public.projects on delete set null, external_id text, provider text, status text not null default 'confirmed' check (status in ('suggested','confirmed','cancelled')), source_type text, source_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table if not exists public.financial_records (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, business_id uuid references public.businesses on delete set null, kind text not null check (kind in ('income','expense','subscription','budget','goal')), amount numeric not null, currency text not null default 'THB', category text, description text, occurred_on date, recurrence text, verified boolean not null default false, source_type text, source_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table if not exists public.automations (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, description text, trigger jsonb not null, conditions jsonb not null default '[]', actions jsonb not null, enabled boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.automation_runs (id uuid primary key default gen_random_uuid(), automation_id uuid not null references public.automations on delete cascade, user_id uuid not null default auth.uid() references auth.users on delete cascade, status text not null default 'queued' check (status in ('queued','running','succeeded','failed','skipped')), idempotency_key text, attempts int not null default 0, error text, output jsonb, started_at timestamptz, finished_at timestamptz, created_at timestamptz not null default now(), unique (automation_id, idempotency_key));
create table if not exists public.integrations (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, provider text not null, status text not null default 'disconnected' check (status in ('disconnected','connected','error')), scopes text[] not null default '{}', last_sync_at timestamptz, error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, provider));
create table if not exists public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, kind text not null, title text not null, body text, link text, read_at timestamptz, created_at timestamptz not null default now());

-- ---------- accountability ----------
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users on delete cascade, day date not null default current_date,
  feature text not null, requests int not null default 0, tokens_in bigint not null default 0, tokens_out bigint not null default 0,
  primary key (user_id, day, feature));
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  actor text not null check (actor in ('user','ai','system')), action text not null,
  target_type text, target_id text, details jsonb not null default '{}', created_at timestamptz not null default now());

-- ---------- RLS: owner-only on every table ----------
do $$ declare t text; begin
  foreach t in array array['profiles','user_preferences','user_permissions','inbox_items','conversations','messages','memories','memory_versions','memory_sources','knowledge_chunks','index_queue','entities','relationships','workspaces','businesses','projects','goals','tasks','habits','contacts','calendar_events','financial_records','automations','automation_runs','integrations','notifications','ai_usage','audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner all" on public.%I', t);
    execute format('create policy "owner all" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
  foreach t in array array['profiles','user_preferences','inbox_items','conversations','memories','entities','workspaces','businesses','projects','goals','tasks','habits','contacts','calendar_events','financial_records','automations','integrations'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
-- usage and audit are written by the server; users may read their own only
drop policy if exists "owner all" on public.ai_usage;
create policy "owner read" on public.ai_usage for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "owner all" on public.audit_logs;
create policy "owner read" on public.audit_logs for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner insert" on public.audit_logs for insert to authenticated with check ((select auth.uid()) = user_id);

-- ---------- indexes ----------
create index if not exists inbox_user_status on public.inbox_items(user_id, status, created_at desc);
create index if not exists conv_user on public.conversations(user_id, updated_at desc) where deleted_at is null;
create index if not exists msg_conv on public.messages(conversation_id, created_at);
create index if not exists msg_user on public.messages(user_id);
create index if not exists mem_user on public.memories(user_id, status, updated_at desc) where deleted_at is null;
create index if not exists mem_emb on public.memories using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists memv_mem on public.memory_versions(memory_id, version);
create index if not exists mems_mem on public.memory_sources(memory_id);
create index if not exists chunk_emb on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists chunk_tsv on public.knowledge_chunks using gin (tsv);
create index if not exists chunk_src on public.knowledge_chunks(user_id, source_type, source_id);
create index if not exists rel_from on public.relationships(user_id, from_type, from_id);
create index if not exists rel_to on public.relationships(user_id, to_type, to_id);
create index if not exists tasks_user_due on public.tasks(user_id, status, due_at);
create index if not exists events_user_time on public.calendar_events(user_id, starts_at);
create index if not exists audit_user on public.audit_logs(user_id, created_at desc);
create index if not exists fin_user on public.financial_records(user_id, occurred_on desc);

-- ---------- hybrid search (caller's rows only: security invoker + RLS) ----------
create or replace function public.nexora_search(q text, q_embedding extensions.vector(384), n int default 12)
returns table (source_type text, source_id text, title text, content text, score real)
language sql stable security invoker set search_path = '' as $$
  with kw as (
    select c.id, row_number() over (order by ts_rank_cd(c.tsv, websearch_to_tsquery('simple', q)) desc) r
    from public.knowledge_chunks c
    where q <> '' and c.tsv @@ websearch_to_tsquery('simple', q)
    limit 40),
  sem as (
    select c.id, row_number() over (order by c.embedding operator(extensions.<=>) q_embedding) r
    from public.knowledge_chunks c
    where q_embedding is not null and c.embedding is not null
    order by c.embedding operator(extensions.<=>) q_embedding limit 40),
  fused as (
    select id, sum(1.0 / (60 + r))::real s from (select * from kw union all select * from sem) u group by id)
  select c.source_type, c.source_id, c.title, c.content, f.s
  from fused f join public.knowledge_chunks c on c.id = f.id
  order by f.s desc limit n
$$;

create or replace function public.nexora_match_memories(q_embedding extensions.vector(384), n int default 8, min_sim real default 0.25)
returns table (id uuid, content text, category text, kind text, status text, confidence real, source_type text, source_id text, updated_at timestamptz, similarity real)
language sql stable security invoker set search_path = '' as $$
  select m.id, m.content, m.category, m.kind, m.status, m.confidence, m.source_type, m.source_id, m.updated_at,
         (1 - (m.embedding operator(extensions.<=>) q_embedding))::real
  from public.memories m
  where m.deleted_at is null and m.status in ('confirmed','suggested') and m.embedding is not null
    and (m.expires_at is null or m.expires_at > now())
    and 1 - (m.embedding operator(extensions.<=>) q_embedding) >= min_sim
  order by m.embedding operator(extensions.<=>) q_embedding limit n
$$;

-- Permanently delete everything the caller has in the cloud (spec §12 permanent deletion).
create or replace function public.nexora_delete_my_data() returns void language plpgsql security invoker set search_path = '' as $$
declare me uuid := auth.uid(); begin
  if me is null then raise exception 'not signed in'; end if;
  delete from public.messages where user_id = me; delete from public.conversations where user_id = me;
  delete from public.memory_sources where user_id = me; delete from public.memory_versions where user_id = me; delete from public.memories where user_id = me;
  delete from public.knowledge_chunks where user_id = me; delete from public.index_queue where user_id = me;
  delete from public.inbox_items where user_id = me; delete from public.relationships where user_id = me; delete from public.entities where user_id = me;
  delete from public.tasks where user_id = me; delete from public.projects where user_id = me; delete from public.goals where user_id = me;
  delete from public.habits where user_id = me; delete from public.contacts where user_id = me; delete from public.calendar_events where user_id = me;
  delete from public.financial_records where user_id = me; delete from public.businesses where user_id = me; delete from public.workspaces where user_id = me;
  delete from public.automation_runs where user_id = me; delete from public.automations where user_id = me; delete from public.integrations where user_id = me;
  delete from public.notifications where user_id = me; delete from public.notes where user_id = me; delete from public.files where user_id = me;
end $$;

grant execute on function public.nexora_search(text, extensions.vector, int) to authenticated;
grant execute on function public.nexora_match_memories(extensions.vector, int, real) to authenticated;
grant execute on function public.nexora_delete_my_data() to authenticated;
revoke execute on function public.nexora_search(text, extensions.vector, int) from anon, public;
revoke execute on function public.nexora_match_memories(extensions.vector, int, real) from anon, public;
revoke execute on function public.nexora_delete_my_data() from anon, public;
revoke execute on function public.queue_note_index() from anon, authenticated, public;
