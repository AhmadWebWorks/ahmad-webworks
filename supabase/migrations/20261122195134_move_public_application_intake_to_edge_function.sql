revoke all on function public.submit_employee_application(
  text, text, text, text, text[], text, text
) from public, anon, authenticated;

drop function public.submit_employee_application(
  text, text, text, text, text[], text, text
);

create or replace function public.guard_employee_application_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_email text;
begin
  new.applicant_name := pg_catalog.btrim(coalesce(new.applicant_name, ''));
  new.email := pg_catalog.lower(pg_catalog.btrim(coalesce(new.email, '')));
  new.preferred_role := pg_catalog.btrim(coalesce(new.preferred_role, ''));
  new.location := pg_catalog.btrim(coalesce(new.location, ''));
  new.introduction := pg_catalog.btrim(coalesce(new.introduction, ''));

  if pg_catalog.char_length(new.applicant_name) < 2
     or pg_catalog.char_length(new.applicant_name) > 100 then
    raise exception 'Name must be between 2 and 100 characters.' using errcode = '22023';
  end if;

  if new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  if pg_catalog.char_length(new.preferred_role) < 2
     or pg_catalog.char_length(new.preferred_role) > 100 then
    raise exception 'Preferred role must be between 2 and 100 characters.' using errcode = '22023';
  end if;

  if pg_catalog.char_length(new.location) > 150 then
    raise exception 'Location must be 150 characters or fewer.' using errcode = '22023';
  end if;

  if pg_catalog.char_length(new.introduction) < 5
     or pg_catalog.char_length(new.introduction) > 3000 then
    raise exception 'Introduction must be between 5 and 3000 characters.' using errcode = '22023';
  end if;

  if pg_catalog.cardinality(coalesce(new.skills, array[]::text[])) > 30 then
    raise exception 'Please provide no more than 30 skills.' using errcode = '22023';
  end if;

  if new.portfolio_url is not null and
     (pg_catalog.char_length(new.portfolio_url) > 2048
      or new.portfolio_url !~* '^https?://') then
    raise exception 'Portfolio link must be a valid HTTP or HTTPS URL.' using errcode = '22023';
  end if;

  v_email := new.email;
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

  new.status := 'new';
  new.admin_notes := null;
  new.reviewed_at := null;
  new.invited_at := null;
  new.invited_user_id := null;
  return new;
end;
$$;