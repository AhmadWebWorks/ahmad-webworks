-- Restrict employee portfolio access to active employee accounts.
-- Keep Founder access, public approved-profile visibility, and PA application-only access.

create or replace function private.is_active_employee(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = check_user_id
      and p.role = 'employee'
      and p.account_status = 'active'
  );
$$;

drop policy if exists "Employees create own portfolio" on public.employee_portfolios;
create policy "Employees create own portfolio"
on public.employee_portfolios
for insert
to authenticated
with check (
  (owner_id = (select auth.uid())
   and (select private.is_active_employee(owner_id)))
  or (select private.is_admin())
);

drop policy if exists "Employees read own portfolio" on public.employee_portfolios;
drop policy if exists "Public read approved portfolios" on public.employee_portfolios;
create policy "Read permitted employee portfolios"
on public.employee_portfolios
for select
to anon, authenticated
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

drop policy if exists "Employees update own portfolio" on public.employee_portfolios;
create policy "Employees update own portfolio"
on public.employee_portfolios
for update
to authenticated
using (
  (owner_id = (select auth.uid())
   and (select private.is_active_employee(owner_id)))
  or (select private.is_admin())
)
with check (
  (owner_id = (select auth.uid())
   and (select private.is_active_employee(owner_id)))
  or (select private.is_admin())
);

drop policy if exists "Employees create own projects" on public.portfolio_projects;
create policy "Employees create own projects"
on public.portfolio_projects
for insert
to authenticated
with check (
  (owner_id = (select auth.uid())
   and (select private.is_active_employee(owner_id)))
  or (select private.is_admin())
);

drop policy if exists "Owners and admins read projects" on public.portfolio_projects;
drop policy if exists "Public read approved projects" on public.portfolio_projects;
create policy "Read permitted portfolio projects"
on public.portfolio_projects
for select
to anon, authenticated
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

drop policy if exists "Employees update own projects" on public.portfolio_projects;
create policy "Employees update own projects"
on public.portfolio_projects
for update
to authenticated
using (
  (owner_id = (select auth.uid())
   and (select private.is_active_employee(owner_id)))
  or (select private.is_admin())
)
with check (
  (owner_id = (select auth.uid())
   and (select private.is_active_employee(owner_id)))
  or (select private.is_admin())
);

drop policy if exists "Employees delete own draft projects" on public.portfolio_projects;
create policy "Employees delete own draft projects"
on public.portfolio_projects
for delete
to authenticated
using (
  (
    owner_id = (select auth.uid())
    and (select private.is_active_employee(owner_id))
    and review_status = any (array['draft'::text, 'rejected'::text])
    and is_published = false
  )
  or (select private.is_admin())
);

drop policy if exists "Admins manage profiles" on public.profiles;

create policy "Admins insert profiles"
on public.profiles
for insert
to authenticated
with check ((select private.is_admin()));

create policy "Admins update profiles"
on public.profiles
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Admins delete profiles"
on public.profiles
for delete
to authenticated
using ((select private.is_admin()));
