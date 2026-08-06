-- Allow executive to view the employees directory (read-only), same as manager/HR.
-- Insert / update / delete remain admin-only.

drop policy if exists "Staff can select employees" on public.employees;

create policy "Staff can select employees"
on public.employees
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'manager', 'hr', 'executive')
  )
);

insert into public.role_page_permissions (role, page_key, can_view)
values
  ('executive', 'employees', true),
  ('manager', 'employees', true),
  ('hr', 'employees', true)
on conflict (role, page_key) do update
set can_view = excluded.can_view,
    updated_at = now();
