alter table public.employee_applications alter column email set not null;
alter table public.employee_applications add constraint employee_applications_email_format_check check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
