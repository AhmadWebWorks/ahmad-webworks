drop policy if exists "Admins and PA manage applications" on public.employee_applications;

create policy "Admins and PA read applications"
on public.employee_applications
for select
to authenticated
using ((select private.is_admin_or_pa()));

create policy "Admins and PA update applications"
on public.employee_applications
for update
to authenticated
using ((select private.is_admin_or_pa()))
with check ((select private.is_admin_or_pa()));
