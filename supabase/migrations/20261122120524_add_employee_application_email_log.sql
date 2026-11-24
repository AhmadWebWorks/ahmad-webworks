create table if not exists public.employee_application_email_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.employee_applications(id) on delete cascade,
  template_id bigint not null,
  recipient_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint employee_application_email_logs_application_template_unique
    unique (application_id, template_id)
);

alter table public.employee_application_email_logs enable row level security;

comment on table public.employee_application_email_logs is
  'Server-side audit log for transactional emails sent for employee applications. Access is restricted to service-role Edge Functions.';
