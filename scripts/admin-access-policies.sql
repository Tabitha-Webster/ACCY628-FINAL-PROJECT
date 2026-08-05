-- Run this once in Supabase SQL Editor (ACCY628-FINAL-PROJECT)
-- so the Admin role can view/update all profiles and read audit/HR tables.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- Profiles: admin can see and manage every user
drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
on public.profiles
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Audit logs
do $$
begin
  if to_regclass('public.audit_logs') is not null then
    execute 'alter table public.audit_logs enable row level security';
    execute 'drop policy if exists "Admins can view audit logs" on public.audit_logs';
    execute $p$
      create policy "Admins can view audit logs"
      on public.audit_logs
      for select
      to authenticated
      using (public.is_admin())
    $p$;
  end if;
end $$;

-- HR tables
do $$
declare
  t text;
begin
  foreach t in array array['hr_departments', 'hr_positions', 'hr_contractors']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'Admins can view ' || t, t);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.is_admin())',
        'Admins can view ' || t,
        t
      );
    end if;
  end loop;
end $$;

-- Customers: same list/add/edit access as Manager (fixes empty Admin customer list)
do $$
begin
  if to_regclass('public.customers') is not null then
    execute 'alter table public.customers enable row level security';
    execute 'drop policy if exists customers_select_admin on public.customers';
    execute 'drop policy if exists customers_insert_admin on public.customers';
    execute 'drop policy if exists customers_update_admin on public.customers';
    execute $p$
      create policy customers_select_admin
      on public.customers
      for select
      to authenticated
      using (public.is_admin())
    $p$;
    execute $p$
      create policy customers_insert_admin
      on public.customers
      for insert
      to authenticated
      with check (public.is_admin())
    $p$;
    execute $p$
      create policy customers_update_admin
      on public.customers
      for update
      to authenticated
      using (public.is_admin())
      with check (public.is_admin())
    $p$;
  end if;
end $$;
