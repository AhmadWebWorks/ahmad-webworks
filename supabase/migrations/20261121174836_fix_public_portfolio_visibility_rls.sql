create or replace function private.is_active_employee(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = check_user_id and p.account_status = 'active'
  );
$$;

revoke all on function private.is_active_employee(uuid) from public;
grant execute on function private.is_active_employee(uuid) to anon, authenticated;

drop policy if exists "Public read approved portfolios" on public.employee_portfolios;
create policy "Public read approved portfolios"
on public.employee_portfolios for select to anon, authenticated
using (
  is_published = true and review_status = 'approved'
  and (select private.is_active_employee(owner_id))
);

drop policy if exists "Public read approved projects" on public.portfolio_projects;
create policy "Public read approved projects"
on public.portfolio_projects for select to anon, authenticated
using (
  is_published = true and review_status = 'approved'
  and (select private.is_active_employee(owner_id))
);
