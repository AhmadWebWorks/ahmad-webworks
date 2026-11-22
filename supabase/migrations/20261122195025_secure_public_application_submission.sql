-- Harden employee application intake.
-- Public users must use the narrow RPC rather than direct table INSERT.

create or replace function public.guard_employee_application_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.status := 'new';
  new.admin_notes := null;
  new.reviewed_at := null;
  new.invited_at := null;
  new.invited_user_id := null;
  return new;
end;
$$;

drop trigger if exists guard_employee_application_insert
  on public.employee_applications;

create trigger guard_employee_application_insert
before insert on public.employee_applications
for each row
execute function public.guard_employee_application_insert();

create or replace function public.submit_employee_application(
  p_applicant_name text,
  p_email text,
  p_preferred_role text,
  p_location text default '',
  p_skills text[] default array[]::text[],
  p_introduction text default '',
  p_portfolio_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := pg_catalog.btrim(coalesce(p_applicant_name, ''));
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_role text := pg_catalog.btrim(coalesce(p_preferred_role, ''));
  v_location text := pg_catalog.btrim(coalesce(p_location, ''));
  v_introduction text := pg_catalog.btrim(coalesce(p_introduction, ''));
  v_portfolio text := nullif(pg_catalog.btrim(coalesce(p_portfolio_url, '')), '');
  v_skills text[] := coalesce(p_skills, array[]::text[]);
begin
  if pg_catalog.char_length(v_name) < 2 or pg_catalog.char_length(v_name) > 100 then
    raise exception 'Name must be between 2 and 100 characters.' using errcode = '22023';
  end if;

  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  if pg_catalog.char_length(v_role) < 2 or pg_catalog.char_length(v_role) > 100 then
    raise exception 'Preferred role must be between 2 and 100 characters.' using errcode = '22023';
  end if;

  if pg_catalog.char_length(v_location) > 150 then
    raise exception 'Location must be 150 characters or fewer.' using errcode = '22023';
  end if;

  if pg_catalog.char_length(v_introduction) < 5 or pg_catalog.char_length(v_introduction) > 3000 then
    raise exception 'Introduction must be between 5 and 3000 characters.' using errcode = '22023';
  end if;

  if pg_catalog.cardinality(v_skills) > 30 then
    raise exception 'Please provide no more than 30 skills.' using errcode = '22023';
  end if;

  if v_portfolio is not null and
     (pg_catalog.char_length(v_portfolio) > 2048 or v_portfolio !~* '^https?://') then
    raise exception 'Portfolio link must be a valid HTTP or HTTPS URL.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_email, 0)
  );

  if exists (
    select 1
    from public.employee_applications a
    where pg_catalog.lower(a.email) = v_email
      and a.created_at > pg_catalog.now() - interval '10 minutes'
  ) then
    raise exception 'An application from this email was submitted recently. Please wait 10 minutes before trying again.'
      using errcode = 'P0001';
  end if;

  insert into public.employee_applications (
    applicant_name, email, preferred_role, location,
    skills, introduction, portfolio_url
  )
  values (
    v_name, v_email, v_role, v_location,
    v_skills, v_introduction, v_portfolio
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_employee_application(
  text, text, text, text, text[], text, text
) from public, anon, authenticated;

grant execute on function public.submit_employee_application(
  text, text, text, text, text[], text, text
) to anon, authenticated;

revoke insert on table public.employee_applications from anon, authenticated;
revoke insert (
  id, applicant_name, email, preferred_role, location, skills,
  introduction, portfolio_url, status, admin_notes, created_at,
  reviewed_at, invited_at, invited_user_id
) on table public.employee_applications from anon, authenticated;

drop policy if exists "Anyone can submit an application"
  on public.employee_applications;
