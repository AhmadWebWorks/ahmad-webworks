drop policy if exists "Founder manages work assignments" on public.work_assignments;
drop policy if exists "Employees read their own assignments" on public.work_assignments;
create policy "Users read permitted work assignments"
on public.work_assignments for select to authenticated
using (
  (select private.is_admin())
  or (
    assigned_to = (select auth.uid())
    and (select private.is_active_employee(assigned_to))
  )
);
create policy "Founder inserts work assignments"
on public.work_assignments for insert to authenticated
with check ((select private.is_admin()));
create policy "Founder updates work assignments"
on public.work_assignments for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Founder deletes work assignments"
on public.work_assignments for delete to authenticated
using ((select private.is_admin()));

drop policy if exists "Founder manages work submissions" on public.work_submissions;
drop policy if exists "Employees read their own work submissions" on public.work_submissions;
create policy "Users read permitted work submissions"
on public.work_submissions for select to authenticated
using (
  (select private.is_admin())
  or (
    employee_id = (select auth.uid())
    and (select private.is_active_employee(employee_id))
  )
);
create policy "Founder updates work submissions"
on public.work_submissions for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "Founder deletes work submissions"
on public.work_submissions for delete to authenticated
using ((select private.is_admin()));

create index if not exists work_assignments_assigned_by_idx on public.work_assignments(assigned_by);
create index if not exists work_submissions_reviewed_by_idx on public.work_submissions(reviewed_by);