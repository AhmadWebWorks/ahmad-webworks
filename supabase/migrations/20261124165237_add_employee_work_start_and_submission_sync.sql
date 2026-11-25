create or replace function public.employee_start_work(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null
     or not private.is_active_employee(current_user_id) then
    raise exception 'Active employee access required.';
  end if;

  update public.work_assignments
  set status = 'in_progress',
      updated_at = now()
  where id = p_assignment_id
    and assigned_to = current_user_id
    and status in ('assigned','revision_requested');

  if not found then
    raise exception 'This assignment cannot be started. Refresh the page and check its status.';
  end if;
end;
$function$;

revoke all on function public.employee_start_work(uuid) from public, anon;
grant execute on function public.employee_start_work(uuid) to authenticated;

create or replace function private.sync_assignment_after_work_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or auth.uid() <> new.employee_id
     or not private.is_active_employee(new.employee_id) then
    raise exception 'Only the assigned active employee can submit work.';
  end if;

  update public.work_assignments
  set status = 'submitted',
      updated_at = now()
  where id = new.assignment_id
    and assigned_to = new.employee_id
    and status in ('in_progress','assigned','revision_requested');

  if not found then
    raise exception 'The assignment is not available for submission.';
  end if;

  return new;
end;
$function$;

revoke all on function private.sync_assignment_after_work_submission() from public, anon, authenticated;

drop trigger if exists sync_assignment_after_work_submission on public.work_submissions;
create trigger sync_assignment_after_work_submission
after insert on public.work_submissions
for each row execute function private.sync_assignment_after_work_submission();