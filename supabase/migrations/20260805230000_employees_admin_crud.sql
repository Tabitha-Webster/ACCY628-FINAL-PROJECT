-- Simple employees directory for Admin CRUD (not Auth accounts).

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

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  title text not null,
  department text not null,
  role text not null check (role in ('admin', 'manager', 'technician', 'billing', 'hr')),
  email text null,
  notes text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employees_full_name_idx on public.employees (full_name);
create index if not exists employees_role_idx on public.employees (role);
create index if not exists employees_is_active_idx on public.employees (is_active);

alter table public.employees enable row level security;

drop policy if exists "Admins can select employees" on public.employees;
create policy "Admins can select employees"
on public.employees
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert employees" on public.employees;
create policy "Admins can insert employees"
on public.employees
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update employees" on public.employees;
create policy "Admins can update employees"
on public.employees
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete employees" on public.employees;
create policy "Admins can delete employees"
on public.employees
for delete
to authenticated
using (public.is_admin());

-- Seed team roster (idempotent by full_name)
insert into public.employees (full_name, title, department, role, email, notes)
select v.full_name, v.title, v.department, v.role, v.email, v.notes
from (
  values
    ('Tabitha Webster', 'System Administrator', 'Finance & Administration', 'admin', 'admin@servicesync.demo', 'Primary admin demo login'),
    ('Emilie Pierson', 'Operations Manager', 'Service Delivery', 'manager', 'manager@servicesync.demo', 'Primary manager demo login'),
    ('Jackson Pecunia', 'Lead Technician', 'Service Delivery', 'technician', 'tech@servicesync.demo', 'Primary technician demo login'),
    ('Lindsay-Kate Williams', 'Billing Specialist', 'Finance & Administration', 'billing', 'billing@servicesync.demo', 'Primary billing demo login'),
    ('Lily Walker', 'HR Manager', 'Finance & Administration', 'hr', 'hr@servicesync.demo', 'Primary HR demo login'),
    ('Mark Ashe', 'Service Desk Technician', 'Help Desk', 'technician', 'tech@servicesync.demo', 'Shares technician demo login'),
    ('Carson Kimble', 'Staff Accountant / AR', 'Finance & Administration', 'billing', 'billing@servicesync.demo', 'Shares billing demo login'),
    ('Evan Bean', 'Account Manager', 'Project Delivery', 'manager', 'manager@servicesync.demo', 'Shares manager demo login')
) as v(full_name, title, department, role, email, notes)
where not exists (
  select 1 from public.employees e where e.full_name = v.full_name
);
