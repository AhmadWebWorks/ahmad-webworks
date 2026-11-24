drop policy if exists "Read permitted employee portfolios" on public.employee_portfolios;
create policy "Users read permitted employee portfolios"
on public.employee_portfolios
for select
to authenticated
using (
  (owner_id = (select auth.uid())
   and (select private.is_active_employee(owner_id)))
  or (select private.is_admin())
  or (
    is_published = true
    and review_status = 'approved'
    and (select private.is_active_employee(owner_id))
  )
);
create policy "Public read approved portfolios"
on public.employee_portfolios
for select
to anon
using (
  is_published = true
  and review_status = 'approved'
  and (select private.is_active_employee(owner_id))
);

drop policy if exists "Read permitted portfolio projects" on public.portfolio_projects;
create policy "Users read permitted portfolio projects"
on public.portfolio_projects
for select
to authenticated
using (
  (owner_id = (select auth.uid())
   and (select private.is_active_employee(owner_id)))
  or (select private.is_admin())
  or (
    is_published = true
    and review_status = 'approved'
    and (select private.is_active_employee(owner_id))
  )
);
create policy "Public read approved projects"
on public.portfolio_projects
for select
to anon
using (
  is_published = true
  and review_status = 'approved'
  and (select private.is_active_employee(owner_id))
);
