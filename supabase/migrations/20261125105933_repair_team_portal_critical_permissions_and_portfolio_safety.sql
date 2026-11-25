
-- Restore the narrow server-side permissions required by the deployed Edge Functions.
grant insert on table public.employee_applications to service_role;

grant select, insert, update
on table public.employee_application_email_logs
to service_role;

-- Portfolio removal must not orphan an active employee's portal workspace.
-- Unpublishing is the supported safe alternative.
drop policy if exists "Founder deletes employee portfolios"
on public.employee_portfolios;

revoke delete on table public.employee_portfolios from authenticated;
