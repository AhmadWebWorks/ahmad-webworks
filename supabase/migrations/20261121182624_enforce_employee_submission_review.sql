create or replace function public.guard_employee_portfolio_insert()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select private.is_admin()) then
    return new;
  end if;
  if auth.uid() is null or new.owner_id <> auth.uid() then
    raise exception 'Not allowed to create this portfolio';
  end if;
  new.review_status := 'pending';
  new.is_published := false;
  return new;
end;
$$;

create or replace function public.guard_employee_project_insert()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select private.is_admin()) then
    return new;
  end if;
  if auth.uid() is null or new.owner_id <> auth.uid() then
    raise exception 'Not allowed to create this project';
  end if;
  new.review_status := 'pending';
  new.is_published := false;
  return new;
end;
$$;

drop trigger if exists guard_employee_portfolio_insert on public.employee_portfolios;
create trigger guard_employee_portfolio_insert
before insert on public.employee_portfolios
for each row execute function public.guard_employee_portfolio_insert();

drop trigger if exists guard_employee_project_insert on public.portfolio_projects;
create trigger guard_employee_project_insert
before insert on public.portfolio_projects
for each row execute function public.guard_employee_project_insert();

revoke all on function public.guard_employee_portfolio_insert() from public, anon, authenticated;
revoke all on function public.guard_employee_project_insert() from public, anon, authenticated;
