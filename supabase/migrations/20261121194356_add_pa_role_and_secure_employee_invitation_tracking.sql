alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role = any (array['admin'::text, 'pa'::text, 'employee'::text]));

alter table public.employee_applications
  add column if not exists invited_at timestamptz,
  add column if not exists invited_user_id uuid references auth.users(id) on delete set null;

create index if not exists employee_applications_invited_user_id_idx
  on public.employee_applications(invited_user_id);

create or replace function private.is_pa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'pa'
      and p.account_status = 'active'
  );
$function$;

create or replace function private.is_admin_or_pa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'pa')
      and p.account_status = 'active'
  );
$function$;

grant usage on schema private to authenticated;
grant execute on function private.is_pa() to authenticated;
grant execute on function private.is_admin_or_pa() to authenticated;

drop policy if exists "Admins manage applications"
  on public.employee_applications;

create policy "Admins and PA manage applications"
on public.employee_applications
for all
to authenticated
using ((select private.is_admin_or_pa()))
with check ((select private.is_admin_or_pa()));

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user in ('service_role', 'postgres')
     or (select private.is_admin()) then
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
$function$;
