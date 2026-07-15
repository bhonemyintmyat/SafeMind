-- SafeMind agent observability. Run in Supabase SQL Editor.
create table if not exists public.agent_runs (
    run_id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    intent text not null check (char_length(intent) between 1 and 80),
    intent_confidence numeric(5,4) not null check (intent_confidence between 0 and 1),
    parameters jsonb not null check (octet_length(parameters::text) <= 4000),
    selected_tools text[] not null default '{}',
    tool_selection_correct boolean,
    task_succeeded boolean not null,
    turns_to_completion smallint not null check (turns_to_completion between 1 and 100),
    feedback text check (feedback is null or feedback in ('confirm', 'cancel')),
    feedback_at timestamptz,
    estimated_cost_usd numeric(14,8) not null default 0 check (estimated_cost_usd >= 0),
    cache_hit boolean not null default false,
    latency_ms numeric(14,3) not null check (latency_ms >= 0),
    ttft_ms numeric(14,3) check (ttft_ms is null or ttft_ms >= 0),
    ttft_mode text,
    output_tokens_estimated integer check (output_tokens_estimated is null or output_tokens_estimated >= 0),
    tokens_per_second_estimated numeric(14,2) check (tokens_per_second_estimated is null or tokens_per_second_estimated >= 0),
    compute_device text not null default 'cpu',
    throughput_per_gpu numeric(14,2) check (throughput_per_gpu is null or throughput_per_gpu >= 0),
    batch_size integer not null default 1 check (batch_size > 0),
    batch_efficiency numeric(6,4) check (batch_efficiency is null or batch_efficiency between 0 and 1),
    created_at timestamptz not null default now()
);

create index if not exists agent_runs_created_idx on public.agent_runs (created_at desc);
create index if not exists agent_runs_user_created_idx on public.agent_runs (user_id, created_at desc);
alter table public.agent_runs enable row level security;

drop policy if exists "users insert their agent runs" on public.agent_runs;
create policy "users insert their agent runs"
on public.agent_runs for insert to authenticated
with check (
    auth.uid() = user_id
    and coalesce((parameters ->> 'content_stored')::boolean, false) = false
);

drop policy if exists "users read their agent runs" on public.agent_runs;
create policy "users read their agent runs"
on public.agent_runs for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "admins read all agent runs" on public.agent_runs;
create policy "admins read all agent runs"
on public.agent_runs for select to authenticated
using (public.is_safemind_admin());

create or replace function public.submit_agent_feedback(target_run_id uuid, decision text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null or decision not in ('confirm', 'cancel') then
        raise exception 'Invalid feedback';
    end if;
    update public.agent_runs
    set feedback = decision, feedback_at = now()
    where run_id = target_run_id and user_id = auth.uid();
    return found;
end;
$$;
revoke all on function public.submit_agent_feedback(uuid, text) from public;
grant execute on function public.submit_agent_feedback(uuid, text) to authenticated;
