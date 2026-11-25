
begin;
alter table public.profiles disable trigger guard_profile_privileges_update;
update public.profiles
set role='admin', account_status='active', updated_at=now()
where id='ad4f1fd6-337f-4d85-84da-6ad97fbfef80';
alter table public.profiles enable trigger guard_profile_privileges_update;
commit;
