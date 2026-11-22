create policy "Admins delete applications" on public.employee_applications for delete to authenticated using ((select private.is_admin()));
