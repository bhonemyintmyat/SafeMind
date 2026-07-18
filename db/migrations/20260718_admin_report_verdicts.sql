-- Add explicit administrator classifications to reports and keep workflow
-- metadata synchronized automatically. Run through the Supabase SQL editor
-- or the project's database migration runner.

alter table public.admin_reports add column if not exists verdict text;
alter table public.admin_reports add column if not exists reviewed_at timestamptz;
alter table public.admin_reports add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table public.admin_reports drop constraint if exists admin_reports_verdict_check;
alter table public.admin_reports add constraint admin_reports_verdict_check
check (verdict is null or verdict in ('scam', 'not_scam'));

-- Investigation reports can originate from every scanner input type.
alter table public.admin_reports drop constraint if exists admin_reports_report_type_check;
alter table public.admin_reports add constraint admin_reports_report_type_check
check (report_type in ('message', 'link', 'phone', 'email', 'qr', 'screenshot', 'other'));

create or replace function public.sync_admin_report_review()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
    if new.verdict is distinct from old.verdict then
        if new.verdict is null then
            new.status := 'reviewing';
            new.reviewed_at := null;
            new.reviewed_by := null;
        else
            new.status := case when new.verdict = 'scam' then 'confirmed' else 'dismissed' end;
            new.reviewed_at := now();
            new.reviewed_by := auth.uid();
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists admin_reports_sync_review on public.admin_reports;
create trigger admin_reports_sync_review
before update of verdict on public.admin_reports
for each row execute function public.sync_admin_report_review();

-- Prevent ordinary reporters from pre-classifying their own submissions.
drop policy if exists "users submit their own reports" on public.admin_reports;
create policy "users submit their own reports"
on public.admin_reports for insert to authenticated
with check (
    auth.uid() = reporter_id
    and status = 'pending'
    and verdict is null
    and reviewed_at is null
    and reviewed_by is null
    and (screenshot_path is null or split_part(screenshot_path, '/', 1) = auth.uid()::text)
);
