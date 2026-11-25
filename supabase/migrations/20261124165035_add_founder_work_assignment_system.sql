create table public.work_assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 180),
  description text not null default '',
  assigned_to uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status text not null default 'assigned' check (status in ('assigned','in_progress','submitted','approved','revision_requested','cancelled')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index work_assignments_assigned_to_idx on public.work_assignments(assigned_to, created_at desc);
create index work_assignments_status_idx on public.work_assignments(status, due_at);

create table public.work_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.work_assignments(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(trim(message)) >= 5),
  attachment_url text,
  review_status text not null default 'pending' check (review_status in ('pending','approved','revision_requested')),
  reviewer_feedback text,
  reviewed_by uuid references public.profiles(id),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index work_submissions_assignment_idx on public.work_submissions(assignment_id, submitted_at desc);
create index work_submissions_employee_idx on public.work_submissions(employee_id, submitted_at desc);

alter table public.work_assignments enable row level security;
alter table public.work_submissions enable row level security;

grant select, insert, update, delete on public.work_assignments to authenticated;
grant select, update, delete on public.work_submissions to authenticated;
grant insert (assignment_id, employee_id, message, attachment_url) on public.work_submissions to authenticated;

create policy "Founder manages work assignments"
on public.work_assignments
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Employees read their own assignments"
on public.work_assignments
for select to authenticated
using (
  assigned_to = (select auth.uid())
  and (select private.is_active_employee(assigned_to))
);

create policy "Founder manages work submissions"
on public.work_submissions
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Employees read their own work submissions"
on public.work_submissions
for select to authenticated
using (
  employee_id = (select auth.uid())
  and (select private.is_active_employee(employee_id))
);

create policy "Employees submit work for assigned tasks"
on public.work_submissions
for insert to authenticated
with check (
  employee_id = (select auth.uid())
  and (select private.is_active_employee(employee_id))
  and exists (
    select 1
    from public.work_assignments wa
    where wa.id = assignment_id
      and wa.assigned_to = (select auth.uid())
      and wa.status in ('assigned','in_progress','revision_requested')
  )
);

comment on table public.work_assignments is 'Founder-created work assigned to active Ahmad WebWorks employees.';
comment on table public.work_submissions is 'Employee work submissions and Founder review feedback.';