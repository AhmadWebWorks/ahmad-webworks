create or replace function public.guard_employee_application_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.is_admin()) then
    return new;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'pa'
      and p.account_status = 'active'
  ) then
    raise exception 'Only an active Founder or PA can update applications';
  end if;

  if (to_jsonb(new) - array['status', 'admin_notes', 'reviewed_at'])
     is distinct from
     (to_jsonb(old) - array['status', 'admin_notes', 'reviewed_at']) then
    raise exception 'PA users may only update application review status and notes';
  end if;

  if new.status is distinct from old.status
     and new.status <> 'under_review' then
    raise exception 'PA users may only mark applications under review';
  end if;

  if new.status is distinct from old.status then
    new.reviewed_at := now();
  else
    new.reviewed_at := old.reviewed_at;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_employee_application_update on public.employee_applications;

create trigger guard_employee_application_update
before update on public.employee_applications
for each row
execute function public.guard_employee_application_update();
