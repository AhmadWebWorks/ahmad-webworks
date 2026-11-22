-- Ahmad WebWorks: secure employee portal foundation
-- Additive migration; does not modify or delete existing website files/data.

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'employee' check (role in ('admin','employee')),
  account_status text not null default 'pending' check (account_status in ('pending','active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_portfolios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  full_name text not null default '',
  job_title text not null default '',
  location text not null default '',
  bio text not null default '',
  skills text[] not null default '{}',
  avatar_url text,
  website_url text,
  github_url text,
  linkedin_url text,
  slug text unique,
  review_status text not null default 'draft' check (review_status in ('draft','pending','approved','rejected')),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  project_url text,
  image_url text,
  sort_order integer not null default 0,
  review_status text not null default 'draft' check (review_status in ('draft','pending','approved','rejected')),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_name text not null,
  email text,
  preferred_role text not null,
  location text not null default '',
  skills text[] not null default '{}',
  introduction text not null,
  portfolio_url text,
  status text not null default 'new' check (status in ('new','under_review','approved','rejected')),
  admin_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists employee_portfolios_owner_id_idx on public.employee_portfolios(owner_id);
create index if not exists employee_portfolios_public_idx on public.employee_portfolios(is_published, review_status) where is_published = true;
create index if not exists portfolio_projects_owner_id_idx on public.portfolio_projects(owner_id);
create index if not exists portfolio_projects_public_idx on public.portfolio_projects(owner_id, is_published, review_status) where is_published = true;
create index if not exists employee_applications_status_created_idx on public.employee_applications(status, created_at desc);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.account_status = 'active'
  );
$$;

revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, account_status)
  values (new.id, 'employee', 'pending')
  on conflict (id) do nothing;

  insert into public.employee_portfolios (owner_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (owner_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_aww on auth.users;
create trigger on_auth_user_created_aww
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.guard_employee_portfolio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select private.is_admin()) then
    new.updated_at := now();
    return new;
  end if;

  if auth.uid() is null or auth.uid() <> old.owner_id or new.owner_id <> old.owner_id then
    raise exception 'Not allowed to modify this portfolio';
  end if;

  new.review_status := 'pending';
  new.is_published := false;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_employee_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select private.is_admin()) then
    new.updated_at := now();
    return new;
  end if;

  if auth.uid() is null or auth.uid() <> old.owner_id or new.owner_id <> old.owner_id then
    raise exception 'Not allowed to modify this project';
  end if;

  new.review_status := 'pending';
  new.is_published := false;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select private.is_admin()) then
    new.updated_at := now();
    return new;
  end if;

  if new.role is distinct from old.role
     or new.account_status is distinct from old.account_status then
    raise exception 'Only an admin can change account role or status';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guard_employee_portfolio_update on public.employee_portfolios;
create trigger guard_employee_portfolio_update
before update on public.employee_portfolios
for each row execute function public.guard_employee_portfolio();

drop trigger if exists guard_employee_project_update on public.portfolio_projects;
create trigger guard_employee_project_update
before update on public.portfolio_projects
for each row execute function public.guard_employee_project();

drop trigger if exists guard_profile_privileges_update on public.profiles;
create trigger guard_profile_privileges_update
before update on public.profiles
for each row execute function public.guard_profile_privileges();

alter table public.profiles enable row level security;
alter table public.employee_portfolios enable row level security;
alter table public.portfolio_projects enable row level security;
alter table public.employee_applications enable row level security;

drop policy if exists "Users read own profile or admins read all" on public.profiles;
create policy "Users read own profile or admins read all"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "Admins manage profiles" on public.profiles;
create policy "Admins manage profiles"
on public.profiles for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "Public read approved portfolios" on public.employee_portfolios;
create policy "Public read approved portfolios"
on public.employee_portfolios for select to anon, authenticated
using (
  is_published = true and review_status = 'approved'
  and exists (
    select 1 from public.profiles p
    where p.id = owner_id and p.account_status = 'active'
  )
);

drop policy if exists "Employees read own portfolio" on public.employee_portfolios;
create policy "Employees read own portfolio"
on public.employee_portfolios for select to authenticated
using (owner_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "Employees create own portfolio" on public.employee_portfolios;
create policy "Employees create own portfolio"
on public.employee_portfolios for insert to authenticated
with check (owner_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "Employees update own portfolio" on public.employee_portfolios;
create policy "Employees update own portfolio"
on public.employee_portfolios for update to authenticated
using (owner_id = (select auth.uid()) or (select private.is_admin()))
with check (owner_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "Public read approved projects" on public.portfolio_projects;
create policy "Public read approved projects"
on public.portfolio_projects for select to anon, authenticated
using (
  is_published = true and review_status = 'approved'
  and exists (
    select 1 from public.profiles p
    where p.id = owner_id and p.account_status = 'active'
  )
);

drop policy if exists "Owners and admins read projects" on public.portfolio_projects;
create policy "Owners and admins read projects"
on public.portfolio_projects for select to authenticated
using (owner_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "Employees create own projects" on public.portfolio_projects;
create policy "Employees create own projects"
on public.portfolio_projects for insert to authenticated
with check (owner_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "Employees update own projects" on public.portfolio_projects;
create policy "Employees update own projects"
on public.portfolio_projects for update to authenticated
using (owner_id = (select auth.uid()) or (select private.is_admin()))
with check (owner_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "Employees delete own draft projects" on public.portfolio_projects;
create policy "Employees delete own draft projects"
on public.portfolio_projects for delete to authenticated
using (
  (owner_id = (select auth.uid()) and review_status in ('draft','rejected') and is_published = false)
  or (select private.is_admin())
);

drop policy if exists "Anyone can submit an application" on public.employee_applications;
create policy "Anyone can submit an application"
on public.employee_applications for insert to anon, authenticated
with check (
  length(trim(applicant_name)) between 2 and 100
  and length(trim(preferred_role)) between 2 and 100
  and length(trim(introduction)) between 5 and 3000
);

drop policy if exists "Admins manage applications" on public.employee_applications;
create policy "Admins manage applications"
on public.employee_applications for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

grant select on public.employee_portfolios, public.portfolio_projects to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.employee_portfolios to authenticated;
grant select, insert, update, delete on public.portfolio_projects to authenticated;
grant insert on public.employee_applications to anon, authenticated;
grant select, update, delete on public.employee_applications to authenticated;
