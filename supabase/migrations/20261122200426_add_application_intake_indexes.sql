create index if not exists employee_applications_email_created_at_idx
  on public.employee_applications (lower(email), created_at desc);

create index if not exists employee_applications_created_at_idx
  on public.employee_applications (created_at desc);
