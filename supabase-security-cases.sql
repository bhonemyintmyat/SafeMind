-- Case files, continuous-learning labels, and similarity-ready vector storage.
create extension if not exists vector with schema extensions;

create table if not exists public.security_cases (
    case_id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    agent_run_id uuid references public.agent_runs(run_id) on delete set null,
    case_number text not null unique,
    input_type text not null check (input_type in ('message', 'link', 'phone', 'email')),
    status text not null check (status in ('Safe', 'Suspicious', 'Likely Scam', 'High Risk', 'Critical')),
    confidence smallint not null check (confidence between 0 and 100),
    risk_score smallint not null check (risk_score between 0 and 100),
    threat_type text not null,
    investigation jsonb not null check (octet_length(investigation::text) <= 100000),
    content_stored boolean not null default false check (content_stored = false),
    created_at timestamptz not null default now()
);
create index if not exists security_cases_user_created_idx on public.security_cases (user_id, created_at desc);
create index if not exists security_cases_status_created_idx on public.security_cases (status, created_at desc);
alter table public.security_cases enable row level security;
drop policy if exists "users create their case files" on public.security_cases;
create policy "users create their case files" on public.security_cases for insert to authenticated
with check (auth.uid() = user_id and content_stored = false);
drop policy if exists "users read their case files" on public.security_cases;
create policy "users read their case files" on public.security_cases for select to authenticated
using (auth.uid() = user_id);
drop policy if exists "admins read all case files" on public.security_cases;
create policy "admins read all case files" on public.security_cases for select to authenticated
using (public.is_safemind_admin());

create table if not exists public.case_feedback (
    case_id uuid primary key references public.security_cases(case_id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    label text not null check (label in ('correct', 'incorrect', 'false_positive', 'false_negative')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
alter table public.case_feedback enable row level security;
drop policy if exists "users read their case feedback" on public.case_feedback;
create policy "users read their case feedback" on public.case_feedback for select to authenticated using (auth.uid() = user_id);
drop policy if exists "admins read case feedback" on public.case_feedback;
create policy "admins read case feedback" on public.case_feedback for select to authenticated using (public.is_safemind_admin());

create or replace function public.submit_case_feedback(target_case_id uuid, feedback_label text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
    if auth.uid() is null or feedback_label not in ('correct', 'incorrect', 'false_positive', 'false_negative') then raise exception 'Invalid feedback'; end if;
    if not exists (select 1 from public.security_cases where case_id = target_case_id and user_id = auth.uid()) then return false; end if;
    insert into public.case_feedback (case_id, user_id, label) values (target_case_id, auth.uid(), feedback_label)
    on conflict (case_id) do update set label = excluded.label, updated_at = now();
    return true;
end;
$$;
revoke all on function public.submit_case_feedback(uuid, text) from public;
grant execute on function public.submit_case_feedback(uuid, text) to authenticated;

create table if not exists public.case_embeddings (
    case_id uuid primary key references public.security_cases(case_id) on delete cascade,
    embedding extensions.vector(384) not null,
    model text not null,
    created_at timestamptz not null default now()
);
alter table public.case_embeddings enable row level security;
drop policy if exists "users read their case embeddings" on public.case_embeddings;
create policy "users read their case embeddings" on public.case_embeddings for select to authenticated
using (exists (select 1 from public.security_cases c where c.case_id = case_embeddings.case_id and c.user_id = auth.uid()));
drop policy if exists "admins manage case embeddings" on public.case_embeddings;
create policy "admins manage case embeddings" on public.case_embeddings for all to authenticated
using (public.is_safemind_admin()) with check (public.is_safemind_admin());

create or replace function public.match_security_cases(
    query_embedding extensions.vector(384),
    match_threshold double precision default 0.75,
    match_count integer default 8
)
returns table (case_id uuid, case_number text, threat_type text, status text, similarity double precision)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
    select c.case_id, c.case_number, c.threat_type, c.status,
           1 - (e.embedding <=> query_embedding) as similarity
    from public.case_embeddings e
    join public.security_cases c on c.case_id = e.case_id
    where (c.user_id = auth.uid() or public.is_safemind_admin())
      and 1 - (e.embedding <=> query_embedding) >= match_threshold
    order by e.embedding <=> query_embedding
    limit least(greatest(match_count, 1), 50);
$$;
revoke all on function public.match_security_cases(extensions.vector, double precision, integer) from public;
grant execute on function public.match_security_cases(extensions.vector, double precision, integer) to authenticated;

create table if not exists public.knowledge_documents (
    id bigint generated by default as identity primary key,
    title text not null,
    source_name text not null,
    source_url text,
    content text not null,
    embedding extensions.vector(384),
    published_at timestamptz,
    created_at timestamptz not null default now()
);
alter table public.knowledge_documents enable row level security;
drop policy if exists "authenticated users read knowledge" on public.knowledge_documents;
create policy "authenticated users read knowledge" on public.knowledge_documents for select to authenticated using (true);
drop policy if exists "admins manage knowledge" on public.knowledge_documents;
create policy "admins manage knowledge" on public.knowledge_documents for all to authenticated
using (public.is_safemind_admin()) with check (public.is_safemind_admin());

create or replace function public.match_knowledge(
    query_embedding extensions.vector(384),
    match_threshold double precision default 0.72,
    match_count integer default 6
)
returns table (id bigint, title text, source_name text, source_url text, content text, similarity double precision)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
    select d.id, d.title, d.source_name, d.source_url, d.content,
           1 - (d.embedding <=> query_embedding) as similarity
    from public.knowledge_documents d
    where d.embedding is not null
      and 1 - (d.embedding <=> query_embedding) >= match_threshold
    order by d.embedding <=> query_embedding
    limit least(greatest(match_count, 1), 20);
$$;
revoke all on function public.match_knowledge(extensions.vector, double precision, integer) from public;
grant execute on function public.match_knowledge(extensions.vector, double precision, integer) to authenticated;
