drop function if exists public.employee_start_work(uuid);

drop policy if exists "Founder updates work assignments" on public.work_assignments;
create policy "Users update permitted work assignments"
on public.work_assignments for update to authenticated
using (
  (select private.is_admin())
  or (
    assigned_to = (select auth.uid())
    and status in ('assigned','revision_requested')
    and (select private.is_active_employee(assigned_to))
  )
)
with check (
  (select private.is_admin())
  or (
    assigned_to = (select auth.uid())
    and status = 'in_progress'
    and (select private.is_active_employee(assigned_to))
  )
);

create or replace function private.guard_employee_work_assignment_update()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if (select private.is_admin()) then
    return new;
  end if;

  if auth.uid() is null
     or not private.is_active_employee(auth.uid()) then
    raise exception 'Active employee access required.';
  end if;

  if new.id is distinct from old.id
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.assigned_to is distinct from old.assigned_to
     or new.assigned_by is distinct from old.assigned_by
     or new.priority is distinct from old.priority
     or new.due_at is distinct from old.due_at
     or new.created_at is distinct from old.created_at then
    raise exception 'Employees may only update assignment progress.';
  end if;

  if old.assigned_to <> auth.uid()
     or old.status not in ('assigned','revision_requested')
     or new.status <> 'in_progress' then
    raise exception 'This assignment cannot be started or changed.';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_employee_work_assignment_update() from public, anon, authenticated;
drop trigger if exists guard_employee_work_assignment_update on public.work_assignments;
create trigger guard_employee_work_assignment_update
before update on public.work_assignments
for each row execute function private.guard_employee_work_assignment_update();