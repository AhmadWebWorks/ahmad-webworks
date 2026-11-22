create policy "Founder deletes employee portfolios" on public.employee_portfolios for delete to authenticated using ((select private.is_admin()));
